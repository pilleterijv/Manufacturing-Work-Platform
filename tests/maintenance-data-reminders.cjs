require("tsx/cjs");
require("dotenv").config({ quiet: true });
const assert = require("node:assert/strict"),
  { randomUUID } = require("node:crypto"),
  fs = require("node:fs/promises"),
  { spawnSync } = require("node:child_process"),
  { chromium } = require("playwright"),
  ExcelJS = require("exceljs");
const { db } = require("../lib/db.ts"),
  { hashPassword } = require("../lib/security.ts"),
  { createIntegrationToken } = require("../lib/integrations.ts"),
  {
    queueOverdueReminders,
    deliverReminderEmails,
  } = require("../lib/reminders.ts"),
  { localToday } = require("../lib/operations-rules.ts"),
  { Temporal } = require("@js-temporal/polyfill");
const origin = process.env.APP_URL || "http://localhost:3000",
  prefix = "Phase10-" + randomUUID().slice(0, 8),
  users = [],
  equipment = [],
  contexts = [],
  photoIds = [],
  videoIds = [],
  feedIds = [],
  sourceIds = [];
let browser, settingsBefore;
const read = async (r, status = 200) => {
  const text = await r.text();
  assert.equal(r.status(), status, text);
  return JSON.parse(text);
};
const post = (c, path, data) =>
  c.request.post(origin + path, { headers: { Origin: origin }, data });
