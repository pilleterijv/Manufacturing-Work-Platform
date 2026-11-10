require("tsx/cjs");
require("dotenv").config({ quiet: true });
const { randomUUID } = require("node:crypto"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  { chromium } = require("playwright");
const { db } = require("../lib/db.ts"),
  { hashPassword } = require("../lib/security.ts"),
  { checkShiftWork } = require("../lib/shift-monitor.ts"),
  { deliverShiftEmails } = require("../lib/email-delivery.ts"),
  {
    processSqlRows,
    companySqlConfig,
    pollCompanySql,
  } = require("../lib/company-sql.ts");
const origin = process.env.APP_URL || "http://localhost:3000",
  users = [],
  equipment = [],
  standards = [],
  schedules = [],
  sources = [];
let browser, reason, photoId;
async function main() {
  assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
  assert(
    !process.env.SMTP_HOST,
    "Tests require email delivery to be unconfigured",
  );
  assert(
    !process.env.COMPANY_SQL_SERVER,
    "Tests must not use a company SQL connection",
  );
  const suffix = randomUUID().slice(0, 8),
    password = `Connected ${randomUUID()}!`,
    hash = await hashPassword(password);
  for (const [role, name] of [
    ["Admin", "Jordan Demo"],
    ["Manager", "Avery Manager"],
    ["Operator", "Alex Operator"],
    ["Operator", "Other Operator"],
  ])
    users.push(
      await db.user.create({
        data: {
          username: `connected-${users.length}-${suffix}`,
          name,
          role,
          email: `fixture-${users.length}-${suffix}@example.invalid`,
          password: hash,
          mustChange: false,
          workspaceAccess:{mode:"all",locations:[],equipmentIds:[]},
        },
      }),
    );
  for (const name of ["Connected packing station", "Connected machining cell"])
    equipment.push(
      await db.equipment.create({
        data: {
          name,
          plant: "Demo plant",
          department: "Production " + suffix,
          area: "Packing",
          line: "Line A",
        },
      }),
    );
  reason = await db.downtimeReason.create({
    data: { name: "Automatic machine stop " + suffix },
  });
  const created = new Date("2026-10-01T00:00:00Z");
  for (let i = 0; i < 2; i++)
    standards.push(
      await db.standard.create({
        data: {
          family: randomUUID(),
          revision: 1,
          title: i ? "Missed cleaning check" : "Photo quality verification",
          equipmentId: equipment[i].id,
          target: 45,
          tolerance: 10,
          steps: [
            {
              id: "check",
              text: "Inspect the first piece and photograph the result",
              photo: true,
            },
          ],
          created,
        },
      }),
    );
  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const contexts = [];
  for (const u of users) {
    const c = await browser.newContext({
      viewport: { width: 1440, height: 1050 },
      timezoneId: "America/Chicago",
      serviceWorkers: "block",
    });
    const r = await c.request.post(origin + "/api/account", {
      headers: { Origin: origin },
      data: {
        action: "login",
        username: u.username,
        password,
        remember: false,
      },
    });
    assert.equal(r.status(), 200);
    contexts.push(c);
  }
  const [admin, manager, operator, other] = contexts;
  const external = await browser.newContext();
  async function post(c, path, data) {
    const r = await c.request.post(origin + path, {
      headers: { Origin: origin },
      data,
    });
    return { status: r.status(), body: await r.json() };
  }
  async function get(c, path) {
    const r = await c.request.get(origin + path);
    assert.equal(r.status(), 200, await r.text());
    return r.json();
  }
  const run = {
    action: "run",
    standardId: standards[0].id,
    started: new Date().toISOString(),
    responses: [
      { stepId: "check", answer: true, photo: null, comment: "Test" },
    ],
  };
  assert.equal(
    (await post(operator, "/api/platform", run)).status,
    400,
    "Required photo cannot be bypassed",
  );
  const image = await require("sharp")({
    create: { width: 80, height: 50, channels: 3, background: "#b5c9ac" },
  })
    .png()
    .toBuffer();
  let r = await post(operator, "/api/photos", {
    image: "data:image/png;base64," + image.toString("base64"),
  });
  assert.equal(r.status, 200);
  photoId = r.body.id;
  assert.equal(
    (await manager.request.get(origin + "/api/photos/" + photoId)).status(),
    403,
    "Unlinked photos remain private",
  );
  run.responses[0].photo = photoId;
  assert.equal((await post(operator, "/api/platform", run)).status, 200);
  assert.equal(
    (await manager.request.get(origin + "/api/photos/" + photoId)).status(),
    200,
    "Managers can view saved task evidence",
  );
  assert.equal(
    (await other.request.get(origin + "/api/photos/" + photoId)).status(),
    403,
    "Other operators cannot read evidence",
  );
  // Historical fixtures prove one station completion and per-person requirements.
  const config = {
      timezone: "UTC",
      shifts: [
        { name: "Day", startMinute: 0 },
        { name: "Evening", startMinute: 480 },
        { name: "Night", startMinute: 960 },
      ],
    },
    now = new Date("2026-11-01T08:00:00Z");
  const serverShift = (await get(admin, "/api/shift-schedules")).config
    .shifts[0].name;
  const requirement = {
    managerIds: [users[1].id],
    assigneeIds: [],
    shiftNames: [serverShift],
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    notifyInApp: true,
    notifyEmail: true,
  };
  assert.equal(
    (
      await post(operator, "/api/shift-schedules", {
        action: "create",
        family: standards[0].family,
        ...requirement,
      })
    ).status,
    403,
  );
  for (const standard of standards) {
    r = await post(admin, "/api/shift-schedules", {
      action: "create",
      family: standard.family,
      ...requirement,
    });
    assert.equal(r.status, 200);
    const s = await db.workSchedule.findFirstOrThrow({
      where: { family: standard.family },
    });
    schedules.push(s.id);
    await db.workSchedule.update({
      where: { id: s.id },
      data: {
        config,
        shiftNames: ["Day"],
        effectiveFrom: new Date("2026-11-01T00:00:00Z"),
        checkedThrough: new Date("2026-11-01T00:00:00Z"),
      },
    });
  }
  await db.record.create({
    data: {
      kind: "run",
      userId: users[2].id,
      standardId: standards[0].id,
      created: new Date("2026-11-01T07:59:59Z"),
      data: {
        snapshot: { ...standards[0], equipment: equipment[0] },
        equipmentId: equipment[0].id,
        responses: [
          {
            stepId: "check",
            answer: true,
            photo: photoId,
            comment: "Verified",
          },
        ],
        durationSeconds: 45,
      },
    },
  });
  await checkShiftWork(new Date(+now - 1));
  assert.equal(
    await db.shiftCheck.count({ where: { scheduleId: { in: schedules } } }),
    0,
  );
  await checkShiftWork(now);
  await checkShiftWork(now);
  let checks = await db.shiftCheck.findMany({
    where: { scheduleId: { in: schedules } },
  });
  assert.equal(checks.length, 2);
  assert.equal(checks.filter((c) => c.missed).length, 1);
  assert.equal(
    await db.notification.count({
      where: { userId: users[1].id, kind: "missed-work" },
    }),
    1,
  );
  assert.equal(
    await db.emailDelivery.count({ where: { scheduleId: { in: schedules } } }),
    1,
  );
  const messages = await get(manager, "/api/operations?view=summary");
  assert(
    messages.notifications.some(
      (n) =>
        n.kind === "missed-work" &&
        n.ideaId === null &&
        n.message.includes("Missed cleaning check"),
    ),
  );
  // A completion after the deadline does not erase the missed-shift record.
  await db.record.create({
    data: {
      kind: "run",
      userId: users[2].id,
      standardId: standards[1].id,
      created: now,
      data: {
        snapshot: { ...standards[1], equipment: equipment[1] },
        responses: [],
        durationSeconds: 45,
      },
    },
  });
  await checkShiftWork(now);
  assert.equal(
    await db.notification.count({
      where: { userId: users[1].id, kind: "missed-work" },
    }),
    1,
  );
  const per = await db.workSchedule.create({
    data: {
      family: standards[0].family,
      equipmentId: equipment[0].id,
      title: "Per-operator photo check",
      managerIds: [users[1].id],
      assigneeIds: [users[2].id, users[3].id],
      shiftNames: ["Day"],
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      config,
      notifyInApp: true,
      notifyEmail: false,
      createdBy: users[0].id,
      effectiveFrom: new Date("2026-11-01T00:00:00Z"),
      checkedThrough: new Date("2026-11-01T00:00:00Z"),
    },
  });
  schedules.push(per.id);
  await checkShiftWork(now);
  assert.equal(
    await db.shiftCheck.count({ where: { scheduleId: per.id, missed: true } }),
    1,
  );
  const off = await db.workSchedule.create({
    data: {
      ...per,
      id: randomUUID(),
      title: "Channels switched off",
      assigneeIds: [],
      notifyInApp: false,
      notifyEmail: false,
      checkedThrough: new Date("2026-11-01T00:00:00Z"),
    },
  });
  schedules.push(off.id);
  await checkShiftWork(now);
  assert.equal(
    await db.notification.count({
      where: { userId: users[1].id, kind: "missed-work" },
    }),
    2,
  );
  assert.equal(
    await db.emailDelivery.count({ where: { scheduleId: off.id } }),
    0,
  );
  // SMTP retries/outbox are tested with a local message stream, never external mail.
  const previousEnv = {
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_FROM: process.env.SMTP_FROM,
  };
  process.env.SMTP_HOST = "localhost";
  process.env.SMTP_FROM = "floorwork@example.invalid";
  try {
    await deliverShiftEmails({
      sendMail: async () => {
        throw Error("simulated relay outage");
      },
      close() {},
    });
    let email = await db.emailDelivery.findFirstOrThrow({
      where: { scheduleId: schedules[1] },
    });
    assert.equal(email.status, "Pending");
    assert.equal(email.attempts, 1);
    assert(email.lastError);
    await db.emailDelivery.update({
      where: { id: email.id },
      data: { nextAttemptAt: new Date(0) },
    });
    let emitted;
    const transport = require("nodemailer").createTransport({
      streamTransport: true,
      buffer: true,
    });
    await deliverShiftEmails({
      sendMail: async (options) => {
        const result = await transport.sendMail(options);
        emitted = result;
        return result;
      },
      close() {
        transport.close();
      },
    });
    email = await db.emailDelivery.findUniqueOrThrow({
      where: { id: email.id },
    });
    assert.equal(email.status, "Sent");
    assert(email.sentAt);
    assert(emitted.envelope.to.includes(users[1].email));
    assert(emitted.message.toString().includes("Missed cleaning check"));
  } finally {
    for (const [key, value] of Object.entries(previousEnv))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  }
  const old = await db.workSchedule.findUniqueOrThrow({
    where: { id: schedules[1] },
  });
  const cancelCheck = await db.shiftCheck.create({
    data: {
      scheduleId: old.id,
      shiftStart: new Date("2026-11-02T00:00:00Z"),
      shiftEnd: new Date("2026-11-02T08:00:00Z"),
      shiftName: "Day",
      assigneeKey: "cancel-test",
      missed: true,
    },
  });
  const cancelEmail = await db.emailDelivery.create({
    data: {
      scheduleId: old.id,
      checkId: cancelCheck.id,
      userId: users[1].id,
      subject: "Cancellation test",
      message: "Queued only",
    },
  });
  r = await post(admin, "/api/shift-schedules", {
    action: "update",
    id: old.id,
    version: old.version,
    active: true,
    notifyInApp: false,
    notifyEmail: false,
  });
  assert.equal(r.status, 200);
  assert.equal(
    (
      await db.emailDelivery.findUniqueOrThrow({
        where: { id: cancelEmail.id },
      })
    ).status,
    "Cancelled",
  );
  assert.equal(
    (
      await post(admin, "/api/shift-schedules", {
        action: "update",
        id: old.id,
        version: old.version,
        active: false,
        notifyInApp: false,
        notifyEmail: false,
      })
    ).status,
    409,
  );
  // Authenticated incoming transitions, retries, conflict safety and SQL processing.
  assert.equal(
    (
      await post(operator, "/api/integrations", {
        action: "createSource",
        name: "Unauthorized",
      })
    ).status,
    403,
  );
  r = await post(admin, "/api/integrations", {
    action: "createSource",
    name: "TrakSYS demo " + suffix,
  });
  assert.equal(r.status, 200);
  const sourceId = r.body.id;
  let token = r.body.token;
  sources.push(sourceId);
  const sourceList = await get(admin, "/api/integrations");
  assert(!JSON.stringify(sourceList).includes(token));
  assert(!JSON.stringify(sourceList).includes("tokenHash"));
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await post(admin, "/api/integrations", {
          action: "bind",
          id: sourceId,
          externalId: "M" + i,
          equipmentId: equipment[i].id,
          reasonId: reason.id,
        })
      ).status,
      200,
    );
  const call = async (data) => {
    const rr = await external.request.post(
      origin + "/api/integrations/events",
      {
        headers: { Authorization: "Bearer " + token },
        data,
      },
    );
    return { status: rr.status(), body: await rr.json() };
  };
  assert.equal(
    (
      await external.request.post(origin + "/api/integrations/events", {
        headers: { Authorization: "Bearer " + token },
        data: { padding: "x".repeat(70 * 1024) },
      })
    ).status(),
    413,
  );
  assert.equal(
    (
      await operator.request.post(origin + "/api/integrations/events", {
        data: {},
      })
    ).status(),
    401,
  );
  const startTime = new Date(Date.now() - 600000),
    event = {
      eventId: "down-" + suffix,
      machineId: "M0",
      state: "down",
      occurredAt: startTime.toISOString(),
    };
  const concurrent = await Promise.all([call(event), call(event)]);
  assert(
    concurrent.every((r) => r.status === 200),
    JSON.stringify(
      concurrent.map((r) => ({ status: r.status, error: r.body.error })),
    ),
  );
  assert.equal(concurrent.filter((r) => r.body.duplicate).length, 1);
  const automatic = await db.downtime.findFirstOrThrow({
    where: { equipmentId: equipment[0].id, endedAt: null },
  });
  assert.equal(automatic.externalSourceId, sourceId);
  assert.equal(
    (await call({ ...event, state: "running" })).status,
    409,
    "ID reuse must not rewrite history",
  );
  assert.equal(
    (
      await call({
        ...event,
        eventId: "older-" + suffix,
        occurredAt: new Date(+startTime - 1000).toISOString(),
      })
    ).status,
    409,
  );
  assert.equal(
    (await post(admin, "/api/operations", { action: "stop", id: automatic.id }))
      .status,
    409,
    "Automatic timers cannot be overwritten manually while enabled",
  );
  let live = await get(operator, "/api/operations?view=live");
  assert(live.active.find((e) => e.id === automatic.id).integrationManaged);
  assert.equal(
    (
      await call({
        eventId: "up-" + suffix,
        machineId: "M0",
        state: "running",
        occurredAt: new Date(+startTime + 120000).toISOString(),
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await db.downtime.findUniqueOrThrow({ where: { id: automatic.id } })
    ).endedAt.toISOString(),
    new Date(+startTime + 120000).toISOString(),
  );
  await processSqlRows(sourceId, [
    {
      EventSequence: "9007199254740993",
      EventID: "sql-down-" + suffix,
      MachineID: "M1",
      State: "DOWN",
      OccurredAt: new Date(+startTime + 180000),
    },
    {
      EventSequence: "9007199254740994",
      EventID: "sql-up-" + suffix,
      MachineID: "M1",
      State: "RUNNING",
      OccurredAt: new Date(+startTime + 240000),
    },
  ]);
  assert.equal(
    (await db.integrationSource.findUniqueOrThrow({ where: { id: sourceId } }))
      .sqlCursor,
    "9007199254740994",
  );
  await assert.rejects(() =>
    processSqlRows(sourceId, [
      {
        EventSequence: "9007199254740995",
        EventID: "bad-" + suffix,
        MachineID: "UNKNOWN",
        State: "DOWN",
        OccurredAt: new Date(+startTime + 300000),
      },
    ]),
  );
  assert.equal(
    (await db.integrationSource.findUniqueOrThrow({ where: { id: sourceId } }))
      .sqlCursor,
    "9007199254740994",
  );
  const sqlVars = [
    "COMPANY_SQL_SERVER",
    "COMPANY_SQL_DATABASE",
    "COMPANY_SQL_USER",
    "COMPANY_SQL_PASSWORD",
    "COMPANY_SQL_SOURCE_ID",
    "COMPANY_SQL_VIEW",
  ];
  const priorSql = Object.fromEntries(
    sqlVars.map((key) => [key, process.env[key]]),
  );
  try {
    Object.assign(process.env, {
      COMPANY_SQL_SERVER: "localhost",
      COMPANY_SQL_DATABASE: "unused",
      COMPANY_SQL_USER: "unused",
      COMPANY_SQL_PASSWORD: randomUUID(),
      COMPANY_SQL_SOURCE_ID: sourceId,
      COMPANY_SQL_VIEW: "invalid;identifier",
    });
    const poll = await pollCompanySql();
    assert.equal(poll.processed, 0);
    assert.equal(
      (
        await db.integrationSource.findUniqueOrThrow({
          where: { id: sourceId },
        })
      ).sqlCursor,
      "9007199254740994",
    );
    assert.equal(
      (
        await db.setting.findUniqueOrThrow({
          where: { key: "company-sql-health" },
        })
      ).value.ok,
      false,
    );
  } finally {
    for (const [key, value] of Object.entries(priorSql))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  }
  const sqlConfig = companySqlConfig();
  assert.equal(sqlConfig.options.encrypt, true);
  assert.equal(sqlConfig.options.trustServerCertificate, false);
  // Disable source to authorize manual recovery if an adapter is unavailable.
  await call({
    eventId: "second-down-" + suffix,
    machineId: "M0",
    state: "down",
    occurredAt: new Date(+startTime + 360000).toISOString(),
  });
  const active = await db.downtime.findFirstOrThrow({
    where: { equipmentId: equipment[0].id, endedAt: null },
  });
  await post(admin, "/api/integrations", {
    action: "sourceState",
    id: sourceId,
    active: false,
  });
  live = await get(admin, "/api/operations?view=live");
  assert.equal(
    live.active.find((e) => e.id === active.id).integrationManaged,
    false,
  );
  assert.equal(
    (await post(admin, "/api/operations", { action: "stop", id: active.id }))
      .status,
    200,
  );
  await post(admin, "/api/integrations", {
    action: "sourceState",
    id: sourceId,
    active: true,
  });
  const previousToken = token;
  r = await post(admin, "/api/integrations", {
    action: "rotateKey",
    id: sourceId,
  });
  token = r.body.token;
  const denied = await admin.request.post(origin + "/api/integrations/events", {
    headers: { Authorization: "Bearer " + previousToken },
    data: event,
  });
  assert.equal(denied.status(), 401);
  assert.equal((await call(event)).status, 200);
  // UI navigation and alerts are actual production pages.
  await fs.mkdir("docs/screenshots/connected", { recursive: true });
  const page = await admin.newPage();
  await page.goto(origin);
  await page
    .locator("nav")
    .getByRole("button", { name: /Shift requirements$/ })
    .click();
  await page
    .getByRole("heading", { name: "Scheduled standard work", exact: true })
    .waitFor();
  await page.screenshot({
    path: "docs/screenshots/connected/shift-requirements.png",
    fullPage: true,
  });
  await page
    .locator("nav")
    .getByRole("button", { name: /Integrations$/ })
    .click();
  await page
    .getByRole("heading", { name: "Mapped machines", exact: true })
    .waitFor();
  await page.screenshot({
    path: "docs/screenshots/connected/integrations.png",
    fullPage: true,
  });
  const mp = await manager.newPage();
  await mp.goto(origin);
  await mp
    .locator("nav")
    .getByRole("button", { name: /Notifications/ })
    .click();
  await mp
    .getByRole("button", { name: "Open standard work", exact: true })
    .first()
    .waitFor();
  await mp.screenshot({
    path: "docs/screenshots/connected/manager-alerts.png",
    fullPage: true,
  });
  console.log(
    "PASS: required photos, manager evidence privacy, shift deadlines/per-person checks, deduplicated alerts, channels, local email stream/retries, source auth/rotation, idempotent real-time transitions, manual conflict protection, SQL cursor precision/retry and production UI.",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    await db.workSchedule.updateMany({
      where: { id: { in: schedules } },
      data: { active: false },
    });
    const ids = users.map((u) => u.id);
    await db.emailDelivery.deleteMany({
      where: { scheduleId: { in: schedules } },
    });
    await db.notification.deleteMany({ where: { userId: { in: ids } } });
    await db.shiftCheck.deleteMany({
      where: { scheduleId: { in: schedules } },
    });
    await db.workSchedule.deleteMany({ where: { id: { in: schedules } } });
    await db.integrationReceipt.deleteMany({
      where: { sourceId: { in: sources } },
    });
    await db.machineBinding.deleteMany({
      where: { sourceId: { in: sources } },
    });
    await db.downtime.deleteMany({
      where: { equipmentId: { in: equipment.map((e) => e.id) } },
    });
    await db.integrationSource.deleteMany({ where: { id: { in: sources } } });
    await db.record.deleteMany({ where: { userId: { in: ids } } });
    if (photoId) {
      await fs
        .unlink(
          require("node:path").join(
            process.cwd(),
            "uploads",
            photoId + ".webp",
          ),
        )
        .catch(() => {});
      await db.photo.deleteMany({ where: { id: photoId } });
    }
    await db.standard.deleteMany({
      where: { id: { in: standards.map((s) => s.id) } },
    });
    await db.equipment.deleteMany({
      where: { id: { in: equipment.map((e) => e.id) } },
    });
    if (reason) await db.downtimeReason.delete({ where: { id: reason.id } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });
