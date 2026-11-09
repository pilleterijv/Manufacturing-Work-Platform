import { db } from "@/lib/db";
import {
  grants,
  requireUser,
  jsonBody,
  failure,
  HttpError,
  limit,
} from "@/lib/security";
import { equipmentIds } from "@/lib/location-access";
import { readFilters } from "@/lib/filters";
import { queueOverdueReminders, reminderConfig } from "@/lib/reminders";
import { z } from "zod";
export async function GET(req: Request) {
  try {
    const u = await requireUser(),
      ids = await equipmentIds(u),
      { person, search } = readFilters(req.url);
    const g = await grants(u);
    const types = [
      ...(g.includes("ideas") ? ["idea"] : []),
      ...(g.includes("problems") ? ["problem", "action"] : []),
      ...(g.includes("maintenance") ? ["pm"] : []),
    ];
    const rows = await db.reminder.findMany({
      where: {
        equipmentId: { in: ids },
        entityType: { in: types },
        ...(["Admin", "Manager", "DL/TL"].includes(u.role)
          ? person
            ? { userId: person }
            : {}
          : { userId: u.id }),
        ...(search
          ? { message: { contains: search, mode: "insensitive" } }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return Response.json({
      items: rows,
      channels: await reminderConfig(),
      personal: { inApp: u.overdueInApp, email: u.overdueEmail },
      canSend: ["Admin", "Manager", "DL/TL"].includes(u.role),
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    const u = await requireUser(),
      b = await jsonBody(req);
    if (b.action === "preferences") {
      const v = z.object({ inApp: z.boolean(), email: z.boolean() }).parse(b);
      await db.user.update({
        where: { id: u.id },
        data: { overdueInApp: v.inApp, overdueEmail: v.email },
      });
      return Response.json({ ok: true });
    }
    if (b.action === "channels") {
      if (u.role !== "Admin")
        throw new HttpError(
          403,
          "Only Admin can configure company notification channels",
        );
      const value = z
        .object({ inApp: z.boolean(), email: z.boolean() })
        .parse(b);
      await db.setting.upsert({
        where: { key: "overdue-channels" },
        create: { key: "overdue-channels", value },
        update: { value },
      });
      return Response.json({ ok: true });
    }
    if (b.action === "send") {
      if (!["Admin", "Manager", "DL/TL"].includes(u.role))
        throw new HttpError(
          403,
          "Only department managers and supervisors can send department reminders",
        );
      await limit("reminders:" + u.id, 10, 3600);
      const person = z
        .string()
        .uuid()
        .optional()
        .parse(b.person || undefined);
      return Response.json(await queueOverdueReminders(u, person));
    }
    throw new HttpError(400, "Unknown reminder action");
  } catch (e) {
    return failure(e);
  }
}
