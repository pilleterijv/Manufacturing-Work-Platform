import { Prisma } from "@prisma/client";
import {
  createHash,
  timingSafeEqual,
  randomUUID,
  randomBytes,
} from "node:crypto";
import { db } from "./db";
import { machineEventSchema } from "./integration-rules";
import { shiftConfigSchema } from "./operations-rules";
import { HttpError } from "./http-error";
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function createIntegrationToken(id: string) {
  const token = `fw_${id}_${randomBytes(32).toString("hex")}`;
  return { token, tokenHash: hashToken(token) };
}
export async function authenticateIntegration(req: Request) {
  const token = req.headers
    .get("authorization")
    ?.match(/^Bearer (fw_[a-f0-9-]{36}_[a-f0-9]{64})$/)?.[1];
  if (!token) throw new HttpError(401, "Integration authentication required");
  const id = token.split("_")[1],
    source = await db.integrationSource.findUnique({ where: { id } });
  const digest = hashToken(token);
  if (
    !source?.active ||
    source.tokenHash.length !== 64 ||
    !timingSafeEqual(Buffer.from(digest), Buffer.from(source.tokenHash))
  )
    throw new HttpError(401, "Integration key is invalid or disabled");
  return source;
}
export async function ingestMachineEvent(
  sourceId: string,
  raw: unknown,
  expectedHash?: string,
) {
  const event = machineEventSchema.parse(raw),
    at = new Date(event.occurredAt);
  if (+at < Date.now() - 366 * 86400000)
    throw new HttpError(
      400,
      "Live machine events must be within the last 366 days",
    );
  if (+at > Date.now() + 300000)
    throw new HttpError(400, "Machine event is in the future");
  const payloadHash = hashToken(
    JSON.stringify({ ...event, occurredAt: at.toISOString() }),
  );
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "IntegrationSource" WHERE id=${sourceId} FOR UPDATE`;
      const source = await tx.integrationSource.findUnique({
        where: { id: sourceId },
      });
      if (
        !source?.active ||
        (expectedHash && source.tokenHash !== expectedHash)
      )
        throw new HttpError(401, "Integration is disabled or its key changed");
      const previous = await tx.integrationReceipt.findUnique({
        where: { sourceId_eventId: { sourceId, eventId: event.eventId } },
      });
      if (previous) {
        if (previous.payloadHash !== payloadHash)
          throw new HttpError(409, "Event ID was reused with different data");
        return {
          duplicate: true,
          downtimeId: previous.downtimeId,
          outcome: previous.outcome,
        };
      }
      await tx.$queryRaw`SELECT id FROM "MachineBinding" WHERE "sourceId"=${sourceId} AND "externalId"=${event.machineId} FOR UPDATE`;
      const binding = await tx.machineBinding.findUnique({
        where: {
          sourceId_externalId: { sourceId, externalId: event.machineId },
        },
      });
      if (!binding?.active)
        throw new HttpError(
          400,
          "Map and enable this machine before sending events",
        );
      // Recheck the receipt after the machine lock for simultaneous retry requests.
      const replay = await tx.integrationReceipt.findUnique({
        where: { sourceId_eventId: { sourceId, eventId: event.eventId } },
      });
      if (replay) {
        if (replay.payloadHash !== payloadHash)
          throw new HttpError(409, "Event ID was reused with different data");
        return {
          duplicate: true,
          downtimeId: replay.downtimeId,
          outcome: replay.outcome,
        };
      }
      if (binding.lastAt && +at <= +binding.lastAt)
        throw new HttpError(
          409,
          "Machine events must arrive in increasing timestamp order",
        );
      const actor = await tx.user.findUnique({
        where: { id: source.createdBy },
      });
      if (!actor?.active || actor.role !== "Admin")
        throw new HttpError(
          409,
          "Integration owner must be an active Admin account",
        );
      const equipment = await tx.equipment.findUniqueOrThrow({
        where: { id: binding.equipmentId },
      });
      const active = await tx.downtime.findFirst({
        where: { equipmentId: equipment.id, endedAt: null },
      });
      let downtimeId: string | null = null,
        outcome = "No state change";
      if (active && active.externalSourceId !== source.id)
        throw new HttpError(
          409,
          "A manual or different-source timer is already active; resolve it before importing",
        );
      if (event.state === "down") {
        if (active) {
          downtimeId = active.id;
          outcome = "Still down";
        } else {
          const overlap = await tx.downtime.findFirst({
            where: { equipmentId: equipment.id, endedAt: { gt: at } },
          });
          if (overlap)
            throw new HttpError(
              409,
              "Event overlaps previously recorded downtime",
            );
          const [reason, setting] = await Promise.all([
            tx.downtimeReason.findUnique({ where: { id: binding.reasonId } }),
            tx.setting.findUniqueOrThrow({ where: { key: "shifts" } }),
          ]);
          if (!reason?.active)
            throw new HttpError(400, "Enable the mapped downtime reason");
          const d = await tx.downtime.create({
            data: {
              equipmentId: equipment.id,
              equipmentSnapshot: equipment,
              reasonId: reason.id,
              reasonName: reason.name,
              startedAt: at,
              startedBy: source.createdBy,
              shiftConfig: shiftConfigSchema.parse(setting.value),
              externalSourceId: source.id,
              externalSourceName: source.name,
            },
          });
          downtimeId = d.id;
          outcome = "Downtime started";
        }
      } else if (active) {
        if (+at < +active.startedAt)
          throw new HttpError(409, "Stop time precedes the active downtime");
        const result = await tx.downtime.updateMany({
          where: { id: active.id, endedAt: null },
          data: { endedAt: at, stoppedBy: source.createdBy },
        });
        if (!result.count)
          throw new HttpError(
            409,
            "Timer changed while importing; retry the event",
          );
        downtimeId = active.id;
        outcome = "Downtime stopped";
      }
      await tx.machineBinding.update({
        where: { id: binding.id },
        data: {
          lastAt: at,
          lastState: event.state,
          activeDowntimeId: event.state === "down" ? downtimeId : null,
        },
      });
      await tx.integrationReceipt.create({
        data: {
          sourceId,
          eventId: event.eventId,
          payloadHash,
          downtimeId,
          outcome,
        },
      });
      await tx.integrationSource.update({
        where: { id: source.id },
        data: { lastReceivedAt: new Date(), lastError: null },
      });
      return { duplicate: false, downtimeId, outcome };
    },
    { timeout: 15000 },
  );
}

export async function annotateAutomaticTimers<
  T extends {
    equipmentId: string;
    externalSourceId: string | null;
    endedAt: Date | null;
  },
>(events: T[]) {
  const ids = [
    ...new Set(
      events
        .filter((e) => e.externalSourceId && !e.endedAt)
        .map((e) => e.equipmentId),
    ),
  ];
  const bindings = ids.length
    ? await db.$queryRaw<{ equipmentId: string; sourceId: string }[]>(
        Prisma.sql`SELECT b."equipmentId",b."sourceId" FROM "MachineBinding" b JOIN "IntegrationSource" s ON s.id=b."sourceId" WHERE b.active AND s.active AND b."equipmentId" IN (${Prisma.join(ids)})`,
      )
    : [];
  return events.map((e) => ({
    ...e,
    integrationManaged:
      !!e.externalSourceId &&
      !e.endedAt &&
      bindings.some(
        (b) =>
          b.equipmentId === e.equipmentId && b.sourceId === e.externalSourceId,
      ),
  }));
}
