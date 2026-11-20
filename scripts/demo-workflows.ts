import { db } from "../lib/db";
import { closureErrors, defaultRequirements, type Method } from "../lib/problem-rules";
import { localToday } from "../lib/operations-rules";
import { Temporal } from "@js-temporal/polyfill";
import { queueOverdueReminders } from "../lib/reminders";

// Called only after the demo URL/mode/marker guards in demo-seed.ts.
export async function addDemoWorkflowExamples() {
  const marker = await db.setting.findUniqueOrThrow({ where: { key: "demo-dataset" } });
  const value = marker.value as any;
  if (value.synthetic !== true || value.plant !== "DEMO Plant — fictional")
    throw Error("Refusing to add examples to an unknown database.");
  if ((value.version || 1) < 3) {
    const today = localToday("America/Chicago");
    const day = (offset: number) => Temporal.PlainDate.from(today).add({ days: offset }).toString();
    await db.$transaction(async (tx) => {
      for (const method of ["2D", "4D"] as Method[]) {
        const template = await tx.problem.findUniqueOrThrow({ where: { reference: `${method}-DEMO-001` } });
        const actions = await tx.problemAction.findMany({ where: { problemId: template.id } });
        for (const [suffix, status] of [
          ["002", "In progress"],
          ["003", "Closed"],
        ]) {
          if (await tx.problem.findUnique({ where: { reference: `${method}-DEMO-${suffix}` } })) continue;
          const closed = status === "Closed";
          const answers: Record<string, string> = {
            ...(template.answers as Record<string, string>),
            when: day(-10),
          };
          if (closed) {
            answers.rootCause =
              "DEMO verified cause: the fictional setup reference lacked a repeatable position marker.";
            answers.effectiveness =
              "DEMO verification: 100 of 100 fictional checks passed after the reference marker was standardized.";
            if (method === "4D")
              answers.rootCause2 =
                "DEMO verified second cause: the fictional measurement check lacked a common reference.";
          }
          if (closed)
            for (const field of defaultRequirements(method).fields)
              if (!answers[field]?.trim())
                answers[field] = "DEMO: fictional verification completed for training only.";
          const completed = actions.map((a) => ({ ...a, status: closed ? "Completed" : "In progress" }));
          if (closed && closureErrors(method, answers, completed).length)
            throw Error("Demo closed example does not satisfy its required evidence.");
          const {
            id,
            createdAt,
            updatedAt,
            version,
            requirements,
            media,
            equipmentSnapshot,
            participantIds,
            ...source
          } = template;
          const problem = await tx.problem.create({
            data: {
              ...source,
              participantIds: (participantIds as string[]) || [],
              media: media!,
              equipmentSnapshot: equipmentSnapshot!,
              ...(requirements ? { requirements } : {}),
              reference: `${method}-DEMO-${suffix}`,
              status,
              title: `DEMO ${method} ${closed ? "closed visual setup verification" : "in-progress setup improvement"}`,
              answers,
              dueDate: day(closed ? -3 : -2),
              occurredOn: day(-10),
              closedAt: closed ? new Date() : null,
              history: [
                {
                  at: new Date().toISOString(),
                  action: "Fictional example seeded",
                  status,
                  note: closed
                    ? "All example actions and evidence verified; training only."
                    : "Pilot actions underway; fictional overdue example.",
                },
              ],
            },
          });
          for (const a of completed)
            await tx.problemAction.create({
              data: {
                problemId: problem.id,
                type: a.type,
                title: `${a.title} · ${suffix}`,
                ownerId: a.ownerId,
                dueDate: day(-3),
                status: a.status,
                media: a.media!,
                required: a.required,
                comment: closed
                  ? "DEMO: completed and checked using fictional before/after evidence."
                  : "DEMO: pilot underway; example follow-up overdue.",
                completedAt: closed ? new Date() : null,
                history: [],
              },
            });
        }
      }
      await tx.setting.update({ where: { key: "demo-dataset" }, data: { value: { ...value, version: 3 } } });
    });
  }
  // Uses the real scope/assignee/deduplication rules. Demo channels disable email.
  await queueOverdueReminders();
}