const get = (c, path) => c.request.get(origin + path);
async function main() {
  assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
  const password = "Pilot " + randomUUID() + "!",
    hash = await hashPassword(password),
    setting = await db.setting.findUniqueOrThrow({ where: { key: "shifts" } }),
    today = localToday(setting.value.timezone),
    yesterday = Temporal.PlainDate.from(today).subtract({ days: 1 }).toString();
  settingsBefore = await db.setting.findUnique({
    where: { key: "overdue-channels" },
  });
  await db.setting.upsert({
    where: { key: "overdue-channels" },
    create: { key: "overdue-channels", value: { inApp: true, email: true } },
    update: { value: { inApp: true, email: true } },
  });
  for (const [role, department, name] of [
    ["Admin", "A", "Jordan Pilot"],
    ["Manager", "A", "Manager Alpha"],
    ["Manager", "B", "Manager Beta"],
    ["DL/TL", "A", "Leader Alpha"],
    ["Operator", "A", "Operator Alpha"],
    ["Operator", "A", "Operator Peer"],
    ["Operator", "B", "Operator Beta"],
  ])
    users.push(
      await db.user.create({
        data: {
          username: prefix.toLowerCase() + "-" + users.length,
          name,
          role,
          password: hash,
          mustChange: false,
          email: prefix.toLowerCase() + "-" + users.length + "@example.invalid",
          workspaceAccess: {
            mode: "restricted",
            locations: [{ plant: prefix, department, area: null }],
            equipmentIds: [],
          },
        },
      }),
    );
  for (const department of ["A", "B"]) {
    equipment.push(
      await db.equipment.create({
        data: {
          name: prefix + " Packer " + department,
          plant: prefix,
          department,
          area: "Packing",
          line: "Line 1",
        },
      }),
    );
    await db.location.create({
      data: { plant: prefix, department, area: "Packing", line: "Line 1" },
    });
  }
  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  async function login(u) {
    const c = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      timezoneId: "America/Chicago",
      serviceWorkers: "block",
    });
    await read(
      await post(c, "/api/account", {
        action: "login",
        username: u.username,
        password,
        remember: false,
      }),
    );
    contexts.push(c);
    return c;
  }
  const [admin, manager, otherManager, leader, operator, peer] =
    await Promise.all(users.slice(0, 6).map(login));
  // Upload videos as an operator, then use them in standard work and PMs.
  const file = "/tmp/" + prefix + ".mp4";
  assert.equal(
    spawnSync("ffmpeg", [
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=64x64:d=1",
      "-an",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      file,
    ]).status,
    0,
  );
  const bytes = await fs.readFile(file);
  await fs.unlink(file);
  const video = await read(
    await post(operator, "/api/guide-media", {
      video: "data:video/mp4;base64," + bytes.toString("base64"),
    }),
  );
  videoIds.push(video.id);
  const family = randomUUID();
  await read(
    await post(manager, "/api/platform", {
      action: "standard",
      family,
      title: prefix + " check",
      equipmentId: equipment[0].id,
      target: 10,
      tolerance: 10,
      steps: [{ id: "guard", text: "Guard inspection", photo: true }],
    }),
  );
  const standard = await db.standard.findFirstOrThrow({ where: { family } });
  const run = {
    action: "run",
    standardId: standard.id,
    started: new Date().toISOString(),
    responses: [
      {
        stepId: "guard",
        answer: true,
        comment: "Video evidence",
        photo: null,
        video: video.id,
      },
    ],
  };
  await read(await post(operator, "/api/platform", run));
  assert.equal(
    (await get(peer, "/api/guide-media/" + video.id)).status(),
    403,
    "PM privileges must not grant access to another operator standard-work evidence",
  );
  assert.equal(
    (await get(manager, "/api/guide-media/" + video.id)).status(),
    200,
  );
  assert.equal(
    (await get(otherManager, "/api/guide-media/" + video.id)).status(),
    403,
  );
  const badRange = await operator.request.get(
    origin + "/api/guide-media/" + video.id,
    { headers: { Range: "bytes=-0" } },
  );
  assert.equal(badRange.status(), 416);
  // Required PM evidence, current assignment, due gating, replay protection and immutable snapshots.
  await read(
    await post(manager, "/api/maintenance", {
      action: "save",
      title: prefix + " lubrication",
      equipmentId: equipment[0].id,
      assigneeId: users[4].id,
      intervalDays: 7,
      nextDue: yesterday,
      active: true,
      steps: [
        { id: "lubricate", text: "Check lubrication and guard", photo: true },
      ],
    }),
  );
  let plan = await db.maintenancePlan.findFirstOrThrow({
    where: { createdBy: users[1].id },
  });
  const complete = {
    action: "complete",
    id: plan.id,
    version: plan.version,
    responses: [
      { stepId: "lubricate", answer: true, comment: "Inspected", media: [] },
    ],
  };
  await read(await post(operator, "/api/maintenance", complete), 400);
  await read(await post(peer, "/api/maintenance", complete), 403);
  await read(await post(otherManager, "/api/maintenance", complete), 403);
  const before = await queueOverdueReminders(users[1]);
  assert(before.queued > 0);
  complete.responses[0].media = [
    { id: video.id, kind: "video", caption: "Inspection" },
  ];
  await read(await post(operator, "/api/maintenance", complete));
  await read(await post(operator, "/api/maintenance", complete), 409);
  plan = await db.maintenancePlan.findUniqueOrThrow({ where: { id: plan.id } });
  assert(plan.nextDue > today);
  await read(
    await post(operator, "/api/maintenance", {
      ...complete,
      version: plan.version,
    }),
    409,
  );
  const pmRecord = await db.record.findFirstOrThrow({
    where: { kind: "pm", userId: users[4].id },
  });
  assert.equal(pmRecord.data.planSnapshot.title, prefix + " lubrication");
  assert(!("history" in pmRecord.data.planSnapshot));
  await read(
    await post(manager, "/api/maintenance", {
      action: "save",
      ...plan,
      title: prefix + " revised PM",
    }),
  );
  assert.equal(
    (await db.record.findUniqueOrThrow({ where: { id: pmRecord.id } })).data
      .planSnapshot.title,
    prefix + " lubrication",
  );
  // Text/people filters span server-side history and full exports; no widening department scope.
  let filtered = await read(
    await get(
      manager,
      "/api/platform?view=records&person=" +
        users[4].id +
        "&search=" +
        encodeURIComponent(prefix.toUpperCase()),
    ),
  );
  assert.equal(filtered.records.length, 1);
  filtered = await read(
    await get(manager, "/api/platform?view=records&person=" + users[5].id),
  );
  assert.equal(filtered.records.length, 0);
  const exported = await get(manager, "/api/export?person=" + users[5].id);
  assert.equal(exported.status(), 200);
  const exportBook = new ExcelJS.Workbook();
  await exportBook.xlsx.load(await exported.body());
  assert.equal(exportBook.getWorksheet("Standard work").rowCount, 1);
  assert.equal(
    (
      await read(
        await get(otherManager, "/api/maintenance?person=" + users[4].id),
      )
    ).plans.length,
    0,
  );
  // Uploaded training videos play privately and remain equipment scoped.
  const trainingVideo = await read(
    await post(manager, "/api/guide-media", {
      video: "data:video/mp4;base64," + bytes.toString("base64"),
    }),
  );
  videoIds.push(trainingVideo.id);
  await read(
    await post(manager, "/api/platform", {
      action: "video",
      title: prefix + " training",
      body: "",
      equipmentId: equipment[0].id,
      media: [
        { id: trainingVideo.id, kind: "video", caption: "Setup demonstration" },
      ],
    }),
  );
  assert.equal(
    (await get(operator, "/api/guide-media/" + trainingVideo.id)).status(),
    200,
  );
  assert.equal(
    (await get(otherManager, "/api/guide-media/" + trainingVideo.id)).status(),
    403,
  );
  // Excel imports are normalized, atomic, replay-safe, versioned and scoped.
  const sourceId = randomUUID(),
    token = createIntegrationToken(sourceId);
  sourceIds.push(sourceId);
  await db.integrationSource.create({
    data: {
      id: sourceId,
      name: prefix + " source",
      tokenHash: token.tokenHash,
      createdBy: users[0].id,
    },
  });
  const feed = await read(
    await post(admin, "/api/external-data", {
      action: "create",
      name: prefix + " Excel",
      sourceId,
      section: "Production results",
      mode: "excel",
    }),
  );
  feedIds.push(feed.id);
  async function workbook(rows) {
    const b = new ExcelJS.Workbook(),
      s = b.addWorksheet("Production Results");
    s.addRow([
      "ExternalID",
      "EquipmentID",
      "Date",
      "Produced",
      "Good",
      "Rejects",
      "PersonID",
    ]);
    for (const row of rows) s.addRow(row);
    return (
      "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64," +
      Buffer.from(await b.xlsx.writeBuffer()).toString("base64")
    );
  }
  const validRow = ["lot-001", equipment[0].id, today, 100, 97, 3, users[4].id];
  const validFile = await workbook([validRow]);
  await read(
    await post(manager, "/api/external-data/import", {
      feedId: feed.id,
      workbook: validFile,
    }),
  );
  await read(
    await post(manager, "/api/external-data/import", {
      feedId: feed.id,
      workbook: validFile,
    }),
  );
  let row = await db.externalRow.findFirstOrThrow({
    where: { feedId: feed.id },
  });
  assert.equal(
    await db.externalRevision.count({ where: { rowId: row.id } }),
    1,
    "Identical imports must not create false revisions",
  );
  assert.equal(row.values.produced, 100);
  await read(
    await post(manager, "/api/external-data/import", {
      feedId: feed.id,
      workbook: await workbook([
        ["good-new", equipment[0].id, today, 1, 1, 0, ""],
        ["wrong-dept", equipment[1].id, today, 1, 1, 0, ""],
      ]),
    }),
    403,
  );
  assert.equal(
    await db.externalRow.count({ where: { feedId: feed.id } }),
    1,
    "Whole batch rolls back when any machine is forbidden",
  );
  await read(
    await post(manager, "/api/external-data/import", {
      feedId: feed.id,
      workbook: await workbook([
        [
          "formula",
          equipment[0].id,
          today,
          { formula: "1+1", result: 2 },
          2,
          0,
          "",
        ],
      ]),
    }),
    400,
  );
  await read(
    await post(manager, "/api/external-data/import", {
      feedId: feed.id,
      workbook: await workbook([
        ["invalid-total", equipment[0].id, today, 3, 1, 1, ""],
      ]),
    }),
    400,
  );
  await read(
    await post(manager, "/api/external-data/import", {
      feedId: feed.id,
      workbook: await workbook([
        ["lot-001", equipment[0].id, today, 110, 107, 3, users[4].id],
      ]),
    }),
  );
  assert.equal(
    await db.externalRevision.count({ where: { rowId: row.id } }),
    2,
  );
  assert.equal(
    (
      await read(
        await get(
          otherManager,
          "/api/external-data?section=Production%20results",
        ),
      )
    ).items.length,
    0,
  );
  await read(
    await get(operator, "/api/external-data?section=Production%20results"),
    403,
  );
  assert.equal(
    (
      await read(
        await get(
          manager,
          "/api/external-data?section=Production%20results&person=" +
            users[4].id,
        ),
      )
    ).items.length,
    1,
  );
  const otherRow = [
    "other-department",
    equipment[1].id,
    today,
    20,
    20,
    0,
    users[6].id,
  ];
  await read(
    await post(otherManager, "/api/external-data/import", {
      feedId: feed.id,
      workbook: await workbook([otherRow]),
    }),
  );
  await read(
    await post(manager, "/api/external-data/import", {
      feedId: feed.id,
      workbook: await workbook([
        ["other-department", equipment[0].id, today, 30, 30, 0, users[4].id],
      ]),
    }),
    403,
  );
  assert.equal(
    (
      await db.externalRow.findFirstOrThrow({
        where: { feedId: feed.id, externalId: "other-department" },
      })
    ).equipmentId,
    equipment[1].id,
  );
  const sourceExport = await get(
    manager,
    "/api/external-data?section=Production%20results&format=xlsx",
  );
  assert.equal(sourceExport.status(), 200);
  const sourceBook = new ExcelJS.Workbook();
  await sourceBook.xlsx.load(await sourceExport.body());
  assert.equal(sourceBook.worksheets[0].rowCount, 2);
  assert.equal(sourceBook.worksheets[0].getRow(2).getCell(5).value, "A");
  const apiFeed = await read(
    await post(admin, "/api/external-data", {
      action: "create",
      name: prefix + " database",
      sourceId,
      section: "Analytics",
      mode: "api",
    }),
  );
  feedIds.push(apiFeed.id);
  const payload = {
    externalId: "event-1",
    equipmentId: equipment[0].id,
    personId: users[4].id,
    title: "Database result",
    details: "Approved view",
    occurredAt: new Date().toISOString(),
    values: { count: 5 },
  };
  async function push(sequence, rows) {
    return manager.request.post(origin + "/api/external-data/rows", {
      headers: { Authorization: "Bearer " + token.token },
      data: { feedId: apiFeed.id, sequence, rows },
    });
  }
  await read(await push("9007199254740993", [payload]));
  await read(
    await push("9007199254740994", [{ ...payload, values: { count: 6 } }]),
  );
  await read(await push("9007199254740993", [payload]));
  assert.equal(
    (await db.externalRow.findFirstOrThrow({ where: { feedId: apiFeed.id } }))
      .values.count,
    6,
  );
  assert.equal(
    (await db.externalFeed.findUniqueOrThrow({ where: { id: apiFeed.id } }))
      .cursor,
    "9007199254740994",
  );
  // Daily overdue alerts: personal plus department managers; closed/disabled/reassigned work cancels queued mail.
  const idea = await db.idea.create({
    data: {
      title: prefix + " overdue idea",
      equipmentId: equipment[0].id,
      equipmentSnapshot: equipment[0],
      currentState: "Before",
      proposal: "Improve seals",
      dueDate: yesterday,
      createdBy: users[1].id,
      submitterId: users[4].id,
      pilotId: users[4].id,
      validatorId: users[1].id,
    },
  });
  const problem = await db.problem.create({
    data: {
      reference: prefix + "-4D",
      method: "4D",
      title: prefix + " overdue case",
      equipmentId: equipment[0].id,
      equipmentSnapshot: equipment[0],
      occurredOn: yesterday,
      reportedBy: users[4].name,
      ownerId: users[3].id,
      reviewerId: users[1].id,
      team: "Pilot",
      dueDate: yesterday,
      answers: {},
      createdBy: users[1].id,
      history: [],
    },
  });
  const action = await db.problemAction.create({
    data: {
      problemId: problem.id,
      type: "Corrective",
      title: "Repair seal",
      ownerId: users[4].id,
      dueDate: yesterday,
      history: [],
    },
  });
  const queued = await queueOverdueReminders(users[1]);
  assert(queued.queued >= 6);
  assert.equal((await queueOverdueReminders(users[1])).queued, 0);
  assert.equal(
    await db.reminder.count({
      where: { equipmentId: equipment[0].id, userId: users[2].id },
    }),
    0,
  );
  const notices = await read(
    await get(operator, "/api/operations?view=summary"),
  );
  assert(notices.notifications.some((n) => n.kind === "overdue"));
  await db.idea.update({
    where: { id: idea.id },
    data: { status: "Completed" },
  });
  await db.problemAction.update({
    where: { id: action.id },
    data: { status: "Completed" },
  });
  const sent = [];
  await deliverReminderEmails({
    sendMail: async (args) => {
      sent.push(args);
      return {};
    },
  });
  assert(sent.length > 0);
  assert(!sent.some((m) => m.to === users[2].email));
  assert.equal(
    await db.reminder.count({
      where: { entityId: idea.id, status: "Pending" },
    }),
    0,
  );
  assert.equal(
    await db.reminder.count({
      where: { entityType: "pm", entityId: plan.id, status: "Pending" },
    }),
    0,
  );
  await read(
    await post(operator, "/api/reminders", {
      action: "preferences",
      inApp: false,
      email: false,
    }),
  );
  await read(await post(operator, "/api/reminders", { action: "send" }), 403);
  await read(
    await post(otherManager, "/api/reminders", {
      action: "send",
      person: users[4].id,
    }),
  );
  assert.equal(
    await db.reminder.count({
      where: { equipmentId: equipment[1].id, userId: users[4].id },
    }),
    0,
  );
  // Actual UI: filters, PM editor/execution history, uploaded training, Excel panel and reminder preferences.
  await read(
    await post(manager, "/api/maintenance", {
      action: "save",
      title: prefix + " UI PM",
      equipmentId: equipment[0].id,
      assigneeId: users[1].id,
      intervalDays: 7,
      nextDue: today,
      active: true,
      steps: [{ id: "visual", text: "Verify inspection", photo: false }],
    }),
  );
  const page = await manager.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin);
  await page
    .getByRole("button", { name: "⚒ Preventive maintenance", exact: true })
    .click();
  await page
    .getByRole("heading", { name: prefix + " UI PM", exact: false })
    .waitFor();
  const task = page.locator("article.problem-action").filter({
    has: page.getByRole("heading", { name: prefix + " UI PM", exact: false }),
  });
  await task.getByRole("button", { name: "Perform PM", exact: true }).click();
  await page
    .getByRole("button", { name: "Yes · complete", exact: true })
    .click();
  await page
    .getByLabel("PM photo or video · optional", { exact: true })
    .setInputFiles({
      name: "inspection.mp4",
      mimeType: "application/octet-stream",
      buffer: bytes,
    });
  await page
    .getByRole("button", { name: "Complete PM and save evidence", exact: true })
    .click();
  await page.getByText("PM saved.", { exact: true }).waitFor();
  await fs.mkdir("docs/screenshots/maintenance-data", { recursive: true });
  await page.screenshot({
    path: "docs/screenshots/maintenance-data/pm-plans-history.png",
    fullPage: true,
  });
  await page
    .getByLabel("PM assignee / recorder", { exact: true })
    .fill("Operator Alpha");
  await page
    .getByRole("listbox", { name: "PM assignee / recorder suggestions" })
    .locator('[role="listbox"] [role="option"]')
    .filter({ hasText: users[4].username })
    .click();
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "PM task list", exact: true })
    .waitFor();
  await page.screenshot({
    path: "docs/screenshots/maintenance-data/person-filter.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await page
    .getByRole("button", { name: "▥ Production results", exact: true })
    .click();
  await page
    .getByRole("heading", {
      name: "Connected data · Production results",
      exact: true,
    })
    .waitFor();
  await page
    .getByText("lot-001", { exact: false })
    .first()
    .waitFor({ state: "attached" });
  await page
    .locator("details")
    .filter({ hasText: "lot-001" })
    .locator("summary")
    .click();
  assert(
    (
      await page
        .locator("details")
        .filter({ hasText: "lot-001" })
        .locator("summary")
        .textContent()
    ).includes(equipment[0].name),
  );
  assert.equal(
    await page
      .locator("details")
      .filter({ hasText: "lot-001" })
      .locator("time")
      .textContent(),
    today,
    "Excel calendar dates must not shift backward in US timezones",
  );
  await page.screenshot({
    path: "docs/screenshots/maintenance-data/excel-results.png",
    fullPage: true,
  });
  await page.route("**/api/external-data?section=Analytics*", async (route) => {
    await new Promise((r) => setTimeout(r, 400));
    await route.continue();
  });
  const delayed = page.waitForResponse((r) =>
    r.url().includes("/api/external-data?section=Analytics"),
  );
  await Promise.all([
    page.waitForRequest((r) =>
      r.url().includes("/api/external-data?section=Analytics"),
    ),
    page
      .locator("nav")
      .getByRole("button", { name: "▥ Analytics", exact: true })
      .click(),
  ]);
  await page
    .locator("nav")
    .getByRole("button", { name: "▥ Production results", exact: true })
    .click();
  await page
    .locator("details")
    .filter({ hasText: "lot-001" })
    .waitFor({ state: "attached" });
  await (await delayed).finished();
  await page.waitForTimeout(100);
  assert.equal(
    await page
      .locator("details")
      .filter({ hasText: "Database result" })
      .count(),
    0,
    "Late source response must not replace the newly selected section",
  );
  await page
    .getByRole("button", { name: /Notifications/ })
    .first()
    .click();
  await page
    .getByRole("heading", { name: "Overdue work reminders", exact: true })
    .waitFor();
  await page.screenshot({
    path: "docs/screenshots/maintenance-data/overdue-reminders.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: PM required photo/video, due/replay guards and immutable snapshots; scoped people/search/export; protected operator videos and training; Excel validation, atomic rollback, idempotent revisions; bigint ordered API feeds; overdue personal/department messages, dedupe/cancellation and UI.",
  );
}
async function cleanup() {
  if (browser) await browser.close();
  const ids = users.map((u) => u.id),
    eq = equipment.map((e) => e.id);
  for (const p of await db.photo.findMany({
    where: { userId: { in: ids } },
    select: { id: true },
  }))
    photoIds.push(p.id);
  for (const v of await db.guideMedia.findMany({
    where: { userId: { in: ids } },
    select: { id: true },
  }))
    videoIds.push(v.id);
  const rows = await db.externalRow.findMany({
    where: { feedId: { in: feedIds } },
    select: { id: true },
  });
  await db.externalRevision.deleteMany({
    where: { rowId: { in: rows.map((r) => r.id) } },
  });
  await db.externalRow.deleteMany({ where: { feedId: { in: feedIds } } });
  await db.externalFeed.deleteMany({ where: { id: { in: feedIds } } });
  await db.integrationSource.deleteMany({ where: { id: { in: sourceIds } } });
  const fixtureIdeas = await db.idea.findMany({
    where: { createdBy: { in: ids } },
    select: { id: true },
  });
  await db.notification.deleteMany({
    where: {
      OR: [
        { userId: { in: ids } },
        { ideaId: { in: fixtureIdeas.map((x) => x.id) } },
      ],
    },
  });
  await db.reminder.deleteMany({
    where: { OR: [{ userId: { in: ids } }, { equipmentId: { in: eq } }] },
  });
  const cases = await db.problem.findMany({
    where: { createdBy: { in: ids } },
    select: { id: true },
  });
  await db.problemAction.deleteMany({
    where: { problemId: { in: cases.map((p) => p.id) } },
  });
  await db.problem.deleteMany({ where: { createdBy: { in: ids } } });
  await db.ideaParticipant.deleteMany({ where: { userId: { in: ids } } });
  await db.idea.deleteMany({ where: { createdBy: { in: ids } } });
  await db.record.deleteMany({ where: { userId: { in: ids } } });
  await db.maintenancePlan.deleteMany({ where: { createdBy: { in: ids } } });
  await db.content.deleteMany({ where: { equipmentId: { in: eq } } });
  await db.standard.deleteMany({ where: { equipmentId: { in: eq } } });
  await db.equipment.deleteMany({ where: { id: { in: eq } } });
  await db.location.deleteMany({ where: { plant: prefix } });
  await db.photo.deleteMany({ where: { userId: { in: ids } } });
  await db.guideMedia.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  if (settingsBefore)
    await db.setting.upsert({
      where: { key: "overdue-channels" },
      create: settingsBefore,
      update: { value: settingsBefore.value },
    });
  else await db.setting.deleteMany({ where: { key: "overdue-channels" } });
  for (const id of photoIds)
    await fs.unlink("uploads/" + id + ".webp").catch(() => {});
  for (const id of videoIds)
    await fs.unlink("uploads/" + id + ".video").catch(() => {});
  await db.$disconnect();
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(cleanup);
