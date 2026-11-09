import { db } from "@/lib/db";
import { requireUser, jsonBody, failure, HttpError } from "@/lib/security";
import { equipmentIds } from "@/lib/location-access";
import { readFilters } from "@/lib/filters";
import { feedSections, feedCapabilities } from "@/lib/external-rules";
import { z } from "zod";
export async function GET(req: Request) {
  try {
    const u = await requireUser(),
      ids = await equipmentIds(u),
      p = new URL(req.url).searchParams,
      { person, search } = readFilters(req.url),
      section = z.enum(feedSections).parse(p.get("section") ?? "Overview");
    if (feedCapabilities[section])
      await requireUser(feedCapabilities[section] as any);
    const feeds = await db.externalFeed.findMany({
      where: { section, active: true },
      select: {
        id: true,
        name: true,
        lastImportedAt: true,
        lastError: true,
        sourceId: true,
        mode: true,
      },
    });
    const sources = await db.integrationSource.findMany({
      where: { active: true },
      select: { id: true, name: true },
    });
    const enabled = feeds.filter((f) =>
      sources.some((s) => s.id === f.sourceId),
    );
    const cursor = z
      .string()
      .uuid()
      .optional()
      .parse(p.get("cursor") || undefined);
    const rows = await db.externalRow.findMany({
      where: {
        feedId: { in: enabled.map((f) => f.id) },
        equipmentId: { in: ids },
        ...(person ? { personId: person } : {}),
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: "insensitive" } },
                { details: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { id: "asc" },
      take: 101,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return Response.json({
      feeds: enabled,
      items: rows.slice(0, 100),
      cursor: rows[99]?.id ?? null,
      hasMore: rows.length > 100,
      ...(u.role === "Admin" ? { sources } : {}),
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    const u = await requireUser();
    if (u.role !== "Admin")
      throw new HttpError(403, "Only Admin can configure external feeds");
    const b = await jsonBody(req);
    if (b.action === "create") {
      const v = z
        .object({
          name: z.string().trim().min(1).max(150),
          section: z.enum(feedSections),
          sourceId: z.string().uuid(),
          mode: z.enum(["api", "excel"]).default("api"),
        })
        .parse(b);
      if (
        !(await db.integrationSource.findFirst({
          where: { id: v.sourceId, active: true },
        }))
      )
        throw new HttpError(400, "Create an active integration source first");
      const feed = await db.externalFeed.create({ data: v });
      return Response.json({ id: feed.id });
    }
    if (b.action === "toggle") {
      const v = z
        .object({ id: z.string().uuid(), active: z.boolean() })
        .parse(b);
      await db.externalFeed.update({
        where: { id: v.id },
        data: { active: v.active },
      });
      return Response.json({ ok: true });
    }
    throw new HttpError(400, "Unknown feed action");
  } catch (e) {
    return failure(e);
  }
}
