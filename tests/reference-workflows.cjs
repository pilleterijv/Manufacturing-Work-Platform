require("tsx/cjs");
require("dotenv").config({ quiet: true });
const assert = require("node:assert/strict"),
  { randomUUID } = require("node:crypto"),
  { chromium } = require("playwright"),
  fs = require("node:fs/promises");
const { db } = require("../lib/db.ts"),
  { hashPassword } = require("../lib/security.ts"),
  {
    referenceDepartments,
    referenceAreas,
  } = require("../lib/reference-catalog.ts");
const origin = process.env.APP_URL || "http://localhost:3000",
  prefix = "Reference-" + randomUUID().slice(0, 8),
  users = [],
  eqs = [],
  families = [],
  records = [],
  cases = [],
  plans = [],
  audits = [],
  pmPlans = [],
  contents = [],
  schedules = [];
let browser;
const check = async (r, status = 200) => {
  assert.equal(r.status(), status, await r.text());
  return r.json();
};
const post = (c, path, data) =>
  c.request.post(origin + path, { headers: { Origin: origin }, data });
(async () => {
  try {
    assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
    const password = "Reference " + randomUUID() + "!",
      hash = await hashPassword(password);
    for (const [role, department] of [
      ["Admin", "Tableting"],
      ["Manager", "Tableting"],
      ["Operator", "Tableting"],
      ["Manager", "Packaging"],
    ])
      users.push(
        await db.user.create({
          data: {
            username: prefix.toLowerCase() + "-" + users.length,
            name: role + " Reference",
            role,
            password: hash,
            mustChange: false,
            workspaceAccess: {
              mode: "restricted",
              locations: [{ plant: prefix, department, area: null }],
              equipmentIds: [],
            },
          },
        }),
      );
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
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
      await check(
        await post(c, "/api/account", {
          action: "login",
          username: u.username,
          password,
          remember: false,
        }),
      );
      contexts.push(c);
    }
    const [admin, manager, operator, other] = contexts;
    await db.location.create({
      data: {
        plant: prefix,
        department: "Tableting",
        area: "Mezzanine",
        active: false,
      },
    });
    await check(
      await post(manager, "/api/platform", {
        action: "seed-catalog",
        plant: prefix,
      }),
      403,
    );
    await check(
      await post(admin, "/api/platform", {
        action: "seed-catalog",
        plant: prefix,
      }),
    );
    const expected = referenceDepartments.reduce(
      (n, d) => n + 1 + referenceAreas[d].length,
      0,
    );
    assert.equal(
      await db.location.count({ where: { plant: prefix } }),
      expected,
    );
    await check(
      await post(admin, "/api/platform", {
        action: "seed-catalog",
        plant: prefix,
      }),
    );
    assert.equal(
      await db.location.count({ where: { plant: prefix } }),
      expected,
    );
    assert.equal(
      (
        await db.location.findFirst({
          where: { plant: prefix, area: "Mezzanine" },
        })
      ).active,
      false,
    );
    assert(
      await db.location.findFirst({
        where: { plant: prefix, department: "Tableting", area: "Coating" },
      }),
    );
    assert.equal(
      await db.location.count({ where: { plant: prefix, area: "AC Coating" } }),
      0,
    );
    for (const [department, area] of [
      ["Tableting", "Compressing"],
      ["Packaging", "Line 1"],
    ])
      eqs.push(
        await db.equipment.create({
          data: {
            name: prefix + " press " + eqs.length,
            plant: prefix,
            department,
            area,
            line: "",
          },
        }),
      );
    const standard = async (kind, workflow, title, extra = {}) => {
      const family = randomUUID();
      families.push(family);
      const input = {
        action: "standard",
        family,
        kind,
        workflow,
        title,
        equipmentId: eqs[0].id,
        target: 45,
        tolerance: 10,
        assigneeIds: kind === "audit" ? [users[1].id] : [],
        steps: [
          {
            id: randomUUID(),
            text: "Verify room condition",
            group: "Quality and compliance",
            timing: "Each shift",
            photo: false,
          },
        ],
        ...extra,
      };
      await check(await post(admin, "/api/platform", input));
      return {
        input,
        ...(await db.standard.findFirst({
          where: { family },
          orderBy: { revision: "desc" },
        })),
      };
    };
    const leader = await standard(
        "audit",
        "leader",
        prefix + " leader shift checklist",
      ),
      processAudit = await standard(
        "audit",
        "process",
        prefix + " process audit",
      ),
      run = await standard("run", "process", prefix + " operator standard");
    await check(
      await operator.request.get(origin + "/api/platform?view=leaders"),
      403,
    );
    let listing = await check(
      await manager.request.get(origin + "/api/platform?view=leaders"),
    );
    assert(listing.standards.some((s) => s.id === leader.id));
    assert(!listing.standards.some((s) => s.id === processAudit.id));
    const legacy = await db.record.create({
      data: {
        kind: "audit",
        standardId: processAudit.id,
        userId: users[1].id,
        data: {
          snapshot: {
            title: processAudit.title,
            equipmentId: eqs[0].id,
            equipment: JSON.parse(JSON.stringify(eqs[0])),
          },
          responses: [],
          cycles: [],
        },
      },
    });
    records.push(legacy.id);
    const legacyList = await check(
      await manager.request.get(origin + "/api/platform?view=audits"),
    );
    assert(legacyList.records.some((r) => r.id === legacy.id));
    await check(
      await post(other, "/api/platform", {
        action: "retire-standard",
        id: run.id,
      }),
      403,
    );
    await check(
      await post(operator, "/api/platform", {
        action: "retire-standard",
        id: run.id,
      }),
      403,
    );
    const begin = new Date().toISOString(),
      response = {
        stepId: run.steps[0].id,
        answer: true,
        photo: null,
        comment: "Fixture complete",
        at: begin,
      };
    await check(
      await post(operator, "/api/platform", {
        action: "run",
        standardId: run.id,
        started: begin,
        responses: [response],
      }),
    );
    const saved = await db.record.findFirst({ where: { standardId: run.id } });
    records.push(saved.id);
    schedules.push(
      await db.workSchedule.create({
        data: {
          family: run.family,
          equipmentId: eqs[0].id,
          title: run.title,
          assigneeIds: [users[2].id],
          managerIds: [users[1].id],
          shiftNames: ["Shift 1"],
          weekdays: [1],
          config: {
            timezone: "America/Chicago",
            shifts: [{ name: "Shift 1", startMinute: 360 }],
          },
          createdBy: users[0].id,
        },
      }),
    );
    await check(
      await post(admin, "/api/platform", {
        action: "retire-standard",
        id: run.id,
      }),
    );
    assert(await db.record.findUnique({ where: { id: saved.id } }));
    assert.equal(
      (await db.workSchedule.findUnique({ where: { id: schedules[0].id } }))
        .active,
      false,
    );
    await check(await post(admin, "/api/platform", run.input), 409);
    await check(
      await post(operator, "/api/platform", {
        action: "run",
        standardId: run.id,
        started: begin,
        responses: [response],
      }),
      409,
    );
    const race = await standard("run", "process", prefix + " race standard");
    const concurrent = await Promise.all([
      post(admin, "/api/platform", race.input),
      post(admin, "/api/platform", { action: "retire-standard", id: race.id }),
    ]);
    assert([200, 409].includes(concurrent[0].status()));
    await check(concurrent[1]);
    assert.equal(
      await db.standard.count({
        where: { family: race.family, archived: false },
      }),
      0,
    );
    await check(
      await post(admin, "/api/platform", {
        action: "guide",
        title: prefix + " obsolete guide",
        equipmentId: eqs[0].id,
        body: "Fixture recovery guide",
        media: [],
      }),
    );
    const guide = await db.content.findFirst({
      where: { title: prefix + " obsolete guide" },
    });
    contents.push(guide.id);
    await check(
      await post(other, "/api/platform", { action: "archive", id: guide.id }),
      403,
    );
    await check(
      await post(manager, "/api/platform", { action: "archive", id: guide.id }),
    );
    assert.equal(
      (await db.content.findUnique({ where: { id: guide.id } })).active,
      false,
    );
    const pm = await db.maintenancePlan.create({
      data: {
        equipmentId: eqs[0].id,
        title: prefix + " PM task",
        kind: "pm",
        steps: [{ id: randomUUID(), text: "Inspect", photo: false }],
        assigneeId: users[1].id,
        intervalDays: 30,
        nextDue: "2099-01-01",
        createdBy: users[0].id,
        history: [],
      },
    });
    pmPlans.push(pm.id);
    const pmRecord = await db.record.create({
      data: {
        kind: "pm",
        userId: users[1].id,
        data: {
          equipmentId: eqs[0].id,
          title: pm.title,
          planId: pm.id,
          responses: [],
        },
      },
    });
    records.push(pmRecord.id);
    await check(
      await post(operator, "/api/maintenance", {
        action: "retire",
        id: pm.id,
        version: 1,
      }),
      403,
    );
    await check(
      await post(manager, "/api/maintenance", {
        action: "retire",
        id: pm.id,
        version: 1,
      }),
    );
    assert.equal(
      (await db.maintenancePlan.findUnique({ where: { id: pm.id } })).active,
      false,
    );
    assert(await db.record.findUnique({ where: { id: pmRecord.id } }));
    const area = await db.location.findFirst({
      where: { plant: prefix, department: "Tableting", area: "Compressing" },
    });
    const plan = await db.fiveSPlan.create({
      data: {
        locationId: area.id,
        title: prefix + " 5S plan",
        questions: [
          {
            id: randomUUID(),
            pillar: "Sort",
            text: "Area clear",
            required: true,
            photo: false,
          },
        ],
        assigneeIds: [],
        createdBy: users[0].id,
        history: [],
      },
    });
    plans.push(plan.id);
    const linked = await standard(
      "audit",
      "leader",
      prefix + " linked leader",
      {
        steps: [
          {
            id: randomUUID(),
            text: "Verify 5S",
            photo: false,
            fiveSPlanId: plan.id,
          },
        ],
      },
    );
    await check(
      await post(manager, "/api/five-s", {
        action: "retire",
        id: plan.id,
        version: 1,
      }),
      409,
    );
    await check(
      await post(admin, "/api/platform", {
        action: "retire-standard",
        id: linked.id,
      }),
    );
    await check(
      await post(manager, "/api/five-s", {
        action: "retire",
        id: plan.id,
        version: 1,
      }),
    );
    const problem = {
      action: "create",
      title: prefix + " two causes",
      method: "4D",
      equipmentId: eqs[0].id,
      occurredOn: "2026-11-11",
      reportedBy: "Fixture reporter",
      ownerId: users[1].id,
      reviewerId: users[0].id,
      team: "Fixture team",
      dueDate: "2099-01-01",
      previousId: null,
      answers: {
        problem: "Fixture issue",
        rootCause: "Verified cause A",
        why1: "Path A",
        secondRootCauseEnabled: "Yes",
        why1b: "Path B",
        rootCause2: "Verified cause B",
      },
      requirements: {
        fields: ["problem", "rootCause", "rootCause2"],
        actionTypes: [],
        requireAction: false,
      },
    };
    const created = await check(await post(admin, "/api/problems", problem));
    cases.push(created.id);
    let detail = await check(
      await admin.request.get(origin + "/api/problems?id=" + created.id),
    );
    assert.equal(detail.answers.why1b, "Path B");
    await check(
      await post(admin, "/api/problems", {
        ...problem,
        action: "update",
        id: created.id,
        version: detail.version,
        status: "Closed",
      }),
    );
    detail = await check(
      await admin.request.get(origin + "/api/problems?id=" + created.id),
    );
    assert(detail.closedAt);
    assert.equal(detail.answers.rootCause2, "Verified cause B");
    const page = await manager.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin);
    await page.getByRole("heading", { name: "Welcome, Manager." }).waitFor();
    assert.equal(
      await page
        .getByRole("combobox", { name: "Search this section", exact: true })
        .count(),
      0,
    );
    const nav = async (name) => {
      await page.locator(".nav-item").filter({ hasText: name }).first().click();
      await page
        .getByRole("heading", {
          level: 1,
          name: name === "Overview" ? "Welcome, Manager." : name,
          exact: true,
        })
        .waitFor();
    };
    await nav("My account");
    assert.equal(
      await page
        .getByRole("combobox", { name: "Search this section", exact: true })
        .count(),
      0,
    );
    await nav("Overview");
    await page
      .getByRole("button", { name: "View Ideas assignments", exact: true })
      .click();
    await page
      .getByRole("heading", {
        name: "Improvement ideas",
        level: 1,
        exact: true,
      })
      .waitFor();
    await nav("Overview");
    await page
      .getByRole("button", { name: "View DL/TL Standard Work", exact: true })
      .first()
      .click();
    await page
      .getByRole("heading", { name: "Complete assigned DL/TL Standard Work" })
      .waitFor();
    await page
      .getByLabel("Standard work", { exact: true })
      .selectOption(leader.id);
    await page.getByRole("button", { name: "✓ Yes", exact: true }).click();
    assert.equal(
      await page
        .getByText("Optional cycle timestamps", { exact: false })
        .count(),
      0,
    );
    const setting = await db.setting.findUnique({ where: { key: "shifts" } });
    await page
      .getByLabel("Leader-work shift", { exact: true })
      .selectOption(setting.value.shifts[0].name);
    await page
      .getByLabel("Leader pass-down notes", { exact: true })
      .fill("Fixture pass-down: next shift review");
    await page
      .getByRole("button", { name: "Add room / machine handoff", exact: true })
      .click();
    await page
      .getByLabel("Item number · row 1", { exact: true })
      .fill("ITEM-FIXTURE");
    await page
      .getByLabel("Lot number · row 1", { exact: true })
      .fill("LOT-FIXTURE");
    await fs.mkdir("docs/screenshots/reference-forms", { recursive: true });
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: "docs/screenshots/reference-forms/leader-work.png",
      fullPage: true,
    });
    await page
      .getByRole("button", {
        name: "Complete DL/TL Standard Work",
        exact: true,
      })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Saved to the database" })
      .waitFor();
    const completed = await db.record.findFirst({
      where: { standardId: leader.id },
    });
    assert(completed);
    records.push(completed.id);
    assert.equal(completed.data.snapshot.workflow, "leader");
    assert.equal(completed.data.handoff.rooms[0].lot, "LOT-FIXTURE");
    listing = await check(
      await manager.request.get(origin + "/api/platform?view=leaders"),
    );
    assert(listing.records.some((r) => r.id === completed.id));
    assert(!listing.records.some((r) => r.id === legacy.id));
    await nav("Problem solving");
    await page
      .getByRole("button", { name: "New 4D record", exact: true })
      .click();
    await page
      .getByLabel("Use a second 5-Why root cause path", { exact: true })
      .check();
    await page
      .getByPlaceholder("Root cause path 2 · Why 1", { exact: true })
      .fill("Independent path B");
    await page
      .getByPlaceholder("Root cause path 2 · Root cause summary", {
        exact: true,
      })
      .fill("Second verified cause");
    await page
      .getByPlaceholder("Root cause path 2 · Why 1", { exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "docs/screenshots/reference-forms/two-root-causes.png",
    });
    assert.deepEqual(errors, []);
    for (const c of contexts) await c.close();
    console.log(
      "PASS: exact/idempotent catalog, role/scope guards, separate leader/process audits, immutable retirement and schedules, concurrent family retirement, guide/PM/5S retirement, dual 4D roots, dashboard shortcuts, hidden irrelevant searches and persisted leader handoff.",
    );
  } finally {
    await browser?.close();
    await db.problemAction.deleteMany({ where: { problemId: { in: cases } } });
    await db.problem.deleteMany({ where: { id: { in: cases } } });
    await db.record.deleteMany({
      where: {
        OR: [
          { id: { in: records } },
          { standard: { family: { in: families } } },
        ],
      },
    });
    await db.workSchedule.deleteMany({
      where: { id: { in: schedules.map((s) => s.id) } },
    });
    await db.setting.deleteMany({
      where: { key: { in: families.map((f) => "standard-retired:" + f) } },
    });
    await db.standard.deleteMany({ where: { family: { in: families } } });
    await db.fiveSAudit.deleteMany({ where: { planId: { in: plans } } });
    await db.fiveSPlan.deleteMany({ where: { id: { in: plans } } });
    await db.maintenancePlan.deleteMany({ where: { id: { in: pmPlans } } });
    await db.content.deleteMany({ where: { id: { in: contents } } });
    await db.equipment.deleteMany({
      where: { id: { in: eqs.map((e) => e.id) } },
    });
    await db.location.deleteMany({ where: { plant: prefix } });
    await db.session.deleteMany({
      where: { userId: { in: users.map((u) => u.id) } },
    });
    await db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
    await db.$disconnect();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
