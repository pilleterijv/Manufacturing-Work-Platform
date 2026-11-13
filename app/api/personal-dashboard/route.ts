import { dashboardPreferences } from "@/lib/dashboard-preferences";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  requireUser,
  grants,
  jsonBody,
  failure,
  HttpError,
} from "@/lib/security";
import { equipmentIds, equipmentScope } from "@/lib/location-access";
import { visibleAreas } from "@/lib/area-access";
import { dashboardDepartmentSchema } from "@/lib/floor-rules";
import { localToday, type ShiftConfig } from "@/lib/operations-rules";
import { Prisma } from "@prisma/client";
export async function GET(req: Request) {
  try {
    const u = await requireUser(),
      g = await grants(u),
      ids = await equipmentIds(u),
      all = await db.equipment.findMany({ where: { id: { in: ids } } }),
      departments = [
        ...new Map(
          all.map((e) => [
            JSON.stringify([e.plant, e.department]),
            { plant: e.plant, department: e.department },
          ]),
        ).values(),
      ],
      saved = dashboardDepartmentSchema.safeParse(u.dashboardDepartment),
      department =
        saved.success &&
        saved.data &&
        departments.some(
          (d) =>
            d.plant === saved.data!.plant &&
            d.department === saved.data!.department,
        )
          ? saved.data
          : null;
    const dept = new URL(req.url).searchParams.get("scope") === "department";
    if (
      dept &&
      (!department ||
        !g.includes("dashboard") ||
        !["Admin", "Manager", "DL/TL"].includes(u.role))
    )
      throw new HttpError(403, "Choose an assigned department dashboard first");
    const equipment = dept
        ? all.filter(
            (e) =>
              e.plant === department!.plant &&
              e.department === department!.department,
          )
        : all,
      scope = equipment.map((e) => e.id),
      areas = (await visibleAreas(u)).filter(
        (l) =>
          !dept ||
          (l.plant === department!.plant &&
            l.department === department!.department),
      ),
      setting = await db.setting.findUniqueOrThrow({
        where: { key: "shifts" },
      }),
      today = localToday((setting.value as ShiftConfig).timezone);
    const ideaWhere = {
      equipmentId: { in: scope },
      status: { not: "Completed" },
      ...(!dept
        ? {
            OR: [
              { pilotId: u.id },
              { validatorId: u.id },
              { submitterId: u.id },
              { participants: { some: { userId: u.id } } },
            ],
          }
        : {}),
    };
    const problemWhere = {
      equipmentId: { in: scope },
      status: { not: "Closed" },
      ...(!dept
        ? {
            OR: [
              { ownerId: u.id },
              { reviewerId: u.id },
              {
                actions: {
                  some: { ownerId: u.id, status: { not: "Completed" } },
                },
              },
            ],
          }
        : {}),
    };
    const pmWhere = {
      equipmentId: { in: scope },
      active: true,
      ...(!dept ? { assigneeId: u.id } : {}),
    };
    const defectWhere = {
      equipmentId: { in: scope },
      status: "Open",
      ...(!dept ? { OR: [{ reportedBy: u.id }, { assigneeId: u.id }] } : {}),
    };
    const fiveSWhere = {
      locationId: { in: areas.map((l) => l.id) },
      active: true,
      ...(!dept
        ? {
            OR: [
              { assigneeIds: { array_contains: [u.id] } },
              { assigneeIds: { equals: [] } },
            ],
          }
        : {}),
    };
    const [ideas, problems, maintenance, defects, fiveS, counts] =
      await Promise.all([
        g.includes("ideas")
          ? db.idea.findMany({
              where: ideaWhere,
              orderBy: { dueDate: "asc" },
              take: 100,
            })
          : [],
        g.includes("problems")
          ? db.problem.findMany({
              where: problemWhere,
              include: {
                actions: {
                  where: {
                    status: { not: "Completed" },
                    ...(!dept ? { ownerId: u.id } : {}),
                  },
                  orderBy: { dueDate: "asc" },
                },
              },
              orderBy: { dueDate: "asc" },
              take: 100,
            })
          : [],
        g.includes("maintenance")
          ? db.maintenancePlan.findMany({
              where: pmWhere,
              orderBy: { nextDue: "asc" },
              take: 100,
            })
          : [],
        g.includes("defects")
          ? db.defect.findMany({
              where: defectWhere,
              orderBy: { createdAt: "desc" },
              take: 100,
            })
          : [],
        g.includes("fiveS")
          ? db.fiveSPlan.findMany({
              where: fiveSWhere,
              orderBy: { title: "asc" },
              take: 100,
            })
          : [],
        Promise.all([
          g.includes("ideas") ? db.idea.count({ where: ideaWhere }) : 0,
          g.includes("problems")
            ? db.problem.count({ where: problemWhere })
            : 0,
          g.includes("maintenance")
            ? db.maintenancePlan.count({ where: pmWhere })
            : 0,
          g.includes("defects") ? db.defect.count({ where: defectWhere }) : 0,
          g.includes("fiveS") ? db.fiveSPlan.count({ where: fiveSWhere }) : 0,
        ]),
      ]);
    return Response.json({
      preferences: dashboardPreferences(u.dashboardPreferences),
      ideas,
      problems,
      maintenance,
      defects,
      fiveS,
      counts,
      maintenanceCounts: g.includes("maintenance")
        ? {
            pm: await db.maintenancePlan.count({
              where: { ...pmWhere, kind: "pm" },
            }),
            cil: await db.maintenancePlan.count({
              where: { ...pmWhere, kind: "cil" },
            }),
          }
        : { pm: 0, cil: 0 },
      department,
      departments,
      equipment,
      areas,
      today,
      scope: dept ? "department" : "personal",
      canDepartment:
        g.includes("dashboard") &&
        ["Admin", "Manager", "DL/TL"].includes(u.role),
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    const u = await requireUser(),
      b = await jsonBody(req),
      userId = z.string().uuid().optional().parse(b.userId) ?? u.id;
    if (userId !== u.id && u.role !== "Admin")
      throw new HttpError(
        403,
        "Only Admin can assign another manager's dashboard",
      );
    const department = dashboardDepartmentSchema.parse(b.department);
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
      const target = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (department) {
        if (!["Admin", "Manager", "DL/TL"].includes(target.role))
          throw new HttpError(
            400,
            "Department dashboards are for managers and DL/TLs",
          );
        const equipment = await tx.equipment.findMany({
          where: equipmentScope(target),
          select: { id: true, plant: true, department: true },
        });
        if (
          !equipment.some(
            (e) =>
              e.plant === department.plant &&
              e.department === department.department,
          )
        )
          throw new HttpError(
            403,
            "Dashboard must be within this person's assigned departments",
          );
      }
      await tx.user.update({
        where: { id: userId },
        data: { dashboardDepartment: department ?? Prisma.DbNull },
      });
    });
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
