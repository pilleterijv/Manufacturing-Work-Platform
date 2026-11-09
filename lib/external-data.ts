import { isDeepStrictEqual } from "node:util";
import { db } from "./db";
import { Prisma } from "@prisma/client";
import { externalRowSchema } from "./external-rules";
import { HttpError } from "./http-error";
export async function ingestExternalRows(
  feedId: string,
  rows: unknown[],
  sourceHash?: string,
  allowedIds?: string[],
  sequence?: string,
) {
  if (rows.length > 1000)
    throw new HttpError(400, "Import at most 1000 rows per batch");
  const parsed = rows.map((r) => externalRowSchema.parse(r));
  if (new Set(parsed.map((r) => r.externalId)).size !== parsed.length)
    throw new HttpError(400, "External IDs must be unique within a batch");
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ExternalFeed" WHERE id=${feedId} FOR UPDATE`;
      const feed = await tx.externalFeed.findUnique({ where: { id: feedId } });
      if (!feed?.active) throw new HttpError(403, "Feed is disabled");
      if (sequence) {
        if (
          !/^[1-9][0-9]{0,18}$/.test(sequence) ||
          BigInt(sequence) > 9223372036854775807n
        )
          throw new HttpError(400, "Invalid committed event sequence");
      }
      await tx.$queryRaw`SELECT id FROM "IntegrationSource" WHERE id=${feed.sourceId} FOR SHARE`;
      const source = await tx.integrationSource.findUnique({
        where: { id: feed.sourceId },
      });
      if (!source?.active || (sourceHash && source.tokenHash !== sourceHash))
        throw new HttpError(401, "Source disabled or key changed");
      if (sequence && BigInt(sequence) <= BigInt(feed.cursor))
        return { imported: 0 };
      for (const r of parsed) {
        if (allowedIds && !allowedIds.includes(r.equipmentId))
          throw new HttpError(
            403,
            "Workbook contains equipment outside your assigned locations",
          );
        if (!(await tx.equipment.findUnique({ where: { id: r.equipmentId } })))
          throw new HttpError(
            400,
            "Map external equipment IDs to the app equipment catalog first",
          );
        if (
          r.personId &&
          !(await tx.user.findUnique({ where: { id: r.personId } }))
        )
          throw new HttpError(
            400,
            "Map external people IDs to app accounts first",
          );
        const old = await tx.externalRow.findUnique({
          where: { feedId_externalId: { feedId, externalId: r.externalId } },
        });
        if (old && allowedIds && !allowedIds.includes(old.equipmentId))
          throw new HttpError(
            403,
            "This external ID belongs to equipment outside your assignments",
          );
        const snapshot = {
          ...r,
          occurredAt: new Date(r.occurredAt).toISOString(),
        };
        if (
          old &&
          isDeepStrictEqual(
            {
              externalId: old.externalId,
              equipmentId: old.equipmentId,
              personId: old.personId,
              title: old.title,
              details: old.details,
              occurredAt: old.occurredAt.toISOString(),
              values: old.values,
            },
            snapshot,
          )
        )
          continue;
        const row = await tx.externalRow.upsert({
          where: { feedId_externalId: { feedId, externalId: r.externalId } },
          create: {
            feedId,
            ...r,
            occurredAt: new Date(r.occurredAt),
            values: r.values as Prisma.InputJsonObject,
          },
          update: {
            ...r,
            occurredAt: new Date(r.occurredAt),
            values: r.values as Prisma.InputJsonObject,
          },
        });
        await tx.externalRevision.create({
          data: { rowId: row.id, snapshot: snapshot as Prisma.InputJsonObject },
        });
      }
      await tx.externalFeed.update({
        where: { id: feedId },
        data: {
          lastImportedAt: new Date(),
          lastError: null,
          ...(sequence ? { cursor: sequence } : {}),
        },
      });
      return { imported: parsed.length };
    },
    { timeout: 30000 },
  );
}
