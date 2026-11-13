import { z } from "zod";
import { db } from "@/lib/db";
import {
  requireUser,
  grants,
  jsonBody,
  failure,
  HttpError,
} from "@/lib/security";
import {
  equipmentIds,
  assertEquipmentAccess,
  eligiblePeople,
  visiblePeople,
} from "@/lib/location-access";
import { ownEvidence } from "@/lib/evidence";
import { defectSchema } from "@/lib/floor-rules";
import {
  maintainxReady,
  maintainxMapping,
  maintainxMappingSchema,
  submitMaintainx,
} from "@/lib/maintainx";
import { readFilters } from "@/lib/filters";
import { paged, streamWorkbook } from "@/lib/excel-stream";
export async function GET(req: Request) {
  try {
    const u = await requireUser("defects"),
      ids = await equipmentIds(u),
      equipment = await db.equipment.findMany({
        where: { id: { in: ids } },
        orderBy: { name: "asc" },
      }),
      { person, search } = readFilters(req.url),
      where = {
        equipmentId: { in: ids },
        AND: [
          ...(person
            ? [{ OR: [{ reportedBy: person }, { assigneeId: person }] }]
            : []),
          ...(search
            ? [
                {
                  OR: [
                    {
                      maintainxId: {
                        contains: search,
                        mode: "insensitive" as const,
                      },
                    },
                    { id: { contains: search, mode: "insensitive" as const } },
                    {
                      equipmentId: {
                        in: equipment
                          .filter((e) =>
                            [e.name, e.plant, e.department, e.area]
                              .join(" ")
                              .toLowerCase()
                              .includes(search.toLowerCase()),
                          )
                          .map((e) => e.id),
                      },
                    },
                    {
                      title: { contains: search, mode: "insensitive" as const },
                    },
                    {
                      description: {
                        contains: search,
                        mode: "insensitive" as const,
                      },
                    },
                  ],
                },
              ]
            : []),
        ],
      };
    if (new URL(req.url).searchParams.get("format") === "xlsx") {
      await requireUser("export");
      return await streamWorkbook(
        "floorwork-defects.xlsx",
        async (book) => {
          const s = book.addWorksheet("Defects");
          await s.addRow([
            "ID",
            "Title",
            "Machine ID",
            "Priority",
            "Status",
            "Reporter ID",
            "Assignee ID",
            "Created UTC",
            "MaintainX status",
            "Work order ID",
            "Description",
            "Evidence JSON",
          ]);
          for await (const d of paged((cursor) =>
            db.defect.findMany({
              where,
              orderBy: { id: "asc" },
              take: 100,
              ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            }),
          ))
            await s.addRow([
              d.id,
              d.title,
              d.equipmentId,
              d.priority,
              d.status,
              d.reportedBy,
              d.assigneeId,
              d.createdAt,
              d.maintainxStatus,
              d.maintainxId,
              d.description,
              JSON.stringify(d.media),
            ]);
        },
        req.signal,
      );
    }
    const p = new URL(req.url).searchParams,
      cursor = z
        .string()
        .uuid()
        .optional()
        .parse(p.get("cursor") || undefined),
      rows = await db.defect.findMany({
        where,
        orderBy: { id: "desc" },
        take: 101,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
    return Response.json({
      defects: rows.slice(0, 100),
      hasMore: rows.length > 100,
      cursor: rows[99]?.id,
      equipment,
      people: await visiblePeople(u, ids),
      canManage: (await grants(u)).includes("manage"),
      maintainxConfigured: maintainxReady(),
      assets: Object.fromEntries(
        Object.entries(await maintainxMapping()).filter(([id]) =>
          ids.includes(id),
        ),
      ),
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    const u = await requireUser("defects"),
      b = await jsonBody(req),
      actorGrants = await grants(u),
      entry = { at: new Date().toISOString(), by: u.id, name: u.name };
    if (b.action === "mapping") {
      if (u.role !== "Admin")
        throw new HttpError(403, "Only Admin can configure MaintainX mappings");
      const assets = maintainxMappingSchema.parse(b.assets);
      if (
        (await db.equipment.count({
          where: { id: { in: Object.keys(assets) } },
        })) !== Object.keys(assets).length
      )
        throw new HttpError(400, "Choose existing machines");
      await db.setting.upsert({
        where: { key: "maintainx-assets" },
        create: { key: "maintainx-assets", value: assets },
        update: { value: assets },
      });
    } else if (b.action === "report") {
      const v = defectSchema.parse(b);
      const d = await db.$transaction(async (tx) => {
        const e = await assertEquipmentAccess(u, v.equipmentId, tx);
        await ownEvidence(u.id, v.media, [], tx);
        return tx.defect.create({
          data: {
            ...v,
            reportedBy: u.id,
            equipmentSnapshot: e,
            history: [{ ...entry, event: "Reported" }],
          },
        });
      });
      return Response.json({ ok: true, id: d.id });
    } else {
      const id = z.string().uuid().parse(b.id);
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Defect" WHERE id=${id} FOR UPDATE`;
        const d = await tx.defect.findUnique({ where: { id } });
        if (!d) throw new HttpError(404, "Defect not found");
        await assertEquipmentAccess(u, d.equipmentId, tx);
        const g = actorGrants;
        if (!(
          g.includes("manage") ||
          d.reportedBy === u.id ||
          d.assigneeId === u.id
        ))
          throw new HttpError(
            403,
            "Only the reporter, assignee or manager can update this defect",
          );
        if (b.action === "update") {
          const v = z
            .object({
              version: z.number().int(),
              status: z.enum(["Open", "Resolved"]),
              assigneeId: z.string().uuid().nullable(),
              comment: z.string().max(2000),
            })
            .parse(b);
          if (v.version !== d.version)
            throw new HttpError(409, "Defect changed; reload");
          if (v.assigneeId !== d.assigneeId && !g.includes("manage"))
            throw new HttpError(403, "Only managers can change assignments");
          if (v.assigneeId)
            await eligiblePeople(d.equipmentId, [v.assigneeId], tx);
          await tx.defect.update({
            where: { id },
            data: {
              status: v.status,
              assigneeId: v.assigneeId,
              version: { increment: 1 },
              history: [...(d.history as any[]), { ...entry, ...v }],
            },
          });
        } else if (b.action === "reconcile") {
          if (u.role !== "Admin")
            throw new HttpError(
              403,
              "Only Admin can reconcile MaintainX submissions",
            );
          if (!["Review required", "Sending"].includes(d.maintainxStatus))
            throw new HttpError(
              409,
              "This submission does not need reconciliation",
            );
          if (
            d.maintainxStatus === "Sending" &&
            d.submissionAt &&
            Date.now() - +d.submissionAt < 120000
          )
            throw new HttpError(409, "Submission is still running");
          const workOrderId = z
            .string()
            .regex(/^\d+$/)
            .nullable()
            .parse(b.workOrderId);
          if (!workOrderId && b.confirmedAbsent !== true)
            throw new HttpError(
              400,
              "Confirm that no matching work order exists before allowing a retry",
            );
          await tx.defect.update({
            where: { id },
            data: {
              maintainxStatus: workOrderId ? "Submitted" : "Not submitted",
              maintainxId: workOrderId,
              submissionError: null,
              history: [
                ...(d.history as any[]),
                { ...entry, event: "MaintainX reconciled", workOrderId },
              ],
            },
          });
        } else if (b.action !== "submit")
          throw new HttpError(400, "Unknown defect action");
      });
      if (b.action === "submit") {
        try {
          await submitMaintainx(id, u);
        } catch (e) {
          if (e instanceof HttpError) throw e;
          throw new HttpError(
            409,
            "Work order submission could not be confirmed. Check the machine mapping and MaintainX before retrying.",
          );
        }
      }
    }
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
