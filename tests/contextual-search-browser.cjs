require("tsx/cjs");
require("dotenv").config({ quiet: true });
const { db } = require("../lib/db.ts"),
  { hashPassword } = require("../lib/security.ts"),
  { sectionSearch } = require("../lib/section-search.ts"),
  { chromium } = require("playwright"),
  { randomUUID } = require("node:crypto"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises");
const origin = process.env.APP_URL || "http://localhost:3000",
  prefix = "Context-" + randomUUID().slice(0, 8),
  users = [],
  equipment = [],
  records = [],
  contents = [],
  maintenance = [],
  locations = [];
let browser,
  centerline,
  defect,
  fiveS,
  audit,
  source,
  feed,
  external,
  problem,
  idea;
async function get(c, path) {
  const r = await c.request.get(origin + path);
  assert.equal(r.status(), 200, await r.text());
  return r.json();
}
async function main() {
  assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
  const password = "Context fixture " + randomUUID() + "!",
    hash = await hashPassword(password);
  for (let n = 0; n < 2; n++) {
    locations.push(
      await db.location.create({
        data: {
          plant: prefix,
          department: n ? "Packaging" : "Tableting",
          area: n ? "Line 9" : "Compressing",
          line: "",
        },
      }),
    );
    equipment.push(
      await db.equipment.create({
        data: {
          ...Object.fromEntries(
            Object.entries(locations[n]).filter(([k]) =>
              ["plant", "department", "area", "line"].includes(k),
            ),
          ),
          name: prefix + (n ? " foreign" : " press"),
        },
      }),
    );
  }
  for (const [role, n] of [
    ["Manager", 0],
    ["Operator", 0],
    ["Manager", 1],
  ])
    users.push(
      await db.user.create({
        data: {
          username: prefix.toLowerCase() + "-" + users.length,
          name: users.length === 1 ? "Operator Context" : "Manager Context",
          role,
          password: hash,
          mustChange: false,
          workspaceAccess: {
            mode: "restricted",
            locations: [
              {
                plant: prefix,
                department: locations[n].department,
                area: null,
              },
            ],
            equipmentIds: [],
          },
        },
      }),
    );
  for (let n = 0; n < 2; n++)
    records.push(
      await db.record.create({
        data: {
          kind: "study",
          userId: users[n ? 2 : 0].id,
          data: {
            title: prefix + (n ? " secret study" : " measured study"),
            equipmentId: equipment[n].id,
            equipmentSnapshot: equipment[n],
            cycles: [
              { element: "Fill", seconds: 10, at: new Date().toISOString() },
            ],
          },
        },
      }),
    );
  for (const [kind, title, body] of [
    [
      "video",
      prefix + " training",
      "https://www.youtube-nocookie.com/embed/abc",
    ],
    [
      "guide",
      prefix + " roller guide",
      "Inspect rollerwear and restore alignment",
    ],
  ])
    contents.push(
      await db.content.create({
        data: {
          kind,
          title,
          body,
          equipmentId: equipment[0].id,
          createdBy: users[0].id,
        },
      }),
    );
  for (const kind of ["pm", "cil"])
    maintenance.push(
      await db.maintenancePlan.create({
        data: {
          kind,
          title: prefix + " " + kind.toUpperCase(),
          equipmentId: equipment[0].id,
          assigneeId: users[1].id,
          intervalDays: 1,
          nextDue: "2026-11-13",
          steps: [{ id: randomUUID(), text: "Inspect", photo: false }],
          createdBy: users[0].id,
          history: [],
        },
      }),
    );
  centerline = await db.centerline.create({
    data: {
      title: prefix + " centerline",
      equipmentId: equipment[0].id,
      setup: "SKU-220-" + prefix,
      parameters: [
        {
          id: randomUUID(),
          name: "Speed",
          kind: "numeric",
          lower: 90,
          target: 100,
          upper: 110,
          unit: "rpm",
          expected: "",
          photo: false,
          instructions: "",
        },
      ],
      createdBy: users[0].id,
    },
  });
  records.push(
    await db.record.create({
      data: {
        kind: "centerline",
        userId: users[0].id,
        data: {
          title: centerline.title,
          equipmentId: equipment[0].id,
          centerlineSnapshot: {
            ...JSON.parse(JSON.stringify(centerline)),
            setup: "Retired-SKU-105-" + prefix,
          },
          responses: [],
          followUp: false,
        },
      },
    }),
  );
  defect = await db.defect.create({
    data: {
      title: prefix + " defect",
      description: "Belt fraying at transfer",
      equipmentId: equipment[0].id,
      equipmentSnapshot: equipment[0],
      reportedBy: users[1].id,
      priority: "Medium",
      maintainxId: "987123" + prefix.slice(-4),
      media: [],
      history: [],
    },
  });
  fiveS = await db.fiveSPlan.create({
    data: {
      title: prefix + " new 5S plan",
      locationId: locations[0].id,
      assigneeIds: [users[1].id],
      questions: [],
      createdBy: users[0].id,
      history: [],
    },
  });
  audit = await db.fiveSAudit.create({
    data: {
      planId: fiveS.id,
      locationId: locations[0].id,
      userId: users[0].id,
      snapshot: { title: prefix + " historical 5S", area: locations[0] },
      responses: [],
      media: [],
      score: 5,
      maximum: 5,
    },
  });
  source = await db.integrationSource.create({
    data: {
      name: prefix + " source",
      createdBy: users[0].id,
      tokenHash: "0".repeat(64),
    },
  });
  feed = await db.externalFeed.create({
    data: {
      sourceId: source.id,
      name: prefix + " production",
      section: "Production results",
    },
  });
  external = await db.externalRow.create({
    data: {
      feedId: feed.id,
      externalId: prefix + "-BATCH-105",
      equipmentId: equipment[0].id,
      personId: users[1].id,
      title: prefix + " output",
      details: "Shift output",
      occurredAt: new Date(),
      values: { produced: 10 },
    },
  });
  problem = await db.problem.create({
    data: {
      reference: prefix + "-4D-105",
      method: "4D",
      title: prefix + " recurring issue",
      equipmentId: equipment[0].id,
      equipmentSnapshot: equipment[0],
      occurredOn: "2026-11-13",
      reportedBy: users[0].name,
      ownerId: users[0].id,
      reviewerId: users[0].id,
      team: "",
      dueDate: "2026-12-01",
      answers: {},
      createdBy: users[0].id,
    },
  });
  idea = await db.idea.create({
    data: {
      title: prefix + " idea",
      equipmentId: equipment[0].id,
      equipmentSnapshot: equipment[0],
      currentState: "Current station",
      proposal: "Add guardrailrevision marker",
      dueDate: "2026-12-01",
      createdBy: users[0].id,
      submitterId: users[0].id,
      pilotId: users[0].id,
      validatorId: users[0].id,
    },
  });
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const c = await browser.newContext({
    serviceWorkers: "block",
    viewport: { width: 1440, height: 1000 },
  });
  let r = await c.request.post(origin + "/api/account", {
    headers: { Origin: origin },
    data: {
      action: "login",
      username: users[0].username,
      password,
      remember: false,
    },
  });
  assert.equal(r.status(), 200);
  const options = (section, q = "") =>
    get(c, "/api/section-options?" + new URLSearchParams({ section, q }));
  assert(
    JSON.stringify(await options("Time studies", prefix)).includes(
      records[0].data.title,
    ),
  );
  assert(
    !JSON.stringify(await options("Time studies", prefix)).includes(
      "secret study",
    ),
  );
  assert(
    !JSON.stringify(await options("Training", prefix)).includes(
      records[0].data.title,
    ),
  );
  assert(
    !JSON.stringify(await options("5S audits", prefix)).includes(
      equipment[0].name,
    ),
  );
  assert(
    JSON.stringify(await options("Preventive maintenance", prefix)).includes(
      maintenance[0].title,
    ),
  );
  assert(
    !JSON.stringify(await options("Preventive maintenance", prefix)).includes(
      maintenance[1].title,
    ),
  );
  assert(
    JSON.stringify(await options("TPM / CIL", prefix)).includes(
      maintenance[1].title,
    ),
  );
  assert(
    (await options("Problem solving", problem.reference)).options.some(
      (x) => x.value === problem.reference,
    ),
  );
  assert(
    (await options("Production results", external.externalId)).options.some(
      (x) => x.value === external.externalId,
    ),
  );
  assert.equal(
    (
      await get(
        c,
        "/api/external-data?section=Production%20results&search=" +
          external.externalId,
      )
    ).items[0].id,
    external.id,
  );
  assert.equal(
    (await get(c, "/api/defects?search=" + defect.maintainxId)).defects[0].id,
    defect.id,
  );
  assert(
    (
      await get(
        c,
        "/api/centerlines?search=" +
          encodeURIComponent("Retired-SKU-105-" + prefix),
      )
    ).records.some((x) => x.id === records[2].id),
  );
  assert(
    (
      await get(
        c,
        "/api/five-s?person=" +
          users[0].id +
          "&search=" +
          encodeURIComponent(prefix + " historical 5S"),
      )
    ).records.some((x) => x.id === audit.id),
  );
  const page = await c.newPage(),
    errors = [],
    failures = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.url().includes("/api/") && r.status() >= 500)
      failures.push(r.status() + " " + new URL(r.url()).pathname);
  });
  await page.goto(origin);
  async function nav(name) {
    await page
      .locator(".sidebar nav > div")
      .getByRole("button", {
        name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$"),
      })
      .first()
      .click();
    await page.getByRole("heading", { name, level: 1, exact: true }).waitFor();
  }
  for (const name of Object.keys(sectionSearch)) {
    await nav(name);
    await page
      .getByRole("combobox", { name: sectionSearch[name].label, exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole("combobox", { name: "Search this section", exact: true })
        .count(),
      0,
    );
    assert.equal(
      await page
        .getByRole("combobox", {
          name: sectionSearch[name].personLabel,
          exact: true,
        })
        .count(),
      1,
    );
  }
  await nav("Time studies");
  const field = page.getByRole("combobox", {
    name: "Search time studies",
    exact: true,
  });
  await field.fill(prefix + " measured study");
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await page
    .getByText(records[0].data.title, { exact: true })
    .first()
    .waitFor();
  await nav("Centerlines");
  assert.equal(
    await page
      .getByRole("combobox", { name: "Search centerlines", exact: true })
      .inputValue(),
    "",
  );
  await page
    .getByRole("heading", { name: "Machine centerlines", exact: true })
    .waitFor();
  assert(
    await page
      .getByRole("row")
      .filter({ hasText: centerline.title })
      .first()
      .isVisible(),
  );
  await nav("Troubleshooting");
  const guideSearch = page.getByRole("combobox", {
    name: "Search troubleshooting",
    exact: true,
  });
  await guideSearch.fill("rollerwear");
  await page
    .getByRole("option")
    .filter({ hasText: contents[1].title })
    .waitFor();
  await page.getByRole("option").filter({ hasText: contents[1].title }).click();
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await page
    .getByRole("heading", { name: contents[1].title, exact: true })
    .waitFor();
  assert.equal(
    await page.getByLabel("Search library", { exact: true }).count(),
    0,
  );
  await nav("Problem solving");
  assert.equal(
    await page.getByLabel("Find a record", { exact: true }).count(),
    0,
  );
  await page.getByLabel("Method filter",{exact:true}).selectOption("4D");
  const search = page.getByRole("combobox", {
    name: "Search problem solving",
    exact: true,
  });
  await search.fill(problem.reference);
  await page.getByRole("option").filter({ hasText: problem.reference }).click();
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await page.getByRole("row").filter({ hasText: problem.reference }).waitFor();
  assert.equal(await page.getByLabel("Method filter",{exact:true}).inputValue(),"4D");
  await nav("Improvement ideas");
  await page
    .getByRole("combobox", { name: "Search improvement ideas", exact: true })
    .fill("guardrailrevision");
  await page.getByRole("option").filter({ hasText: idea.title }).waitFor();
  await nav("Centerlines");
  const person = page.getByRole("combobox", {
    name: "Centerline auditor",
    exact: true,
  });
  await person.fill("Manager Context");
  assert(
    await page
      .getByRole("button", { name: "Apply filters", exact: true })
      .isDisabled(),
  );
  await page
    .getByRole("listbox", {
      name: "Centerline auditor suggestions",
      exact: true,
    })
    .getByRole("option")
    .filter({ hasText: users[0].username })
    .click();
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Machine centerlines", exact: true })
    .waitFor();
  await page
    .getByRole("combobox", { name: "Centerline auditor", exact: true })
    .waitFor();
  await page.waitForFunction(
    (username) =>
      [...document.querySelectorAll('input[role="combobox"]')].some((input) =>
        input.value.includes(username),
      ),
    users[0].username,
  );
  await fs.mkdir("docs/screenshots/contextual-search", { recursive: true });
  await page.screenshot({
    path: "docs/screenshots/contextual-search/centerline-search.png",
  });
  await page.setViewportSize({ width: 820, height: 1180 });
  await nav("Downtime");
  await page
    .getByRole("combobox", { name: "Search downtime", exact: true })
    .fill(equipment[0].name);
  await page
    .getByRole("option")
    .filter({ hasText: equipment[0].name })
    .first()
    .waitFor();
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: "docs/screenshots/contextual-search/tablet-downtime-search.png",
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, []);
  console.log(
    "PASS: all contextual search labels and roles, native-only scoped suggestions, PM/CIL separation, problem references, production/work-order IDs, historical 5S/setup search, body-text suggestions, single controls, person selection, cross-tab isolation and tablet layout without page/API errors.",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await browser?.close();
    const ids = users.map((x) => x.id);
    await db.notification.deleteMany({ where: { userId: { in: ids } } });
    if (idea) await db.idea.delete({ where: { id: idea.id } });
    if (problem) await db.problem.delete({ where: { id: problem.id } });
    if (external) await db.externalRow.delete({ where: { id: external.id } });
    if (feed) await db.externalFeed.delete({ where: { id: feed.id } });
    if (source) await db.integrationSource.delete({ where: { id: source.id } });
    if (audit) await db.fiveSAudit.delete({ where: { id: audit.id } });
    if (fiveS) await db.fiveSPlan.delete({ where: { id: fiveS.id } });
    if (defect) await db.defect.delete({ where: { id: defect.id } });
    await db.record.deleteMany({ where: { userId: { in: ids } } });
    if (centerline)
      await db.centerline.delete({ where: { id: centerline.id } });
    await db.content.deleteMany({
      where: { id: { in: contents.map((x) => x.id) } },
    });
    await db.maintenancePlan.deleteMany({
      where: { id: { in: maintenance.map((x) => x.id) } },
    });
    await db.session.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.equipment.deleteMany({
      where: { id: { in: equipment.map((x) => x.id) } },
    });
    await db.location.deleteMany({
      where: { id: { in: locations.map((x) => x.id) } },
    });
    await db.$disconnect();
  });
