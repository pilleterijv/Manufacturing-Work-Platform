require("tsx/cjs");
require("dotenv").config({ quiet: true });
const { db } = require("../lib/db.ts"),
  { hashPassword } = require("../lib/security.ts"),
  { nearbyShifts } = require("../lib/work-queue-rules.ts"),
  { localToday } = require("../lib/operations-rules.ts"),
  { equipmentLabel } = require("../lib/equipment-label.ts"),
  { chromium } = require("playwright"),
  { randomUUID } = require("node:crypto"),
  fs = require("node:fs/promises"),
  assert = require("node:assert/strict");
const origin = process.env.APP_URL,
  suffix = randomUUID().slice(0, 8),
  users = [],
  equipment = [],
  standards = [],
  schedules = [],
  plans = [],
  roles = [];
let browser, caseId;
async function main() {
  assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
  const password = "Queue fixture " + randomUUID() + "!",
    hash = await hashPassword(password),
    plant = "Queue " + suffix;
  for (const [department, line] of [
    ["Tableting", "Line 1"],
    ["Tableting", "Line 2"],
    ["Packaging", "Line 3"],
  ])
    equipment.push(
      await db.equipment.create({
        data: {
          name: "Press 01",
          plant,
          department,
          area: "Compressing",
          line,
        },
      })
    );
  const scope = {
      mode: "restricted",
      locations: [{ plant, department: "Tableting", area: "Compressing" }],
      equipmentIds: [],
    },
    otherScope = {
      mode: "restricted",
      locations: [],
      equipmentIds: [equipment[2].id],
    };
  for (const [name, baseRole, profile, grants, privileges] of [
    [
      "Technician",
      "Operator",
      "maintenance",
      ["maintenance", "defects", "centerlines", "work"],
      ["maintenance.manage"],
    ],
    [
      "Supervisor",
      "DL/TL",
      "supervisor",
      ["work", "audits", "analytics", "dashboard", "maintenance", "defects", "problems", "ideas"],
      [],
    ],
  ]) {
    const r = await db.policy.create({
      data: {
        role: name + " " + suffix,
        baseRole,
        homeProfile: profile,
        grants,
        adminPrivileges: privileges,
      },
    });
    roles.push(r.role);
  }
  for (const [name, role, customRole] of [
    ["Operator", "Operator", null],
    ["Maintenance", "Operator", roles[0]],
    ["Manager", "Manager", null],
    ["Supervisor", "DL/TL", roles[1]],
    ["Foreign", "Operator", null],
    ["Admin", "Admin", null],
  ])
    users.push(
      await db.user.create({
        data: {
          username: "queue-" + suffix + "-" + users.length,
          name: name + " Fixture",
          role,
          customRole,
          password: hash,
          mustChange: false,
          workspaceAccess: name === "Foreign" ? otherScope : scope,
        },
      })
    );
  const setting = await db.setting.findUniqueOrThrow({
      where: { key: "shifts" },
    }),
    config = setting.value,
    now = new Date(),
    today = localToday(config.timezone, now),
    current = nearbyShifts(config, now).find((w) => +w.start <= +now && +w.end > +now),
    family = randomUUID();
  assert(current);
  for (const revision of [1, 2])
    standards.push(
      await db.standard.create({
        data: {
          family,
          revision,
          title: "Press start-up " + suffix,
          equipmentId: equipment[0].id,
          target: 60,
          tolerance: 10,
          steps: [{ id: "guard", text: "Guard ready", photo: false }],
          created: new Date(+current.start - (revision === 1 ? 2 * 86400000 : 1000)),
        },
      })
    );
  schedules.push(
    await db.workSchedule.create({
      data: {
        family,
        equipmentId: equipment[0].id,
        title: "Required press check " + suffix,
        kind: "run",
        assigneeIds: [users[0].id],
        managerIds: [users[2].id],
        shiftNames: config.shifts.map((s) => s.name),
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        config,
        notifyEmail: false,
        notifyInApp: true,
        effectiveFrom: new Date(+current.start - 2 * 86400000),
        checkedThrough: new Date(+current.start - 2 * 86400000),
        createdBy: users[2].id,
      },
    })
  );
  for (const [id, kind, nextDue, assigneeId, equipmentId, title] of [
    [
      "00000000-0000-4000-8000-000000000001",
      "pm",
      "2030-01-01",
      users[1].id,
      equipment[0].id,
      "Future annual service",
    ],
    [
      "ffffffff-ffff-4fff-8fff-ffffffffffff",
      "pm",
      "2000-01-01",
      users[1].id,
      equipment[0].id,
      "Overdue guard inspection",
    ],
    [randomUUID(), "pm", today, users[1].id, equipment[0].id, "Due today inspection"],
    [randomUUID(), "cil", today, users[1].id, equipment[0].id, "Clean and inspect"],
    [randomUUID(), "pm", "2000-01-01", users[4].id, equipment[2].id, "Restricted PM"],
  ])
    plans.push(
      await db.maintenancePlan.create({
        data: {
          id,
          kind,
          nextDue,
          assigneeId,
          equipmentId,
          title,
          steps: [{ id: "check", text: "Check condition", photo: false }],
          intervalDays: 7,
          createdBy: users[2].id,
          history: [],
        },
      })
    );
  await db.defect.create({
    data: {
      equipmentId: equipment[0].id,
      equipmentSnapshot: equipment[0],
      title: "Critical guard defect " + suffix,
      description: "Synthetic condition",
      priority: "Critical",
      reportedBy: users[0].id,
      assigneeId: users[1].id,
      media: [],
      history: [],
    },
  });
  await db.defect.create({
    data: {
      equipmentId: equipment[2].id,
      equipmentSnapshot: equipment[2],
      title: "Restricted defect " + suffix,
      description: "Hidden condition",
      priority: "Critical",
      reportedBy: users[4].id,
      media: [],
      history: [],
    },
  });
  const investigation = await db.problem.create({
    data: {
      reference: "QUEUE-" + suffix,
      title: "Overdue investigation " + suffix,
      method: "2D",
      equipmentId: equipment[0].id,
      equipmentSnapshot: equipment[0],
      occurredOn: "2000-01-01",
      reportedBy: users[0].name,
      ownerId: users[3].id,
      reviewerId: users[2].id,
      team: "Production",
      dueDate: "2000-01-02",
      answers: {},
      history: [],
      createdBy: users[3].id,
      status: "Verification",
    },
  });
  caseId = investigation.id;
  await db.idea.create({
    data: {
      title: "Validation idea " + suffix,
      equipmentId: equipment[0].id,
      equipmentSnapshot: equipment[0],
      currentState: "Before",
      proposal: "After",
      dueDate: "2030-01-01",
      status: "Validation",
      createdBy: users[0].id,
      submitterId: users[0].id,
      pilotId: users[3].id,
      validatorId: users[2].id,
    },
  });
  await db.content.create({
    data: {
      kind: "guide",
      title: "Guard guide " + suffix,
      equipmentId: equipment[0].id,
      body: "Approved guard instructions",
      media: [],
    },
  });
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  async function req(c, path, body, status = 200) {
    const r = await c.request[body ? "post" : "get"](
      origin + path,
      body ? { headers: { Origin: origin }, data: body } : {}
    );
    assert.equal(r.status(), status, await r.text());
    return r.json();
  }
  async function login(i) {
    const c = await browser.newContext({
      serviceWorkers: "block",
      viewport: { width: 1440, height: 1000 },
    });
    await req(c, "/api/account", {
      action: "login",
      username: users[i].username,
      password,
      remember: false,
    });
    return c;
  }
  const contexts = await Promise.all(users.map((_, i) => login(i))),
    [operator, maintenance, manager, supervisor, foreign, admin] = contexts;
  const anon = await browser.newContext();
  await req(anon, "/api/work-queue", null, 401);
  await req(anon, "/api/assets", null, 401);
  await req(operator, "/api/work-queue?scope=team", null, 403);
  let q = await req(operator, "/api/work-queue");
  assert(q.items.some((r) => r.status === "Due this shift" && r.canPerform));
  assert(q.items.some((r) => r.status === "Missed" && !r.canPerform));
  assert(q.items.every((r) => r.equipmentId !== equipment[2].id));
  await db.record.create({
    data: {
      kind: "run",
      userId: users[0].id,
      standardId: standards[0].id,
      created: new Date(Math.max(+current.start + 1, +now - 5000)),
      data: {
        snapshot: { ...standards[0], equipment: equipment[0] },
        equipmentId: equipment[0].id,
        responses: [{ stepId: "guard", answer: true, comment: "Fixture", photo: null }],
        durationSeconds: 5,
        followUp: false,
      },
    },
  });
  q = await req(operator, "/api/work-queue");
  assert(q.items.some((r) => r.status === "Due this shift"));
  await db.record.create({
    data: {
      kind: "run",
      userId: users[0].id,
      standardId: standards[1].id,
      created: new Date(Math.max(+current.start + 2, +now - 1000)),
      data: {
        snapshot: { ...standards[1], equipment: equipment[0] },
        equipmentId: equipment[0].id,
        responses: [{ stepId: "guard", answer: true, comment: "Fixture", photo: null }],
        durationSeconds: 5,
        followUp: false,
      },
    },
  });
  q = await req(operator, "/api/work-queue");
  assert(q.items.some((r) => r.status === "Completed"));
  assert(!q.items.some((r) => r.status === "Due this shift"));
  assert(q.items.some((r) => r.status === "Missed"));
  const team = await req(supervisor, "/api/work-queue?scope=team");
  assert(team.items.some((r) => r.type === "Investigation" && r.status === "Awaiting validation"));
  assert(team.items.filter((r) => r.id.startsWith("schedule:")).every((r) => !r.canPerform));
  const mine = await req(maintenance, "/api/work-queue");
  assert(mine.items[0].type === "Defect" && mine.items[0].status === "Urgent");
  assert(mine.items.some((r) => r.type === "PM" && r.status === "Due today" && r.canPerform));
  assert(mine.items.every((r) => r.equipmentId !== equipment[2].id));
  assert(!mine.items.some((r) => r.type === "Investigation"));
  const scoped = await req(manager, "/api/work-queue?equipment=" + equipment[2].id);
  assert.equal(scoped.items.length, 0);
  const assets = await req(maintenance, "/api/assets");
  assert(!assets.equipment.some((e) => e.id === equipment[2].id));
  assert.equal(new Set(assets.equipment.map((e) => e.label)).size, assets.equipment.length);
  assert(assets.equipment.every((e) => e.label.includes(e.id) && e.label.includes(e.line)));
  const pm = await req(maintenance, "/api/maintenance?kind=pm");
  assert.equal(pm.plans[0].id, plans[1].id);
  assert.equal(pm.plans[1].id, plans[2].id);
  await req(maintenance, "/api/maintenance?cursor=" + plans[4].id, null, 400);
  const restricted = await req(maintenance, "/api/maintenance?equipment=" + equipment[2].id);
  assert.equal(restricted.plans.length, 0);
  assert.equal(restricted.records.length, 0);
  const selected = await req(operator, "/api/platform?view=work&equipment=" + equipment[1].id);
  assert.equal(selected.standards.length, 0);
  assert.equal(selected.records.length, 0);
  const page = await maintenance.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin);
  await page.getByRole("heading", { name: "My maintenance work", exact: true }).waitFor();
  await page.locator(".work-queue .queue-row").first().waitFor();
  assert(
    (
      await page
        .locator(".work-queue .queue-row")
        .first()
        .getByRole("button", { name: "Review item", exact: true })
        .boundingBox()
    ).y < 1000,
    "The first maintenance action should be visible without scrolling"
  );
  assert((await page.locator("nav > .nav-group:visible").count()) <= 8);
  const machineLabels = await page
    .getByLabel("Machine context", { exact: true })
    .locator("option")
    .allTextContents();
  assert.equal(new Set(machineLabels).size, machineLabels.length);
  await fs.mkdir("docs/screenshots/shift-queues-assets", { recursive: true });
  await page.screenshot({
    path: "docs/screenshots/shift-queues-assets/maintenance-home.png",
    fullPage: true,
  });
  await page
    .locator("nav")
    .getByRole("button", { name: /Machines/ })
    .click();
  await page.getByRole("combobox", { name: "Find a machine", exact: true }).fill("Line 1");
  await page.locator('[role="listbox"] [role="option"]').filter({ hasText: equipment[0].id }).click();
  await page.getByText("Guard guide " + suffix, { exact: true }).waitFor();
  await page.getByRole("button", { name: "Maintenance", exact: true }).click();
  await page.getByText("Due today inspection", { exact: true }).waitFor();
  assert(!(await page.locator(".machine-workspace").innerText()).includes("Restricted PM"));
  await page.screenshot({
    path: "docs/screenshots/shift-queues-assets/machine-workspace.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Work queue for this machine", exact: true }).click();
  await page.getByRole("heading", { name: "My maintenance work queue", exact: true }).waitFor();
  await page.getByRole("button", { name: "Perform task", exact: true }).first().click();
  await page.getByRole("button", { name: "Perform PM", exact: true }).click();
  await page.getByLabel("Recording target", { exact: true }).waitFor();
  assert((await page.getByLabel("Recording target", { exact: true }).innerText()).includes(equipment[0].id));
  await page.getByLabel("Machine context", { exact: true }).selectOption(equipment[1].id);
  assert((await page.getByLabel("Recording target", { exact: true }).innerText()).includes(equipment[0].id));
  await page.screenshot({
    path: "docs/screenshots/shift-queues-assets/recording-target.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 820, height: 1180 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({
    path: "docs/screenshots/shift-queues-assets/tablet-recording.png",
    fullPage: true,
  });
  const mp = await manager.newPage();
  await mp.goto(origin);
  await mp
    .getByRole("heading", {
      name: "Assigned to me and my station",
      exact: true,
    })
    .waitFor();
  await mp.getByRole("button", { name: "Work queue", exact: false }).first().count();
  await mp
    .locator("nav")
    .getByRole("button", { name: /Work queue/ })
    .click();
  await mp.getByRole("button", { name: "Awaiting validation", exact: true }).click();
  await mp.getByText("Validation idea " + suffix, { exact: false }).waitFor();
  assert(!(await mp.locator(".work-queue").innerText()).includes("Restricted defect"));
  await mp.getByLabel("Find a section", { exact: true }).fill("Accounts");
  await mp
    .locator("nav > .nav-group:visible")
    .getByRole("button", { name: /Accounts/ })
    .click();
  await mp.getByRole("heading", { name: "Department accounts", exact: false }).waitFor();
  // Equal due dates must paginate without skipping or duplicating plans,
  // even when the plan represented by the page cursor is removed.
  const pagingIds = Array.from({ length: 105 }, () => randomUUID()).sort();
  await db.maintenancePlan.createMany({
    data: pagingIds.map((id) => ({
      id,
      kind: "pm",
      equipmentId: equipment[1].id,
      title: "Paging fixture " + suffix,
      assigneeId: users[1].id,
      nextDue: "2020-01-01",
      steps: [{ id: "inspect", text: "Inspect", photo: false }],
      intervalDays: 7,
      createdBy: users[2].id,
      history: [],
    })),
  });
  try {
    const path = "/api/maintenance?kind=pm&equipment=" + equipment[1].id;
    const first = await req(maintenance, path);
    assert.equal(first.plans.length, 100);
    assert.deepEqual(
      first.plans.map((p) => p.id),
      pagingIds.slice(0, 100)
    );
    assert(first.cursor);
    await db.maintenancePlan.delete({ where: { id: pagingIds[99] } });
    const second = await req(maintenance, path + "&cursor=" + encodeURIComponent(first.cursor));
    assert.deepEqual(
      second.plans.map((p) => p.id),
      pagingIds.slice(100)
    );
    assert.equal(second.hasMore, false);
  } finally {
    await db.maintenancePlan.deleteMany({ where: { id: { in: pagingIds } } });
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: scoped current/missed/completed shift checks, revision matching, task ownership, maintenance priority and due-today labels, role home profiles, distinct machine labels, machine workspace, recording target, compact navigation and manager validation queue."
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    await db.$disconnect();
  });
