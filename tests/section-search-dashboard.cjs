require("tsx/cjs");
require("dotenv").config({ quiet: true });
const assert = require("node:assert/strict"),
  { randomUUID } = require("node:crypto"),
  fs = require("node:fs/promises"),
  { chromium } = require("playwright");
const { db } = require("../lib/db.ts"),
  { hashPassword } = require("../lib/security.ts");
const origin = process.env.APP_URL || "http://localhost:3000",
  suffix = randomUUID().slice(0, 8),
  prefix = "Search-" + suffix;
const users = [],
  equipment = [],
  locations = [],
  records = [],
  standards = [],
  plans = [],
  defects = [];
let browser;
const check = async (r, status = 200) => {
  assert.equal(r.status(), status, await r.text());
  return r.json();
};
(async () => {
  try {
    assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
    const password = "Search " + randomUUID() + "!",
      hash = await hashPassword(password);
    for (const department of ["Packing " + suffix, "Private " + suffix]) {
      locations.push(
        await db.location.create({
          data: {
            plant: prefix,
            department,
            area: "Area " + department,
            line: "",
          },
        }),
      );
      equipment.push(
        await db.equipment.create({
          data: {
            plant: prefix,
            department,
            area: "Area " + department,
            line: "Line 1",
            name: prefix + " " + department + " Filler",
          },
        }),
      );
      users.push(
        await db.user.create({
          data: {
            username: prefix.toLowerCase() + "-" + users.length,
            name: users.length
              ? "Hidden Person " + suffix
              : "Morgan Search " + suffix,
            role: "Manager",
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
    }
    standards.push(
      await db.standard.create({
        data: {
          family: randomUUID(),
          revision: 1,
          kind: "run",
          title: prefix + " Changeover check",
          equipmentId: equipment[0].id,
          target: 10,
          tolerance: 10,
          steps: [{ id: randomUUID(), text: "Check guard", photo: false }],
          assigneeIds: [],
        },
      }),
    );
    plans.push(
      await db.fiveSPlan.create({
        data: {
          locationId: locations[0].id,
          title: prefix + " 5S check",
          questions: [
            {
              id: randomUUID(),
              pillar: "Sort",
              text: "Remove unused items",
              required: true,
              photo: false,
            },
          ],
          assigneeIds: [],
          createdBy: users[0].id,
          history: [],
        },
      }),
    );
    const addStudy = async (title) => {
      const r = await db.record.create({
        data: {
          kind: "study",
          userId: users[0].id,
          data: {
            title,
            equipmentId: equipment[0].id,
            cycles: [
              { element: "Pack", seconds: 5, at: new Date().toISOString() },
            ],
          },
        },
      });
      records.push(r);
      return r;
    };
    await addStudy(prefix + " First observation");
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      headless: true,
      args: ["--no-sandbox"],
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      timezoneId: "America/Chicago",
      serviceWorkers: "block",
    });
    await check(
      await context.request.post(origin + "/api/account", {
        headers: { Origin: origin },
        data: {
          action: "login",
          username: users[0].username,
          password,
          remember: false,
        },
      }),
    );
    const options = await check(
      await context.request.get(
        origin +
          "/api/section-options?" +
          new URLSearchParams({ section: "Standard work", q: prefix }),
      ),
    );
    assert(options.options.some((o) => o.value === equipment[0].name));
    assert(options.options.some((o) => o.value === standards[0].title));
    assert(
      !options.options.some((o) =>
        JSON.stringify(o).includes(equipment[1].department),
      ),
    );
    await check(
      await context.request.get(
        origin + "/api/section-options?section=Permissions&q=",
      ),
      403,
    );
    const people = await check(
      await context.request.get(
        origin + "/api/people?search=" + encodeURIComponent(users[1].name),
      ),
    );
    assert.equal(people.people.length, 0);
    const filtered = await check(
      await context.request.get(
        origin +
          "/api/platform?view=work&search=" +
          encodeURIComponent(equipment[0].name),
      ),
    );
    assert(filtered.standards.some((s) => s.id === standards[0].id));
    const fiveS = await check(
      await context.request.get(
        origin + "/api/five-s?search=" + encodeURIComponent(locations[0].area),
      ),
    );
    assert(fiveS.plans.some((p) => p.id === plans[0].id));
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin);
    await page.getByRole("heading", { name: "Welcome, Morgan." }).waitFor();
    const nav = async (name) => {
      await page.locator(".nav-item").filter({ hasText: name }).first().click();
      await page
        .getByRole("heading", { level: 1, name, exact: true })
        .waitFor();
    };
    await nav("Time studies");
    await page
      .getByRole("heading", { name: "New time study", exact: true })
      .waitFor();
    await page
      .getByLabel("Study name", { exact: true })
      .fill("Keep this unsaved draft");
    await addStudy(prefix + " New observation after refresh");
    await page
      .locator(".history")
      .getByRole("button", { name: "↻ Refresh history", exact: true })
      .click();
    await page
      .getByText(prefix + " New observation after refresh", { exact: true })
      .waitFor();
    assert.equal(
      await page.getByLabel("Study name", { exact: true }).inputValue(),
      "Keep this unsaved draft",
    );
    const search = page.getByRole("combobox", {
      name: "Search time studies",
      exact: true,
    });
    await search.fill(prefix);
    await page
      .locator('[role="listbox"] [role="option"]')
      .filter({ hasText: equipment[0].name })
      .first()
      .waitFor();
    await fs.mkdir("docs/screenshots/search-dashboards", { recursive: true });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: "docs/screenshots/search-dashboards/search-suggestions.png",
      fullPage: true,
    });
    await search.press("ArrowDown");
    await search.press("Escape");
    assert.equal(await search.getAttribute("aria-expanded"), "false");
    await search.fill(equipment[0].name);
    await page
      .locator('[role="listbox"] [role="option"]')
      .filter({ hasText: equipment[0].name })
      .first()
      .click();
    assert.equal(await search.inputValue(), equipment[0].name);
    const person = page.getByRole("combobox", {
      name: "Study recorder",
      exact: true,
    });
    await person.fill("Morgan Search");
    await page
      .getByRole("listbox", { name: "Study recorder suggestions" })
      .locator('[role="listbox"] [role="option"]')
      .filter({ hasText: users[0].name })
      .click();
    assert((await person.inputValue()).includes(users[0].username));
    await page
      .getByRole("button", { name: "Apply filters", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "New time study", exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Dashboard", exact: true }).click();
    await page
      .getByRole("heading", { name: "Time studies at a glance", exact: true })
      .waitFor();
    const board = page.getByRole("region", { name: "Time studies dashboard" });
    assert(
      await board
        .getByText(prefix + " New observation after refresh", { exact: true })
        .isVisible(),
    );
    await page.screenshot({
      path: "docs/screenshots/search-dashboards/time-studies-dashboard.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Open in detail", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Saved studies", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Clear filters", exact: true })
      .click();
    for (const name of [
      "Preventive maintenance",
      "TPM / CIL",
      "5S audits",
      "Defect reporting",
      "Production results",
      "DL/TL Standard Work",
      "Standard work",
      "Training",
      "Troubleshooting",
      "Analytics",
      "Downtime",
      "Improvement ideas",
      "Problem solving",
    ]) {
      await nav(name);
      await page
        .getByRole("button", { name: "Dashboard", exact: true })
        .click();
      await page
        .getByRole("heading", { name: name + " at a glance", exact: true })
        .waitFor();
    }
    await nav("Defect reporting");
    await page
      .getByLabel("Defect title", { exact: true })
      .fill("Keep unsubmitted defect draft");
    defects.push(
      await db.defect.create({
        data: {
          equipmentId: equipment[0].id,
          title: prefix + " Incoming defect",
          description: "New record from another session",
          priority: "Medium",
          reportedBy: users[0].id,
          equipmentSnapshot: JSON.parse(JSON.stringify(equipment[0])),
          media: [],
          history: [],
        },
      }),
    );
    await page
      .getByRole("button", { name: "↻ Refresh section", exact: true })
      .click();
    await page
      .getByRole("heading", { name: new RegExp(prefix + " Incoming defect") })
      .waitFor();
    assert.equal(
      await page.getByLabel("Defect title", { exact: true }).inputValue(),
      "Keep unsubmitted defect draft",
    );
    await nav("5S audits");
    await page.getByRole("button", { name: "Dashboard", exact: true }).click();
    await page
      .getByRole("heading", { name: "5S audits at a glance" })
      .waitFor();
    await page.setViewportSize({ width: 820, height: 1180 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: "docs/screenshots/search-dashboards/tablet-five-s-dashboard.png",
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      "PASS: scoped machine/area/task/person suggestions, keyboard selection, 14 dashboards/detail menus, machine and area filters, history refresh preserves drafts and sees new work, tablet layout.",
    );
  } finally {
    await browser?.close();
    await db.record.deleteMany({
      where: { id: { in: records.map((r) => r.id) } },
    });
    await db.fiveSPlan.deleteMany({
      where: { id: { in: plans.map((p) => p.id) } },
    });
    await db.standard.deleteMany({
      where: { id: { in: standards.map((s) => s.id) } },
    });
    await db.defect.deleteMany({
      where: { id: { in: defects.map((d) => d.id) } },
    });
    await db.equipment.deleteMany({
      where: { id: { in: equipment.map((e) => e.id) } },
    });
    await db.location.deleteMany({
      where: { id: { in: locations.map((l) => l.id) } },
    });
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
