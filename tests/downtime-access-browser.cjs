require("tsx/cjs");
require("dotenv").config({ quiet: true });
const { randomUUID } = require("node:crypto"),
  assert = require("node:assert/strict"),
  { chromium } = require("playwright"),
  fs = require("node:fs/promises");
const { db } = require("../lib/db.ts"),
  { hashPassword } = require("../lib/security.ts");
const { selectDowntimeMachine } = require("./helpers/downtime.cjs");
const origin = process.env.APP_URL || "http://localhost:3000",
  users = [],
  equipment = [];
let reason, browser, managerPolicy;
async function main() {
  assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
  const suffix = randomUUID().slice(0, 8),
    password = `Location ${randomUUID()}!`,
    hash = await hashPassword(password);
  for (const [role, name] of [
    ["Admin", "Jordan Location Admin"],
    ["Operator", "Alex Location Operator"],
    ["Manager", "Taylor Account Manager"],
  ])
    users.push(
      await db.user.create({
        data: {
          username: `locations-${users.length}-${suffix}`,
          name,
          role,
          password: hash,
          mustChange: false,
          workspaceAccess:{mode:"all",locations:[],equipmentIds:[]},
        },
      }),
    );
  for (const [name, plant, department, area] of [
    ["Packer 01", "North", "Assembly", "Packing"],
    ["Packer 02", "North", "Assembly", "Packing"],
    ["Welder 01", "North", "Assembly", "Welding"],
    ["South packer", "South", "Assembly", "Packing"],
    ["Mill 01", "North", "Machining", "Cell A"],
  ])
    equipment.push(
      await db.equipment.create({
        data: { name, plant, department, area, line: "Line A" },
      }),
    );
  for(const e of equipment) await db.location.upsert({where:{plant_department_area_line:{plant:e.plant,department:e.department,area:e.area,line:e.line}},create:{plant:e.plant,department:e.department,area:e.area,line:e.line},update:{}});
  reason = await db.downtimeReason.create({
    data: { name: "Location verification " + suffix },
  });
  managerPolicy = (
    await db.policy.findUniqueOrThrow({ where: { role: "Manager" } })
  ).grants;
  await db.policy.update({
    where: { role: "Manager" },
    data: { grants: [...new Set([...managerPolicy, "users"])] },
  });
  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const contexts = [];
  for (const u of users) {
    const c = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
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
  const [admin, operator, manager] = contexts;
  async function post(c, path, body) {
    const r = await c.request.post(origin + path, {
      headers: { Origin: origin },
      data: body,
    });
    return { status: r.status(), body: await r.json() };
  }
  async function get(c, path) {
    const r = await c.request.get(origin + path);
    assert.equal(r.status(), 200, await r.text());
    return r.json();
  }
  const assign = (access, c = admin) =>
    post(c, "/api/platform", {
      action: "downtimeAccess",
      id: users[1].id,
      access,
    });
  const start = (eq, c = operator) =>
    post(c, "/api/operations", {
      action: "start",
      equipmentId: eq.id,
      reasonId: reason.id,
    });
  const stop = (id, c = operator) =>
    post(c, "/api/operations", { action: "stop", id });
  const empty = { mode: "restricted", locations: [], equipmentIds: [] };
  assert.equal((await assign(empty, manager)).status, 403);
  assert.equal(
    (
      await post(manager, "/api/platform", {
        action: "user",
        id: users[1].id,
        username: users[1].username,
        name: users[1].name,
        role: "Admin",
        active: true,
      })
    ).status,
    403,
  );
  assert.equal(
    (await assign({ ...empty, equipmentIds: [randomUUID()] })).status,
    400,
  );
  assert.equal((await assign(empty)).status, 200);
  assert.equal((await start(equipment[0])).status, 403);
  let ops = await get(operator, "/api/operations?view=downtime");
  assert.equal(ops.equipment.length, 0);
  assert.equal(ops.downtime.length, 0);
  assert.equal(
    (await assign({ ...empty, equipmentIds: [equipment[0].id] })).status,
    200,
  );
  ops = await get(operator, "/api/operations?view=downtime");
  assert.deepEqual(
    ops.equipment.map((e) => e.id),
    [equipment[0].id],
  );
  assert.equal((await start(equipment[1])).status, 403);
  assert.equal((await start(equipment[3])).status, 403);
  assert.equal((await start(equipment[3], admin)).status, 200);
  const foreign = await db.downtime.findFirstOrThrow({
    where: { equipmentId: equipment[3].id, endedAt: null },
  });
  assert.equal((await stop(foreign.id)).status, 403);
  const page = await operator.newPage();
  await page.goto(origin);
  await page
    .locator("nav")
    .getByRole("button", { name: /Downtime$/ })
    .click();
  await page
    .getByRole("heading", { name: "Track a stoppage", exact: true })
    .waitFor();
  assert(await page.getByLabel("Recording area", { exact: true }).isDisabled());
  assert(await page.getByLabel("Machine", { exact: true }).isDisabled());
  await selectDowntimeMachine(page, equipment[0]);
  assert.equal(
    await page.getByLabel("Machine", { exact: true }).locator("option").count(),
    2,
  );
  await page
    .getByLabel("Downtime reason", { exact: true })
    .selectOption(reason.id);
  await page
    .getByRole("button", { name: "Start downtime", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Stop downtime", exact: true })
    .waitFor();
  let event = await db.downtime.findFirstOrThrow({
    where: { equipmentId: equipment[0].id, endedAt: null },
  });
  ops = await get(operator, "/api/operations?view=full");
  assert(!ops.downtime.some((d) => d.id === foreign.id));
  const live = await get(operator, "/api/operations?view=live");
  assert.deepEqual(
    live.active.map((d) => d.id),
    [event.id],
  );
  // Access revocation takes effect without logging the operator out.
  assert.equal((await assign(empty)).status, 200);
  assert.equal((await stop(event.id)).status, 403);
  assert.equal(
    (await get(operator, "/api/operations?view=live")).active.length,
    0,
  );
  assert.equal((await stop(event.id, admin)).status, 200);
  assert.equal((await stop(foreign.id, admin)).status, 200);
  // Area grants are scoped by plant, and allow future machines in the area.
  assert.equal(
    (
      await assign({
        ...empty,
        locations: [
          { plant: "North", department: "Assembly", area: "Packing" },
        ],
      })
    ).status,
    200,
  );
  const added = await db.equipment.create({
    data: {
      name: "Future packer",
      plant: "North",
      department: "Assembly",
      area: "Packing",
      line: "Line B",
    },
  });
  equipment.push(added);
  ops = await get(operator, "/api/operations?view=downtime");
  assert.deepEqual(
    new Set(ops.equipment.map((e) => e.id)),
    new Set([equipment[0].id, equipment[1].id, added.id]),
  );
  assert.equal((await start(equipment[2])).status, 403);
  assert.equal((await start(equipment[3])).status, 403);
  assert.equal(
    (
      await assign({
        ...empty,
        locations: [{ plant: "North", department: "Assembly", area: null }],
      })
    ).status,
    200,
  );
  assert.equal((await start(equipment[2])).status, 200);
  const weldingEvent = await db.downtime.findFirstOrThrow({
    where: { equipmentId: equipment[2].id, endedAt: null },
  });
  assert.equal((await stop(weldingEvent.id)).status, 200);
  await page.reload();
  await page
    .locator("nav")
    .getByRole("button", { name: /Downtime$/ })
    .click();
  await selectDowntimeMachine(page, equipment[0]);
  await page
    .getByLabel("Recording area", { exact: true })
    .selectOption(JSON.stringify("Welding"));
  assert.equal(
    await page.getByLabel("Machine", { exact: true }).inputValue(),
    "",
  );
  assert.equal(
    await page.getByLabel("Downtime reason", { exact: true }).inputValue(),
    "",
  );
  assert.equal(
    await page.getByLabel("Machine", { exact: true }).locator("option").count(),
    2,
  );
  // Native admin editor round-trip, with only one machine assigned.
  const ap = await admin.newPage();
  await ap.goto(origin);
  await ap
    .locator("nav")
    .getByRole("button", { name: /Accounts$/ })
    .click();
  await ap.getByLabel("Account", { exact: true }).selectOption(users[1].id);
  await ap
    .getByLabel("Downtime access", { exact: true })
    .selectOption("restricted");
  await ap
    .getByRole("checkbox", {
      name: "Allow department Assembly at North",
      exact: true,
    })
    .uncheck();
  await ap
    .getByRole("checkbox", {
      name: `Allow machine ${equipment[0].name} ${equipment[0].id}`,
      exact: true,
    })
    .check();
  await ap
    .getByRole("button", { name: "Save downtime access", exact: true })
    .click();
  await ap.getByRole("status").waitFor();
  const saved = (
    await db.user.findUniqueOrThrow({ where: { id: users[1].id } })
  ).downtimeAccess;
  assert.deepEqual(saved, {
    mode: "restricted",
    locations: [],
    equipmentIds: [equipment[0].id],
  });
  const dismiss = ap.getByRole("button", { name: "Dismiss", exact: true });
  if (await dismiss.count()) await dismiss.click();
  await fs.mkdir("docs/screenshots/downtime-access", { recursive: true });
  await ap
    .locator("section")
    .filter({
      has: ap.getByRole("heading", {
        name: "Downtime location access · " + users[1].name,
        exact: true,
      }),
    })
    .screenshot({
      path: "docs/screenshots/downtime-access/admin-assignments.png",
    });
  await page.reload();
  await page
    .locator("nav")
    .getByRole("button", { name: /Downtime$/ })
    .click();
  await selectDowntimeMachine(page, equipment[0]);
  await page
    .getByLabel("Downtime reason", { exact: true })
    .selectOption(reason.id);
  await page.screenshot({
    path: "docs/screenshots/downtime-access/operator-hierarchy.png",
    fullPage: true,
  });
  const mp = await manager.newPage();
  await mp.goto(origin);
  await mp
    .locator("nav")
    .getByRole("button", { name: /Accounts$/ })
    .click();
  await mp.getByLabel("Account", { exact: true }).selectOption(users[1].id);
  assert.equal(
    await mp.getByLabel("Downtime access", { exact: true }).count(),
    0,
  );
  // Operational exports use the same assignment filter, even with export rights.
  const originalOperator = (
    await db.policy.findUniqueOrThrow({ where: { role: "Operator" } })
  ).grants;
  try {
    await db.policy.update({
      where: { role: "Operator" },
      data: { grants: [...new Set([...originalOperator, "export"])] },
    });
    const r = await operator.request.get(origin + "/api/export");
    assert.equal(r.status(), 200);
    const Excel = require("exceljs"),
      book = new Excel.Workbook();
    await book.xlsx.load(await r.body());
    const rows = [];
    book.getWorksheet("Downtime events").eachRow((r, i) => {
      if (i > 1) rows.push(r.getCell(1).value);
    });
    assert(rows.includes(event.id));
    assert(!rows.includes(foreign.id));
    assert(!rows.includes(weldingEvent.id));
  } finally {
    await db.policy.update({
      where: { role: "Operator" },
      data: { grants: originalOperator },
    });
  }
  const adminOps = await get(admin, "/api/operations?view=downtime");
  assert(adminOps.equipment.some((e) => e.id === equipment[3].id));
  console.log(
    "PASS: hierarchical selection/reset, plant isolation, per-machine/area/department access, future machines, Admin controls, no-access default, immediate revocation, forbidden starts/stops, scoped history/live/export, and admin assignment UI.",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    if (managerPolicy)
      await db.policy.update({
        where: { role: "Manager" },
        data: { grants: managerPolicy },
      });
    await db.downtime.deleteMany({
      where: { equipmentId: { in: equipment.map((e) => e.id) } },
    });
    await db.equipment.deleteMany({
      where: { id: { in: equipment.map((e) => e.id) } },
    });
    if (reason) await db.downtimeReason.delete({ where: { id: reason.id } });
    await db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
    await db.$disconnect();
  });
