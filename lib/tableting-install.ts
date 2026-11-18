import { createHash, randomUUID } from "node:crypto";
import { db } from "./db";
import templates from "./data/tableting-leader-templates.json";
import { referenceAreas, referenceDepartments } from "./reference-catalog";
import { HttpError } from "./security";

// Explicit Admin installation for a chosen site; never run against every site at startup.
export async function installTableting(plant: string, userId: string) {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7543922)`;
      const existing = await tx.location.findMany({
        where: { plant: { equals: plant, mode: "insensitive" } },
      });
      const site = existing[0]?.plant || plant;
      const canonicalDepartment = (name: string) =>
        existing.find(
          (l) =>
            l.department.toLowerCase() === name.toLowerCase() ||
            (name === "Maintenance/Facilities" &&
              l.department.toLowerCase() === "maintenance"),
        )?.department || name;
      const rows = referenceDepartments.flatMap((department) =>
        ["", ...referenceAreas[department]].map((area) => ({
          plant: site,
          department: canonicalDepartment(department),
          area:
            existing.find(
              (l) =>
                l.department === canonicalDepartment(department) &&
                l.area.toLowerCase() === area.toLowerCase() &&
                !l.line,
            )?.area || area,
          line: "",
        })),
      );
      await tx.location.createMany({ data: rows, skipDuplicates: true });
      if (
        await tx.location.findFirst({
          where: {
            plant: site,
            department: canonicalDepartment("Tableting"),
            area: "",
            line: "",
            active: false,
          },
        })
      )
        throw new HttpError(
          409,
          "The Tableting department is inactive. Review Locations before installing.",
        );
      const installed: string[] = [],
        retained: string[] = [];
      for (const template of templates) {
        const marker =
          "tableting-leader-import:" +
          createHash("sha256")
            .update(site.toLowerCase() + ":" + template.key)
            .digest("hex");
        if (await tx.setting.findUnique({ where: { key: marker } })) {
          retained.push(template.title);
          continue;
        }
        const location = await tx.location.findFirstOrThrow({
          where: {
            plant: site,
            department: canonicalDepartment("Tableting"),
            area: { equals: template.area, mode: "insensitive" },
            line: "",
          },
        });
        if (!location.active)
          throw new HttpError(
            409,
            "A required Tableting area is inactive. Review Locations before installing.",
          );
        // Area work point, explicitly labelled to distinguish it from physical machinery.
        const name = "DL/TL area checklist — " + template.area;
        const equipment =
          (await tx.equipment.findFirst({
            where: {
              plant: site,
              department: location.department,
              area: location.area,
              line: "",
              name,
            },
          })) ||
          (await tx.equipment.create({
            data: {
              name,
              plant: site,
              department: location.department,
              area: location.area,
              line: "",
            },
          }));
        const prior = await tx.standard.findFirst({
          where: {
            equipmentId: equipment.id,
            title: template.title,
            workflow: "leader",
          },
          orderBy: { revision: "desc" },
        });
        const standard =
          prior ||
          (await tx.standard.create({
            data: {
              family: randomUUID(),
              revision: 1,
              kind: "audit",
              workflow: "leader",
              handoffProfile: template.key,
              title: template.title,
              equipmentId: equipment.id,
              target: 1,
              tolerance: 0,
              steps: template.steps,
              assigneeIds: [],
            },
          }));
        await tx.setting.create({
          data: {
            key: marker,
            value: {
              family: standard.family,
              standardId: standard.id,
              source: template.source,
              importedBy: userId,
              importedAt: new Date().toISOString(),
            },
          },
        });
        (prior ? retained : installed).push(template.title);
      }
      return { installed, retained, plant: site };
    },
    { timeout: 20000 },
  );
}
