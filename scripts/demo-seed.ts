import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { db } from "../lib/db";
import { hashPassword } from "../lib/passwords";
import { defaults } from "../lib/rules";
import { referenceDepartments, referenceAreas } from "../lib/reference-catalog";
import { plantCrewPreset } from "../lib/crew-rotation";
import { localToday } from "../lib/operations-rules";
import { Temporal } from "@js-temporal/polyfill";
import { storePhoto, storeVideo } from "../lib/storage";
import { queueAssignments } from "../lib/assignment-notifications";
import { validateDemoUrl } from "./demo-config.cjs";

const json = (value: unknown): any => JSON.parse(JSON.stringify(value));
async function seed() {
  validateDemoUrl(process.env.DATABASE_URL!);
  if (process.env.FLOORWORK_DEMO_MODE !== "true") throw Error("Refusing to seed outside explicit demo mode.");
  const marker = await db.setting.findUnique({ where: { key: "demo-dataset" } });
  if ((marker?.value as any)?.synthetic) {
    if (process.env.FLOORWORK_DEMO_PASSWORD) {
      const password = await hashPassword(process.env.FLOORWORK_DEMO_PASSWORD);
      const accounts = (marker!.value as any).accounts as string[];
      const users = await db.user.findMany({ where: { username: { in: accounts } }, select: { id: true } });
      await db.$transaction([
        db.user.updateMany({
          where: { id: { in: users.map((u) => u.id) } },
          data: { password, mustChange: false, version: { increment: 1 } },
        }),
        db.session.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } }),
      ]);
    }
    console.log("Demo examples already exist; preserving your practice edits. Use demo:reset to start over.");
    return;
  }
  if (await db.user.count()) throw Error("Refusing to seed a demo database containing unmarked accounts.");
  const password = process.env.FLOORWORK_DEMO_PASSWORD;
  if (!password) throw Error("Demo setup must generate a new demo password.");
  const hash = await hashPassword(password),
    now = new Date(),
    plant = "DEMO Plant — fictional",
    config = { timezone: "America/Chicago", ...plantCrewPreset() },
    today = localToday(config.timezone),
    day = (offset: number) => Temporal.PlainDate.from(today).add({ days: offset }).toString();
  const imageId = randomUUID(),
    videoId = randomUUID();
  const bytes = await readFile("scripts/demo-assets/equipment.webp");
  const clip = await readFile("scripts/demo-assets/training.mp4");
  await storePhoto(imageId, bytes);
  await storeVideo(videoId, clip, "video/mp4");
  await db.$transaction(
    async (tx) => {
      const users: any[] = [];
      const names = [
        ["admin", "Taylor", "Demo", "Admin"],
        ["operator", "Alex", "Demo", "Operator"],
        ["leader", "Jordan", "Demo", "DL/TL"],
        ["manager", "Morgan", "Demo", "Manager"],
        ["maintenance", "Casey", "Demo", "Operator"],
      ];
      for (const [key, firstName, lastName, role] of names) {
        const access =
          key === "admin"
            ? { mode: "all", locations: [], equipmentIds: [] }
            : {
                mode: "restricted",
                locations: [
                  { plant, department: "Tableting", ...(key === "operator" ? { area: "Compressing" } : {}) },
                ],
                equipmentIds: [],
              };
        users.push(
          await tx.user.create({
            data: {
              username: "demo-" + key,
              firstName,
              lastName,
              name: firstName + " " + lastName,
              role,
              password: hash,
              mustChange: false,
              email: `demo-${key}@example.invalid`,
              workspaceAccess: access,
              dashboardDepartment: ["manager", "admin"].includes(key)
                ? { plant, department: "Tableting" }
                : undefined,
              dashboardPreferences: {
                home: "Overview",
                showQueue: true,
                defaultScope: ["manager", "admin"].includes(key) ? "department" : "personal",
              },
              overdueEmail: false,
            },
          })
        );
      }
      const [admin, operator, leader, manager, maintenance] = users;
      for (const [role, grants] of Object.entries(defaults))
        if (role !== "Admin")
          await tx.policy.update({ where: { role }, data: { grants: [...new Set([...grants, "history"])] } });
      await tx.policy.create({
        data: {
          role: "Demo Maintenance",
          baseRole: "Operator",
          homeProfile: "maintenance",
          grants: ["maintenance", "defects", "centerlines", "work", "problems", "dashboard", "history"],
          description: "Fictional demo maintenance workflow",
        },
      });
      await tx.user.update({ where: { id: maintenance.id }, data: { customRole: "Demo Maintenance" } });
      for (const department of referenceDepartments)
        await tx.location.createMany({
          data: ["", ...referenceAreas[department]].map((area) => ({ plant, department, area, line: "" })),
          skipDuplicates: true,
        });
      await tx.setting.update({ where: { key: "shifts" }, data: { value: config } });
      await tx.setting.upsert({
        where: { key: "overdue-channels" },
        create: { key: "overdue-channels", value: { inApp: true, email: false } },
        update: { value: { inApp: true, email: false } },
      });
      const equipment: any[] = [];
      for (const [department, area, name] of [
        ["Tableting", "Compressing", "DEMO tablet press 01"],
        ["Tableting", "Coating", "DEMO coater 01"],
        ["Tableting", "Bin Blending", "DEMO blender 01"],
        ["Packaging", "Line 1", "DEMO packaging line 01"],
        ["Gummies", "Mogul", "DEMO mogul 01"],
        ["Softgel", "Gelmaking", "DEMO gel tank 01"],
      ])
        equipment.push(await tx.equipment.create({ data: { plant, department, area, name, line: "" } }));
      const press = equipment[0],
        media = [{ id: imageId, kind: "photo", caption: "Synthetic example evidence" }],
        video = [{ id: videoId, kind: "video", caption: "Two-second fictional training clip" }];
      await tx.photo.create({ data: { id: imageId, userId: admin.id } });
      await tx.guideMedia.create({
        data: { id: videoId, userId: admin.id, mime: "video/mp4", bytes: clip.length },
      });
      const instructions = [
        { id: randomUUID(), text: "Confirm the example station identity (demo only)", photo: false },
        { id: randomUUID(), text: "Record the fictional visual check", photo: true },
      ];
      const standards: any[] = [];
      for (const [workflow, kind, title, person] of [
        ["process", "run", "DEMO operator startup", operator],
        ["leader", "audit", "DEMO DL/TL shift review", leader],
        ["process", "audit", "DEMO process verification", leader],
        ["changeover", "run", "DEMO product changeover", operator],
      ] as any[]) {
        const s = await tx.standard.create({
          data: {
            family: randomUUID(),
            created: new Date(+now - 14 * 86400000),
            revision: 1,
            title,
            equipmentId: press.id,
            target: 45,
            tolerance: 5,
            kind,
            workflow,
            assigneeIds: [person.id],
            steps: instructions,
          },
        });
        standards.push(s);
        for (let i = 0; i < 6; i++)
          await tx.record.create({
            data: {
              kind,
              userId: person.id,
              standardId: s.id,
              created: new Date(+now - (i + 1) * 86400000),
              data: {
                equipmentId: press.id,
                snapshot: json({ ...s, equipment: press }),
                started: new Date(+now - (i + 1) * 86400000 - 45000).toISOString(),
                durationSeconds: 40 + i,
                followUp: i === 2,
                responses: instructions.map((step, j) => ({
                  stepId: step.id,
                  answer: i !== 2,
                  photo: j === 1 ? imageId : null,
                  comment:
                    i === 2
                      ? "Example observation; review with the demo leader."
                      : "Fictional check completed",
                })),
                cycles: [{ element: "Example cycle", seconds: 40 + i, at: now.toISOString() }],
                ...(workflow === "changeover"
                  ? {
                      changeover: {
                        fromProduct: "DEMO product A",
                        toProduct: "DEMO product B",
                        type: "Minor",
                        notes: "Fictional changeover example",
                      },
                    }
                  : {}),
                ...(workflow === "leader"
                  ? {
                      handoff: {
                        shift: "Day",
                        notes: "Example handoff: review the fictional press observation.",
                        rooms: [],
                      },
                    }
                  : {}),
              },
            },
          });
      }
      await tx.workSchedule.create({
        data: {
          family: standards[0].family,
          title: standards[0].title,
          equipmentId: press.id,
          kind: "run",
          assigneeIds: [operator.id],
          managerIds: [manager.id],
          shiftNames: ["Day", "Night"],
          weekdays: [0, 1, 2, 3, 4, 5, 6],
          config,
          createdBy: admin.id,
          effectiveFrom: new Date(+now - 3 * 86400000),
          checkedThrough: new Date(+now - 86400000),
          notifyEmail: false,
        },
      });
      for (let i = 0; i < 4; i++)
        await tx.record.create({
          data: {
            kind: "study",
            userId: operator.id,
            created: new Date(+now - i * 86400000),
            data: {
              title: "DEMO label-case time study",
              equipmentId: press.id,
              equipmentSnapshot: press,
              cycles: [
                { element: "Position case", seconds: 8 + i, at: now.toISOString() },
                { element: "Apply label", seconds: 12 + i, at: now.toISOString() },
                { element: "Inspect label", seconds: 6, at: now.toISOString() },
              ],
              notes: "Synthetic timing observations",
            },
          },
        });
      const reason = await tx.downtimeReason.upsert({
        where: { name: "DEMO material wait" },
        create: { name: "DEMO material wait" },
        update: {},
      });
      for (let i = 0; i < 8; i++)
        await tx.downtime.create({
          data: {
            equipmentId: press.id,
            reasonId: reason.id,
            reasonName: reason.name,
            equipmentSnapshot: press,
            shiftConfig: config,
            startedAt: new Date(+now - (i + 1) * 3600000),
            endedAt: i === 0 ? null : new Date(+now - (i + 1) * 3600000 + (12 + i) * 60000),
            startedBy: operator.id,
            stoppedBy: i === 0 ? null : leader.id,
          },
        });
      for (const kind of ["pm", "cil"]) {
        const plan = await tx.maintenancePlan.create({
          data: {
            title: kind === "pm" ? "DEMO weekly press inspection" : "DEMO clean and inspect press",
            equipmentId: press.id,
            assigneeId: kind === "pm" ? maintenance.id : operator.id,
            kind,
            steps: instructions,
            intervalDays: 7,
            nextDue: day(kind === "pm" ? -1 : 0),
            createdBy: admin.id,
            history: [],
          },
        });
        await tx.record.create({
          data: {
            kind,
            userId: plan.assigneeId,
            created: new Date(+now - 7 * 86400000),
            data: {
              title: plan.title,
              equipmentId: press.id,
              equipmentSnapshot: press,
              planId: plan.id,
              planSnapshot: plan,
              scheduledDue: day(-7),
              responses: instructions.map((s) => ({
                stepId: s.id,
                answer: true,
                comment: "Synthetic completed check",
                media,
              })),
              media,
            },
          },
        });
        await queueAssignments(tx, {
          type: "maintenance",
          id: plan.id,
          equipmentId: press.id,
          assignees: [plan.assigneeId],
          revision: 1,
        });
      }
      const location = await tx.location.findFirstOrThrow({
          where: { plant, department: "Tableting", area: "Compressing" },
        }),
        questions = ["Sort", "Set in order", "Shine", "Standardize", "Sustain"].map((text, i) => ({
          id: randomUUID(),
          pillar: text,
          text: `DEMO ${text} question`,
          photo: i === 2,
        }));
      const five = await tx.fiveSPlan.create({
        data: {
          locationId: location.id,
          title: "DEMO Compressing 5S audit",
          questions,
          assigneeIds: [leader.id, operator.id],
          createdBy: admin.id,
          history: [],
        },
      });
      for (let i = 0; i < 3; i++)
        await tx.fiveSAudit.create({
          data: {
            planId: five.id,
            locationId: location.id,
            userId: leader.id,
            snapshot: five,
            responses: questions.map((q) => ({
              questionId: q.id,
              score: 3,
              comment: "Fictional 5S evidence",
              media: q.photo ? media : [],
            })),
            media,
            score: 15,
            maximum: 25,
            createdAt: new Date(+now - i * 86400000),
          },
        });
      const parameter = {
        id: randomUUID(),
        name: "DEMO speed setting",
        kind: "numeric",
        unit: "demo units/min",
        target: 50,
        lower: 45,
        upper: 55,
        expected: "",
        instructions: "Illustrative limits only; not approved machine settings.",
        photo: false,
      };
      const centerline = await tx.centerline.create({
        data: {
          title: "DEMO press centerline",
          equipmentId: press.id,
          setup: "Fictional setup A",
          parameters: [parameter],
          notes: "Synthetic limits only",
          createdBy: admin.id,
        },
      });
      for (const actual of [50, 53, 57])
        await tx.record.create({
          data: {
            kind: "centerline",
            userId: operator.id,
            data: {
              title: centerline.title,
              centerlineId: centerline.id,
              equipmentId: press.id,
              equipmentSnapshot: press,
              centerlineSnapshot: json(centerline),
              context: "DEMO product A",
              responses: [
                {
                  parameterId: parameter.id,
                  actual: String(actual),
                  value: actual,
                  withinLimits: actual <= 55,
                  comment:
                    actual > 55
                      ? "Synthetic out-of-limit example; no real equipment action."
                      : "Fictional normal reading",
                  media,
                },
              ],
              media,
              followUp: actual > 55,
            },
          },
        });
      for (const [index, status] of ["Open", "Piloting", "Validation", "Completed"].entries()) {
        const idea = await tx.idea.create({
          data: {
            title: [
              "DEMO shadow-board labels",
              "DEMO material staging markers",
              "DEMO changeover cart",
              "DEMO visual handoff board",
            ][index],
            equipmentId: press.id,
            equipmentSnapshot: press,
            currentState: "Fictional searching/walking opportunity observed in the demo plant.",
            proposal: "Test a visual location standard in the demo workflow.",
            process: "DEMO continuous improvement",
            dueDate: day(index === 0 ? -2 : 3 + index),
            status,
            createdBy: operator.id,
            submitterId: operator.id,
            pilotId: operator.id,
            validatorId: index === 2 ? admin.id : manager.id,
            media,
            participants: { create: [{ userId: leader.id }] },
          },
        });
        if (status !== "Completed")
          await tx.notification.create({
            data: {
              userId: operator.id,
              ideaId: idea.id,
              message: "DEMO: you are the pilot for " + idea.title + ". This is fictional practice data.",
            },
          });
      }
      for (const method of ["2D", "4D", "8D"]) {
        const problem = await tx.problem.create({
          data: {
            reference: `${method}-DEMO-001`,
            method,
            title: `DEMO ${method} label variation investigation`,
            equipmentId: press.id,
            equipmentSnapshot: press,
            occurredOn: today,
            reportedBy: operator.name,
            ownerId: leader.id,
            reviewerId: method === "2D" ? admin.id : manager.id,
            team: "DEMO team — fictional people only",
            dueDate: day(method === "2D" ? -1 : 7),
            answers: {
              problem: "DEMO: five of 100 fictional labels were offset during an example startup.",
              who: "DEMO operators on the fictional press",
              what: "Fictional label offset",
              when: today,
              where: "DEMO Plant / Tableting / Compressing",
              howMuch: "5 of 100 synthetic examples",
              standardExists: "Yes",
              standardClear: "No",
              trained: "Yes",
              facilitatorDepartment: "Tableting",
              rootCause:
                "DEMO hypothesis: the fictional guide reference was not standardized. Verification is pending.",
              correction: "DEMO: segregate the fictional affected batch for practice review.",
              corrective: "DEMO: test an example reference marker in the isolated workflow.",
              preventive: "DEMO: review the fictional setup checklist after the pilot.",
              effectiveness: "DEMO: compare example data before and after; no real production claim.",
              recognition: "DEMO team only",
              severity: "2",
              occurrence: "2",
              sponsor: manager.name,
              sku: "DEMO-SKU-001",
              nccapa: "DEMO-NC-001",
              ...Object.fromEntries(
                [1, 2, 3, 4, 5].map((i) => [
                  `why${i}`,
                  `DEMO Why ${i}: fictional setup-reference hypothesis ${i}; not a verified plant cause.`,
                ])
              ),
              ...(method === "4D"
                ? {
                    secondRootCauseEnabled: "Yes",
                    rootCause2: "DEMO second hypothesis: fictional measurement method varies.",
                    ...Object.fromEntries(
                      [1, 2, 3, 4, 5].map((i) => [
                        `why${i}b`,
                        `DEMO second-path Why ${i}: fictional measurement hypothesis.`,
                      ])
                    ),
                  }
                : {}),
            },
            createdBy: leader.id,
            history: [],
            media,
          },
        });
        for (const [i, type] of ["Containment", "Corrective", "Preventive"].entries()) {
          const a = await tx.problemAction.create({
            data: {
              problemId: problem.id,
              type,
              title: `DEMO ${type.toLowerCase()} action — ${method}`,
              ownerId: i === 0 ? operator.id : maintenance.id,
              dueDate: day(i === 0 ? -1 : i + 2),
              history: [],
              media,
            },
          });
          await queueAssignments(tx, {
            type: "action",
            id: a.id,
            equipmentId: press.id,
            assignees: [a.ownerId],
            revision: 1,
          });
        }
        await queueAssignments(tx, {
          type: "problem",
          id: problem.id,
          equipmentId: press.id,
          assignees: [leader.id, manager.id],
          revision: 1,
        });
      }
      for (const [i, status] of ["Open", "Open", "Resolved"].entries())
        await tx.defect.create({
          data: {
            equipmentId: press.id,
            title: ["DEMO worn label guide", "DEMO loose visual marker", "DEMO replaced inspection label"][i],
            description: "Fictional defect for navigation practice. Not a real equipment condition.",
            priority: i === 0 ? "High" : "Low",
            status,
            reportedBy: operator.id,
            assigneeId: maintenance.id,
            equipmentSnapshot: press,
            media,
            history: [],
            maintainxStatus: i === 2 ? "Submitted" : "Not submitted",
            maintainxId: i === 2 ? "90001" : null,
          },
        });
      for (const kind of ["guide", "video"])
        await tx.content.create({
          data: {
            kind,
            title:
              kind === "guide" ? "DEMO visual troubleshooting guide" : "DEMO device-uploaded training video",
            equipmentId: press.id,
            body: "Fictional demonstration only. This is not an approved operating or repair procedure. Use the sample picture/video to test navigation and media playback.",
            media: kind === "guide" ? [...media, ...video] : video,
            createdBy: admin.id,
          },
        });
      const source = await tx.integrationSource.create({
        data: {
          name: "DEMO TrakSYS / Excel source — DISCONNECTED",
          tokenHash: randomUUID(),
          active: false,
          createdBy: admin.id,
          lastError: "Demo mode: no company connection is configured.",
        },
      });
      await tx.machineBinding.create({
        data: {
          sourceId: source.id,
          externalId: "DEMO-PRESS-01",
          equipmentId: press.id,
          reasonId: reason.id,
          active: false,
        },
      });
      const excelSource = await tx.integrationSource.create({
        data: {
          name: "DEMO local Excel examples — no live connection",
          tokenHash: randomUUID(),
          active: true,
          createdBy: admin.id,
        },
      });
      const feed = await tx.externalFeed.create({
        data: {
          sourceId: excelSource.id,
          name: "DEMO Excel production results",
          section: "Production results",
          active: true,
          mode: "api",
          lastImportedAt: now,
        },
      });
      for (let i = 0; i < 7; i++) {
        const row = await tx.externalRow.create({
          data: {
            feedId: feed.id,
            externalId: "DEMO-BATCH-" + (i + 1),
            equipmentId: press.id,
            personId: operator.id,
            title: "DEMO batch " + (i + 1),
            details: "Synthetic Excel-style production result",
            occurredAt: new Date(+now - i * 86400000),
            values: { goodUnits: 12000 + i * 200, rejectUnits: 40 + i * 5, targetUnits: 15000 },
          },
        });
        await tx.externalRevision.create({ data: { rowId: row.id, snapshot: json(row) } });
      }
      await tx.registrationRequest.create({
        data: {
          username: "demo-new-starter",
          firstName: "Sam",
          lastName: "Demo",
          name: "Sam Demo",
          email: "demo-new-starter@example.invalid",
          department: "Tableting",
          reason: "Fictional account request for administrator practice",
        },
      });
      await tx.setting.create({
        data: {
          key: "demo-dataset",
          value: {
            synthetic: true,
            version: 1,
            seededAt: now.toISOString(),
            accounts: users.map((u) => u.username),
            plant,
          },
        },
      });
    },
    { timeout: 120000, maxWait: 10000 }
  );
  console.log(
    "Fictional examples seeded across all application sections. No live company system was contacted."
  );
}
seed()
  .catch(() => {
    console.error(
      "Demo data could not be prepared. Check the local demo database and rerun demo:setup; the operational database is not a seed target."
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
