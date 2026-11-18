const { expandTools } = require("./ui-workspace.cjs");
require("tsx/cjs");
require("dotenv").config({ quiet: true });
const { db } = require("../lib/db.ts"),
  { hashPassword } = require("../lib/security.ts"),
  { plantCrewPreset } = require("../lib/crew-rotation.ts"),
  { checkShiftWork } = require("../lib/shift-monitor.ts"),
  { chromium } = require("playwright"),
  { randomUUID } = require("node:crypto"),
  ExcelJS = require("exceljs"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises");
const origin = process.env.APP_URL,
  suffix = randomUUID().slice(0, 8),
  plant = "Flow " + suffix;
let browser;
async function main() {
  assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
  const pass = "Fixture " + randomUUID() + "!",
    hash = await hashPassword(pass),
    eq = [];
  for (const department of ["Tableting", "Foreign"])
    eq.push(
      await db.equipment.create({
        data: {
          plant,
          department,
          area: "Compressing",
          line: "Line 1",
          name: "Press " + suffix,
        },
      }),
    );
  const users = [];
  for (const role of ["Admin", "DL/TL", "Manager"]) {
    users.push(
      await db.user.create({
        data: {
          username: "flow-" + suffix + users.length,
          name: role + " Fixture",
          role,
          password: hash,
          mustChange: false,
          workspaceAccess: {
            mode: "restricted",
            locations: [],
            equipmentIds: [eq[0].id],
          },
        },
      }),
    );
  }
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  async function req(c, path, body, status = 200) {
    const r = await c.request[body ? "post" : "get"](
      origin + path,
      body ? { headers: { Origin: origin }, data: body } : {},
    );
    assert.equal(r.status(), status, await r.text());
    return r.json();
  }
  const cs = [];
  for (const u of users) {
    const c = await browser.newContext({
      serviceWorkers: "block",
      viewport: { width: 1440, height: 1000 },
    });
    await req(c, "/api/account", {
      action: "login",
      username: u.username,
      password: pass,
      remember: false,
    });
    cs.push(c);
  }
  const [admin, leader, manager] = cs;
  await req(admin, "/api/platform", { action: "seed-catalog", plant });
  await req(admin, "/api/shift-schedules", {
    action: "configureCrews",
    config: { timezone: "America/Chicago", ...plantCrewPreset() },
  });
  await req(
    manager,
    "/api/shift-schedules",
    {
      action: "configureCrews",
      config: { timezone: "America/Chicago", ...plantCrewPreset() },
    },
    403,
  );
  const standards = [];
  for (const workflow of ["leader", "process", "changeover"]) {
    standards.push(
      await db.standard.create({
        data: {
          family: randomUUID(),
          revision: 1,
          title: workflow + " " + suffix,
          equipmentId: eq[0].id,
          kind: workflow === "changeover" ? "run" : "audit",
          workflow,
          created: new Date("2026-11-15T00:00:00Z"),
          target: 60,
          tolerance: 10,
          steps: [
            {
              id: "check",
              text: "Check condition " + suffix,
              group: "Startup",
              timing: "At changeover",
              photo: false,
            },
          ],
        },
      }),
    );
  }
  for (const crew of ["Shift 5", "Shift 4"]) {
    await req(admin, "/api/shift-schedules", {
      action: "create",
      family: standards[0].family,
      managerIds: [users[2].id],
      assigneeIds: [users[1].id],
      crewNames: [crew],
      shiftNames: [],
      notifyInApp: true,
      notifyEmail: false,
    });
  }
  await db.workSchedule.updateMany({
    where: { family: standards[0].family },
    data: {
      effectiveFrom: new Date("2026-11-18T00:00:00Z"),
      checkedThrough: new Date("2026-11-18T00:00:00Z"),
    },
  });
  await checkShiftWork(new Date("2026-11-20T11:30:00Z"));
  const schedules = await db.workSchedule.findMany({
      where: { family: standards[0].family },
    }),
    five = schedules.find((s) => s.crewNames[0] === "Shift 5"),
    four = schedules.find((s) => s.crewNames[0] === "Shift 4");
  const checks = await db.shiftCheck.findMany({
    where: { scheduleId: five.id },
    orderBy: { shiftStart: "asc" },
  });
  assert.equal(checks.length, 2);
  assert.equal(
    await db.shiftCheck.count({ where: { scheduleId: four.id } }),
    0,
  );
  assert.equal(checks[0].shiftStart.toISOString(), "2026-11-18T11:30:00.000Z");
  await req(leader, "/api/platform", {
    action: "audit",
    standardId: standards[0].id,
    started: new Date(Date.now() - 1000).toISOString(),
    responses: [
      {
        stepId: "check",
        answer: true,
        photo: null,
        comment: "Recorded detail",
      },
    ],
    handoff: {
      shift: "Shift 5",
      notes: "Pass-down fixture",
      rooms: [
        {
          room: "Room 1",
          item: "ITEM1",
          lot: "LOT1",
          targetSpeed: "100",
          actualSpeed: "95",
          remaining: "3 bags",
          issues: "Fixture",
          nextOrder: "Yes",
          status: "Running",
        },
      ],
    },
  });
  await req(
    leader,
    "/api/platform",
    {
      action: "run",
      standardId: standards[2].id,
      started: new Date(Date.now() - 1000).toISOString(),
      responses: [
        { stepId: "check", answer: true, photo: null, comment: "Fixture" },
      ],
    },
    400,
  );
  const page = await leader.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin);
  await expandTools(page);
  await page
    .locator("nav")
    .getByRole("button", { name: /Changeover standards/ })
    .click();
  await page
    .getByRole("heading", {
      name: "Changeover standards",
      exact: true,
      level: 1,
    })
    .waitFor();
  await page
    .getByLabel("Standard work", { exact: true })
    .selectOption(standards[2].id);
  await page
    .getByLabel("Previous product / format", { exact: true })
    .fill("Product A");
  await page
    .getByLabel("Next product / format", { exact: true })
    .fill("Product B");
  await page
    .getByLabel("Changeover type", { exact: true })
    .selectOption("Major");
  await page.getByRole("button", { name: "✓ Yes", exact: true }).click();
  await fs.mkdir("docs/screenshots/crew-changeover-flow", { recursive: true });
  await page.screenshot({
    path: "docs/screenshots/crew-changeover-flow/changeover.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Complete changeover", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Saved to the database." })
    .waitFor();
  const saved = await db.record.findFirstOrThrow({
    where: { standardId: standards[2].id },
  });
  assert.equal(saved.data.changeover.fromProduct, "Product A");
  assert.equal(saved.data.snapshot.workflow, "changeover");
  const foreign = await db.standard.create({
    data: {
      family: randomUUID(),
      revision: 1,
      title: "Foreign " + suffix,
      equipmentId: eq[1].id,
      kind: "audit",
      workflow: "leader",
      target: 60,
      tolerance: 10,
      steps: [{ id: "check", text: "Hidden", photo: false }],
    },
  });
  async function workbook(c, path) {
    const r = await c.request.get(origin + path);
    assert.equal(r.status(), 200, await r.text());
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await r.body());
    return book;
  }
  const book = await workbook(
    manager,
    "/api/export?section=leaders&equipment=" + eq[0].id,
  );
  const rows = book.getWorksheet("Leader handoff");
  assert.equal(rows.rowCount, 2);
  assert.equal(rows.getRow(2).getCell(3).value, "Room 1");
  assert.equal(rows.getRow(2).getCell(6).value, "100");
  assert.equal(
    book.getWorksheet("Task answers").getRow(2).getCell(7).value,
    "Recorded detail",
  );
  assert(book.getWorksheet("Published checklists").rowCount > 1);
  assert(!JSON.stringify(book.model).includes(foreign.title));
  const empty = await workbook(
    manager,
    "/api/export?section=leaders&equipment=" + eq[1].id,
  );
  assert.equal(empty.getWorksheet("Task answers").rowCount, 1);
  assert.equal(empty.getWorksheet("Published checklists").rowCount, 1);
  const co = await workbook(
    manager,
    "/api/export?section=changeovers&equipment=" + eq[0].id,
  );
  assert.equal(
    co.getWorksheet("Changeovers").getRow(2).getCell(14).value,
    "Product A",
  );
  const searched = await workbook(
    manager,
    "/api/export?section=leaders&equipment=" +
      eq[0].id +
      "&person=" +
      users[1].id +
      "&search=" +
      encodeURIComponent(eq[0].name),
  );
  assert.equal(searched.getWorksheet("Task answers").rowCount, 2);
  const otherPerson = await workbook(
    manager,
    "/api/export?section=leaders&person=" + users[0].id,
  );
  assert.equal(otherPerson.getWorksheet("Task answers").rowCount, 1);
  await db.record.create({
    data: {
      kind: "study",
      userId: users[1].id,
      data: {
        title: "Study " + suffix,
        equipmentId: eq[0].id,
        equipmentSnapshot: eq[0],
        cycles: [
          { element: "Stage", seconds: 2, at: new Date().toISOString() },
          { element: "Stage", seconds: 4, at: new Date().toISOString() },
        ],
      },
    },
  });
  const study = await workbook(
    manager,
    "/api/export?section=studies&equipment=" + eq[0].id,
  );
  assert.equal(study.getWorksheet("Time observations").rowCount, 3);
  assert.equal(study.getWorksheet("Statistics").getRow(2).getCell(4).value, 3);
  assert.equal(study.getWorksheet("Leader handoff"), undefined);
  const productMatches = await req(
    leader,
    "/api/platform?view=changeovers&search=" + encodeURIComponent("Product A"),
  );
  assert.equal(productMatches.records.length, 1);
  const productExport = await workbook(
    manager,
    "/api/export?section=changeovers&search=" + encodeURIComponent("Product A"),
  );
  assert.equal(productExport.getWorksheet("Changeovers").rowCount, 2);
  const downtimeExport = await workbook(
    manager,
    "/api/export?section=downtime&equipment=" + eq[0].id,
  );
  assert.deepEqual(
    downtimeExport.worksheets.map((s) => s.name),
    ["Downtime events", "Downtime shifts"],
  );
  const ideasExport = await workbook(
    manager,
    "/api/export?section=ideas&equipment=" + eq[0].id,
  );
  assert.deepEqual(
    ideasExport.worksheets.map((s) => s.name),
    ["Improvement ideas"],
  );
  for (const [status, owner] of [
    ["Open", users[2].id],
    ["Closed", users[2].id],
    ["Open", users[0].id],
  ])
    await db.idea.create({
      data: {
        title: "Focused idea " + randomUUID(),
        equipmentId: eq[0].id,
        equipmentSnapshot: eq[0],
        currentState: "Before",
        proposal: "After",
        dueDate: "2030-01-01",
        status,
        createdBy: owner,
        submitterId: owner,
        pilotId: owner,
        validatorId: owner,
      },
    });
  const personalIdeas = await workbook(
    manager,
    "/api/export?section=ideas&focus=personal-open&equipment=" + eq[0].id,
  );
  assert.equal(personalIdeas.getWorksheet("Improvement ideas").rowCount, 2);
  const adminPage = await admin.newPage();
  adminPage.on("pageerror", (e) => errors.push(e.message));
  await adminPage.goto(origin);
  await adminPage
    .locator("nav")
    .getByRole("button", { name: /Locations/ })
    .click();
  const location = adminPage
    .getByRole("heading", { name: "Departments, areas and lines", exact: true })
    .locator("..");
  assert.equal(await location.locator("ul").count(), 0);
  assert.equal(
    await adminPage
      .getByText("Load departments and known areas from the supplied forms", {
        exact: true,
      })
      .count(),
    0,
  );
  await adminPage
    .getByRole("combobox", { name: "Find an existing location", exact: true })
    .fill("Tableting");
  assert((await adminPage.getByRole("option").count()) > 0);
  await fs.mkdir("docs/screenshots/crew-changeover-flow", { recursive: true });
  await adminPage.screenshot({
    path: "docs/screenshots/crew-changeover-flow/locations.png",
    fullPage: true,
  });
  await adminPage
    .locator("nav")
    .getByRole("button", { name: /Shift requirements/ })
    .click();
  await adminPage
    .getByText("Configure rotating crews and 12-hour shift times", {
      exact: true,
    })
    .click();
  await adminPage
    .getByRole("button", {
      name: "Use plant roster: crews 4/7 and 5/6 · 5:30 starts",
      exact: true,
    })
    .click();
  await adminPage.setViewportSize({ width: 820, height: 1180 });
  assert(
    await adminPage.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await adminPage.screenshot({
    path: "docs/screenshots/crew-changeover-flow/roster-tablet.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: confirmed roster setup, per-user crew requirements, off-day alert suppression, scoped changeover UI completion, immutable context, readable filtered Excel and empty definitions, foreign department isolation, compact locations and tablet roster.",
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
