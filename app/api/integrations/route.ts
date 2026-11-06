import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, jsonBody, failure, HttpError } from "@/lib/security";
import { createIntegrationToken } from "@/lib/integrations";
import { companySqlConfigured } from "@/lib/company-sql";
async function admin() {
  const u = await requireUser();
  if (u.role !== "Admin")
    throw new HttpError(403, "Only Admin can manage integrations");
  return u;
}
export async function GET() {
  try {
    await admin();
    const [sources, bindings, equipment, reasons, health] = await Promise.all([
      db.integrationSource.findMany({
        select: {
          id: true,
          name: true,
          active: true,
          lastReceivedAt: true,
          lastError: true,
          sqlCursor: true,
          createdAt: true,
        },
        orderBy: { name: "asc" },
      }),
      db.machineBinding.findMany({ orderBy: { externalId: "asc" } }),
      db.equipment.findMany({ orderBy: { name: "asc" } }),
      db.downtimeReason.findMany({
        where: { active: true },
        orderBy: { name: "asc" },
      }),
      db.setting.findUnique({ where: { key: "company-sql-health" } }),
    ]);
    return Response.json({
      sources,
      bindings,
      equipment,
      reasons,
      sql: {
        configured: companySqlConfigured(),
        sourceId: process.env.COMPANY_SQL_SOURCE_ID ?? null,
        health: health?.value ?? null,
      },
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    const u = await admin(),
      b = await jsonBody(req);
    if (b.action === "createSource") {
      const name = z.string().trim().min(1).max(100).parse(b.name),
        id = randomUUID(),
        key = createIntegrationToken(id);
      await db.integrationSource.create({
        data: { id, name, tokenHash: key.tokenHash, createdBy: u.id },
      });
      return Response.json({ id, token: key.token });
    }
    const id = z.string().uuid().parse(b.id);
    if (b.action === "sourceState")
      await db.integrationSource.update({
        where: { id },
        data: { active: z.boolean().parse(b.active) },
      });
    else if (b.action === "rotateKey") {
      const key = createIntegrationToken(id);
      await db.integrationSource.update({
        where: { id },
        data: { tokenHash: key.tokenHash },
      });
      return Response.json({ token: key.token });
    } else if (b.action === "bind") {
      const v = z
        .object({
          externalId: z.string().trim().min(1).max(150),
          equipmentId: z.string().uuid(),
          reasonId: z.string().min(1).max(150),
        })
        .parse(b);
      const [source, equipment, reason] = await Promise.all([
        db.integrationSource.findUnique({ where: { id } }),
        db.equipment.findUnique({ where: { id: v.equipmentId } }),
        db.downtimeReason.findUnique({ where: { id: v.reasonId } }),
      ]);
      if (!source || !equipment || !reason?.active)
        throw new HttpError(400, "Choose a source, machine and active reason");
      await db.machineBinding.create({ data: { sourceId: id, ...v } });
    } else if (b.action === "bindingState")
      await db.machineBinding.update({
        where: { id },
        data: { active: z.boolean().parse(b.active) },
      });
    else throw new HttpError(400, "Unknown integration action");
    return Response.json({ ok: true });
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002")
      return Response.json(
        { error: "This machine or external machine ID is already mapped" },
        { status: 409 },
      );
    return failure(e);
  }
}
