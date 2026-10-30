require("tsx/cjs");
require("dotenv").config({ quiet: true });
const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  { randomUUID } = require("node:crypto"),
  Excel = require("exceljs");
const { db } = require("../lib/db.ts"),
  { hashPassword } = require("../lib/security.ts");
const origin = process.env.APP_URL || "http://localhost:3000",
  suffix = randomUUID().slice(0, 8),
  password = `Private test ${randomUUID()}!`;
const users = [],
  equipment = [],
  standardIds = [],
  contentIds = [],
  reasonIds = [];
let browser, originalConfig, originalManager;
async function post(context, body) {
  const r = await context.request.post(origin + "/api/operations", {
    data: body,
    headers: { Origin: origin },
  });
  return { status: r.status(), body: await r.json() };
}
async function get(context, path = "/api/operations") {
  const r = await context.request.get(origin + path);
  return { status: r.status(), body: await r.json() };
}
async function login(user) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    timezoneId: "America/Chicago",
  });
  const r = await context.request.post(origin + "/api/account", {
    data: {
      action: "login",
      username: user.username,
      password,
      remember: false,
    },
    headers: { Origin: origin },
  });
  assert.equal(r.status(), 200);
  return context;
}
async function main() {
  assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
  originalConfig = (await db.setting.findUnique({ where: { key: "shifts" } }))
    .value;
  originalManager = (await db.policy.findUnique({ where: { role: "Manager" } }))
    .grants;
  const hash = await hashPassword(password);
  for (const [role, name] of [
    ["Admin", "Avery Admin"],
    ["Manager", "Morgan Pilot"],
    ["DL/TL", "Taylor Validator"],
    ["Operator", "Alex Operator"],
  ])
    users.push(
      await db.user.create({
        data: {
          username: "ops-" + role.replace("/", "").toLowerCase() + "-" + suffix,
          name,
          role,
          password: hash,
          mustChange: false,
        },
      }),
    );
  for (const [name, department] of [
    ["Packing station 02", "Assembly " + suffix],
    ["Machining cell 01", "Machining " + suffix],
    ["Shift boundary station", "Shift reporting " + suffix],
  ])
    equipment.push(
      await db.equipment.create({
        data: {
          name,
          department,
          plant: "Main plant",
          area: "Production",
          line: "Line B",
        },
      }),
    );
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const [admin, manager, validator, operator] = await Promise.all(
    users.map(login),
  );
  const anon = await browser.newContext();
  assert.equal((await get(anon)).status, 401);
  assert.equal((await get(operator, "/api/leadership")).status, 403);
  assert.equal((await get(validator, "/api/leadership")).status, 403);
  const ap = await admin.newPage();
  await ap.goto(origin);
  await ap.getByRole("button", { name: /Downtime$/ }).click();
  await ap
    .getByLabel("Reason name", { exact: true })
    .fill("Tool adjustment " + suffix);
  await ap
    .getByRole("button", { name: "Add downtime reason", exact: true })
    .click();
  await ap.getByRole("status").waitFor();
  const reason = await db.downtimeReason.findUnique({
    where: { name: "Tool adjustment " + suffix },
  });
  assert(reason);
  reasonIds.push(reason.id);
  await ap.screenshot({
    path: "docs/screenshots/downtime-admin.png",
    fullPage: true,
  });
  assert.equal(
    (
      await post(operator, {
        action: "reason",
        name: "Unauthorized",
        active: true,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await post(manager, {
        action: "reason",
        id: reason.id,
        name: "Unauthorized",
        active: true,
      })
    ).status,
    403,
  );
  assert.equal(
    (await post(validator, { action: "shifts", config: originalConfig }))
      .status,
    403,
  );
  assert.equal(
    (
      await post(admin, {
        action: "shifts",
        config: {
          ...originalConfig,
          shifts: [originalConfig.shifts[0], originalConfig.shifts[0]],
        },
      })
    ).status,
    400,
  );
  const op = await operator.newPage(),
    errors = [];
  op.on("pageerror", (e) => errors.push(e.message));
  await op.goto(origin);
  await op.getByRole("button", { name: /Downtime$/ }).click();
  assert.equal(
    await op
      .getByRole("heading", { name: "Reasons & timer availability" })
      .count(),
    0,
  );
  await op
    .getByLabel("Equipment", { exact: true })
    .selectOption(equipment[0].id);
  await op
    .getByLabel("Downtime reason", { exact: true })
    .selectOption(reason.id);
  await op.getByRole("button", { name: "Start downtime", exact: true }).click();
  await op
    .getByRole("button", { name: "Stop downtime", exact: true })
    .waitFor();
  let event = await db.downtime.findFirst({
    where: { equipmentId: equipment[0].id, endedAt: null },
  });
  assert(event);
  assert.equal(
    (
      await post(manager, {
        action: "start",
        equipmentId: equipment[0].id,
        reasonId: reason.id,
        startedAt: "2001-01-01T00:00:00Z",
      })
    ).status,
    409,
  );
  await op.waitForTimeout(1100);
  await op.reload();
  await op.getByRole("button", { name: /Downtime$/ }).click();
  await op
    .getByLabel("Equipment", { exact: true })
    .selectOption(equipment[0].id);
  await op
    .getByRole("button", { name: "Stop downtime", exact: true })
    .waitFor();
  await op.screenshot({
    path: "docs/screenshots/downtime-operator.png",
    fullPage: true,
  });
  assert.equal(
    (
      await post(admin, {
        action: "reason",
        id: reason.id,
        name: "Adjusted tooling " + suffix,
        active: false,
      })
    ).status,
    200,
  );
  const changedConfig = {
    timezone: "UTC",
    shifts: [
      { name: "Day", startMinute: 0 },
      { name: "Night", startMinute: 720 },
    ],
  };
  assert.equal(
    (await post(admin, { action: "shifts", config: changedConfig })).status,
    200,
  );
  await op.getByRole("button", { name: "Stop downtime", exact: true }).click();
  await op
    .getByRole("button", { name: "Start downtime", exact: true })
    .waitFor();
  event = await db.downtime.findUnique({ where: { id: event.id } });
  assert(event.endedAt > event.startedAt);
  assert.equal(event.reasonName, "Tool adjustment " + suffix);
  assert.deepEqual(event.shiftConfig, originalConfig);
  assert.equal(
    (await post(manager, { action: "stop", id: event.id })).status,
    409,
  );
  assert.equal(
    (
      await post(operator, {
        action: "start",
        equipmentId: equipment[0].id,
        reasonId: reason.id,
      })
    ).status,
    400,
  );
  await post(admin, { action: "shifts", config: originalConfig });
  await post(admin, {
    action: "reason",
    id: reason.id,
    name: "Tool adjustment " + suffix,
    active: true,
  });
  const race = await Promise.all([
    post(operator, {
      action: "start",
      equipmentId: equipment[0].id,
      reasonId: reason.id,
    }),
    post(manager, {
      action: "start",
      equipmentId: equipment[0].id,
      reasonId: reason.id,
    }),
  ]);
  assert.deepEqual(race.map((r) => r.status).sort(), [200, 409]);
  const racingEvent = await db.downtime.findFirst({
    where: { equipmentId: equipment[0].id, endedAt: null },
  });
  assert.equal(
    (await post(validator, { action: "stop", id: racingEvent.id })).status,
    200,
  );
  await op.getByRole("button", { name: /Improvement ideas$/ }).click();
  await op
    .getByLabel("Idea title", { exact: true })
    .fill("Stage changeover tools before the shift");
  await op
    .getByLabel("Equipment", { exact: true })
    .selectOption(equipment[0].id);
  await op
    .getByLabel("Current state", { exact: true })
    .fill("Operators walk to the tool crib during every changeover.");
  await op
    .getByLabel("Proposed improvement", { exact: true })
    .fill("Pilot a labeled tool cart staged at the packing station.");
  await op.getByLabel("Pilot", { exact: true }).selectOption(users[1].id);
  await op.getByLabel("Validator", { exact: true }).selectOption(users[2].id);
  await op
    .getByLabel("Participants", { exact: true })
    .selectOption([users[0].id, users[3].id]);
  await op.getByLabel("Due date", { exact: true }).fill("2026-11-15");
  await op.screenshot({
    path: "docs/screenshots/improvement-idea-input.png",
    fullPage: true,
  });
  await op
    .getByRole("button", { name: "Submit idea & notify pilot", exact: true })
    .click();
  await op.getByRole("status").waitFor();
  const idea = await db.idea.findFirst({ where: { createdBy: users[3].id } });
  assert(idea);
  assert.equal(idea.submitterId, users[3].id);
  assert.equal(
    await db.ideaParticipant.count({ where: { ideaId: idea.id } }),
    2,
  );
  const notification = await db.notification.findFirst({
    where: { ideaId: idea.id },
  });
  assert(notification);
  assert.equal(notification.userId, users[1].id);
  assert(
    (await get(manager)).body.notifications.some(
      (n) => n.id === notification.id,
    ),
  );
  assert(
    !(await get(operator)).body.notifications.some(
      (n) => n.id === notification.id,
    ),
  );
  assert.equal(
    (await post(operator, { action: "readNotification", id: notification.id }))
      .status,
    404,
  );
  const directory = (await get(operator)).body.people;
  assert(directory.length >= 4);
  assert(directory.every((p) => !("password" in p) && !("role" in p)));
  const mp = await manager.newPage();
  await mp.goto(origin);
  await mp.getByRole("button", { name: /Notifications/ }).click();
  await mp.getByText(/You are the pilot for/).waitFor();
  await mp.screenshot({
    path: "docs/screenshots/pilot-notification.png",
    fullPage: true,
  });
  await mp.getByRole("button", { name: "Mark as read", exact: true }).click();
  await mp.getByRole("status").waitFor();
  assert(
    (await db.notification.findUnique({ where: { id: notification.id } }))
      .readAt,
  );
  await mp
    .getByRole("button", { name: "Open improvement ideas", exact: true })
    .click();
  await mp
    .getByLabel("Progress for " + idea.title, { exact: true })
    .selectOption("Piloting");
  await mp.getByRole("status").waitFor();
  let current = await db.idea.findUnique({ where: { id: idea.id } });
  assert.equal(current.status, "Piloting");
  assert.equal(
    (
      await post(operator, {
        action: "ideaStatus",
        id: idea.id,
        version: current.version,
        status: "Validation",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await post(manager, {
        action: "ideaStatus",
        id: idea.id,
        version: current.version,
        status: "Completed",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await post(manager, {
        action: "ideaStatus",
        id: idea.id,
        version: 1,
        status: "Validation",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await post(validator, {
        action: "ideaStatus",
        id: idea.id,
        version: current.version,
        status: "Completed",
      })
    ).status,
    200,
  );
  const baseIdea = {
    action: "idea",
    title: "Reduce quality holds",
    equipmentId: equipment[1].id,
    currentState: "Repeated manual inspection",
    proposal: "Pilot a first-piece gauge",
    dueDate: "2026-11-01",
    pilotId: users[1].id,
    validatorId: users[2].id,
    submitterId: users[3].id,
    participantIds: [users[0].id],
  };
  assert.equal(
    (await post(operator, { ...baseIdea, dueDate: "2026-02-30" })).status,
    400,
  );
  await db.user.update({ where: { id: users[2].id }, data: { active: false } });
  assert.equal((await post(operator, baseIdea)).status, 400);
  await db.user.update({ where: { id: users[2].id }, data: { active: true } });
  assert.equal((await post(operator, baseIdea)).status, 200);
  const e = equipment[1],
    standard = await db.standard.create({
      data: {
        family: randomUUID(),
        revision: 1,
        title: "Machining verification",
        equipmentId: e.id,
        target: 45,
        tolerance: 10,
        steps: [{ id: "gauge", text: "Check gauge", photo: false }],
      },
    });
  standardIds.push(standard.id);
  const date = new Date("2026-10-30T16:00:00Z"),
    snapshot = { ...standard, equipment: e };
  for (const kind of ["run", "audit", "study"])
    await db.record.create({
      data: {
        kind,
        userId: users[0].id,
        standardId: kind === "study" ? null : standard.id,
        created: date,
        data: JSON.parse(
          JSON.stringify(
            kind === "study"
              ? {
                  title: "Machining study",
                  equipmentId: e.id,
                  equipmentSnapshot: e,
                  cycles: [
                    { element: "Cycle", seconds: 40, at: date.toISOString() },
                  ],
                }
              : {
                  snapshot,
                  responses: [
                    {
                      stepId: "gauge",
                      answer: false,
                      comment: "Check fixture",
                      photo: null,
                    },
                  ],
                  durationSeconds: 60,
                  followUp: true,
                  operator: "Operator 104",
                  cycles: [
                    { element: "Cycle", seconds: 50, at: date.toISOString() },
                  ],
                },
          ),
        ),
      },
    });
  for (const [eq, from, to] of [
    [equipment[1], "2026-10-30T12:00:00Z", "2026-10-30T12:30:00Z"],
    [equipment[2], "2026-10-30T18:50:00Z", "2026-10-30T19:10:00Z"],
  ])
    await db.downtime.create({
      data: {
        equipmentId: eq.id,
        reasonId: reason.id,
        reasonName: reason.name,
        equipmentSnapshot: eq,
        shiftConfig: originalConfig,
        startedBy: users[0].id,
        stoppedBy: users[0].id,
        startedAt: new Date(from),
        endedAt: new Date(to),
      },
    });
  for (const kind of ["guide", "video"]) {
    const c = await db.content.create({
      data: {
        kind,
        title: "Department resource " + suffix,
        equipmentId: e.id,
        body:
          kind === "guide"
            ? "Approved setup instructions"
            : "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      },
    });
    contentIds.push(c.id);
  }
  const query = (department) =>
    "/api/leadership?" +
    new URLSearchParams({ department, from: "2026-10-30", to: "2026-10-30" });
  const boundary = (await get(manager, query(equipment[2].department))).body;
  assert.equal(boundary.summary.downtimeSeconds, 1200);
  assert.deepEqual(boundary.shifts.map((s) => s.seconds).sort(), [600, 600]);
  const scoped = (await get(manager, query(equipment[1].department))).body;
  assert.equal(scoped.summary.downtimeSeconds, 1800);
  assert.equal(scoped.summary.runs, 1);
  assert.equal(scoped.summary.studies, 1);
  assert.equal(scoped.summary.audits, 1);
  assert.equal(scoped.summary.noAnswers, 1);
  assert.equal(scoped.summary.openIdeas, 1);
  assert.equal(scoped.summary.training, 1);
  assert.equal(scoped.summary.guides, 1);
  const overall = (await get(manager, query(""))).body;
  assert(overall.summary.downtimeSeconds >= 3000);
  assert(overall.summary.runs >= 1);
  assert.equal(
    (await get(manager, "/api/leadership?from=2026-11-01&to=2026-10-01"))
      .status,
    400,
  );
  await mp.getByRole("button", { name: /Leadership dashboard$/ }).click();
  await mp
    .getByRole("heading", { name: "Whole-floor performance", exact: true })
    .waitFor();
  await mp.getByLabel("From date", { exact: true }).fill("2026-10-30");
  await mp.getByLabel("To date", { exact: true }).fill("2026-10-30");
  await mp.getByRole("button", { name: "Apply filters", exact: true }).click();
  await mp
    .getByText("2026-10-30 through 2026-10-30", { exact: false })
    .waitFor();
  await mp.screenshot({
    path: "docs/screenshots/leadership-overall.png",
    fullPage: true,
  });
  await mp
    .getByLabel("Leadership department", { exact: true })
    .selectOption(equipment[1].department);
  await mp.getByRole("button", { name: "Apply filters", exact: true }).click();
  await mp
    .getByRole("heading", { name: equipment[1].department, exact: true })
    .waitFor();
  await mp.screenshot({
    path: "docs/screenshots/leadership-department.png",
    fullPage: true,
  });
  const xlsx = await manager.request.get(
    origin + query(equipment[1].department) + "&format=xlsx",
  );
  assert.equal(xlsx.status(), 200);
  let book = new Excel.Workbook();
  await book.xlsx.load(await xlsx.body());
  assert.equal(book.worksheets.length, 4);
  assert(
    book
      .getWorksheet("Leadership summary")
      .getRow(1)
      .values.includes(equipment[1].department),
  );
  const allExport = await admin.request.get(origin + "/api/export");
  book = new Excel.Workbook();
  await book.xlsx.load(await allExport.body());
  assert.equal(book.worksheets.length, 9);
  assert(book.getWorksheet("Downtime shifts").rowCount >= 4);
  assert(book.getWorksheet("Improvement ideas").rowCount >= 3);
  await db.policy.update({
    where: { role: "Manager" },
    data: { grants: originalManager.filter((c) => c !== "leadership") },
  });
  assert.equal((await get(manager, "/api/leadership")).status, 403);
  await db.policy.update({
    where: { role: "Manager" },
    data: { grants: originalManager },
  });
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    storageState: await operator.storageState(),
    timezoneId: "America/Chicago",
  });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(origin);
  await mobilePage.getByRole("button", { name: /Downtime$/ }).click();
  await mobilePage
    .getByLabel("Equipment", { exact: true })
    .selectOption(equipment[0].id);
  await mobilePage.screenshot({
    path: "docs/screenshots/mobile-downtime.png",
    fullPage: true,
  });
  assert(
    await mobilePage.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await mobilePage.getByRole("button", { name: /Improvement ideas$/ }).click();
  assert(
    await mobilePage.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    "PASS: admin reasons/shifts, operator timer persistence, disabled reasons, concurrent starts, stop conflicts, historical snapshots, shift allocation, improvement assignments, private pilot notifications, progress permissions, department leadership totals, all-section reports, nine-sheet exports, leadership policy revocation, and mobile layout.",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    if (originalConfig)
      await db.setting.update({
        where: { key: "shifts" },
        data: { value: originalConfig },
      });
    if (originalManager)
      await db.policy.update({
        where: { role: "Manager" },
        data: { grants: originalManager },
      });
    const ids = users.map((u) => u.id),
      eq = equipment.map((e) => e.id),
      ideas = await db.idea.findMany({
        where: { createdBy: { in: ids } },
        select: { id: true },
      }),
      ideaIds = ideas.map((i) => i.id);
    await db.notification.deleteMany({ where: { ideaId: { in: ideaIds } } });
    await db.ideaParticipant.deleteMany({ where: { ideaId: { in: ideaIds } } });
    await db.idea.deleteMany({ where: { id: { in: ideaIds } } });
    await db.downtime.deleteMany({ where: { equipmentId: { in: eq } } });
    await db.downtimeReason.deleteMany({ where: { id: { in: reasonIds } } });
    await db.record.deleteMany({ where: { userId: { in: ids } } });
    await db.content.deleteMany({ where: { id: { in: contentIds } } });
    await db.standard.deleteMany({ where: { id: { in: standardIds } } });
    await db.equipment.deleteMany({ where: { id: { in: eq } } });
    await db.session.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.rate.deleteMany({
      where: { OR: ids.map((id) => ({ key: { contains: id } })) },
    });
    await db.$disconnect();
  });
