require("tsx/cjs");
require("dotenv").config({ quiet: true });
const { db } = require("../lib/db.ts"),
  { hashPassword } = require("../lib/security.ts"),
  {
    handoffRooms,
    tabletingLeaderTemplates,
  } = require("../lib/tableting-leader.ts"),
  { chromium } = require("playwright"),
  { randomUUID } = require("node:crypto"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises");
const origin = process.env.APP_URL,
  suffix = randomUUID().slice(0, 8),
  plant = "Template fixture " + suffix;
let browser;
async function main() {
  assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
  const password = "Template fixture " + randomUUID() + "!",
    hash = await hashPassword(password);
  const users = [];
  for (const role of ["Admin", "DL/TL", "Operator", "Manager"]) {
    users.push(
      await db.user.create({
        data: {
          username: "template-" + suffix + "-" + users.length,
          name: role + " Fixture",
          password: hash,
          mustChange: false,
          role,
          workspaceAccess: {
            mode: "restricted",
            locations: [{ plant, department: "Tableting", area: null }],
            equipmentIds: [],
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
      password,
      remember: false,
    });
    cs.push(c);
  }
  const [admin, leader, operator, manager] = cs;
  await req(
    operator,
    "/api/platform",
    { action: "install-tableting", plant },
    403,
  );
  await req(
    manager,
    "/api/platform",
    { action: "install-tableting", plant },
    403,
  );
  const [a, b] = await Promise.all([
    req(admin, "/api/platform", { action: "install-tableting", plant }),
    req(admin, "/api/platform", {
      action: "install-tableting",
      plant: plant.toUpperCase(),
    }),
  ]);
  assert.equal(a.installed.length + b.installed.length, 4);
  assert.equal(a.retained.length + b.retained.length, 4);
  const retiredSite = plant + " inactive";
  await db.location.create({
    data: {
      plant: retiredSite,
      department: "Tableting",
      area: "Coating",
      line: "",
      active: false,
    },
  });
  await req(
    admin,
    "/api/platform",
    { action: "install-tableting", plant: retiredSite },
    409,
  );
  assert.equal(await db.location.count({ where: { plant: retiredSite } }), 1);
  assert.equal(await db.equipment.count({ where: { plant: retiredSite } }), 0);
  const eq = await db.equipment.findMany({
    where: { plant: { equals: plant, mode: "insensitive" } },
  });
  assert.equal(eq.length, 4);
  const site = eq[0].plant;
  const locations = await db.location.findMany({ where: { plant: site } });
  assert.equal(new Set(locations.map((l) => l.department)).size, 17);
  assert.equal(locations.length, 170);
  let standards = await db.standard.findMany({
    where: { equipmentId: { in: eq.map((e) => e.id) } },
  });
  assert.equal(standards.length, 4);
  for (const t of tabletingLeaderTemplates) {
    const s = standards.find((s) => s.handoffProfile === t.key);
    assert(s);
    assert.equal(s.workflow, "leader");
    assert.deepEqual(s.steps, t.steps);
    assert.equal(s.assigneeIds.length, 0);
  }
  const visible = await req(leader, "/api/platform?view=leaders");
  assert.equal(
    visible.standards.filter((s) => s.workflow === "leader").length,
    4,
  );
  const op = await req(operator, "/api/platform?view=work");
  assert(op.standards.every((s) => s.workflow !== "leader"));
  const errors = [],
    page = await leader.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto(origin);
  const more = page
    .locator("nav")
    .getByRole("button", { name: "More tools and history", exact: true });
  if (await more.isVisible()) await more.click();
  await page
    .locator("nav")
    .getByRole("button", { name: /DL\/TL Standard Work/ })
    .first()
    .click();
  for (const key of ["compressing", "blending", "weigh-room", "coating"]) {
    const s = standards.find((s) => s.handoffProfile === key);
    await page.getByLabel("Standard work", { exact: true }).selectOption(s.id);
    await page
      .getByRole("heading", { name: s.steps[0].text, exact: true })
      .waitFor();
    assert.equal(
      await page.locator("fieldset").count(),
      handoffRooms(key).length,
    );
    if (key === "coating") {
      await page.getByLabel("Current round · row 3", { exact: true }).fill("3");
      await page.getByLabel("Total rounds · row 3", { exact: true }).fill("6");
      await page
        .getByLabel("Solution mixed for current work order · row 3", {
          exact: true,
        })
        .selectOption("Yes");
      await page.setViewportSize({ width: 820, height: 1180 });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await fs.mkdir("docs/screenshots/tableting-leader", { recursive: true });
      await page.screenshot({
        path: "docs/screenshots/tableting-leader/coating-tablet.png",
        fullPage: true,
      });
    }
  }
  const coating = standards.find((s) => s.handoffProfile === "coating");
  await page
    .getByLabel("Leader-work shift", { exact: true })
    .selectOption({ index: 1 });
  await page
    .getByLabel("Leader pass-down notes", { exact: true })
    .fill("Synthetic handoff");
  await page
    .getByLabel("Last four rounds recalculated · row 3", { exact: true })
    .selectOption("No");
  for (const button of await page
    .getByRole("button", { name: "✓ Yes", exact: true })
    .all())
    await button.click();
  await page
    .getByRole("button", { name: "Complete DL/TL Standard Work", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Saved to the database." })
    .waitFor();
  const record = await db.record.findFirstOrThrow({
    where: { standardId: coating.id },
  });
  assert.equal(record.data.handoff.rooms[2].round, "3");
  assert.equal(record.data.handoff.rooms[2].lastFourRecalculated, "No");
  assert.equal(record.data.snapshot.handoffProfile, "coating");
  const revised = {
    ...coating,
    action: "standard",
    steps: coating.steps.map((s, i) =>
      i ? s : { ...s, text: s.text + " — reviewed" },
    ),
  };
  delete revised.handoffProfile;
  await req(admin, "/api/platform", revised);
  const latest = await db.standard.findFirstOrThrow({
    where: { family: coating.family },
    orderBy: { revision: "desc" },
  });
  assert.equal(latest.handoffProfile, "coating");
  assert.equal(latest.revision, 2);
  await req(admin, "/api/platform", { action: "install-tableting", plant });
  assert.equal(
    await db.standard.count({ where: { family: coating.family } }),
    2,
  );
  await req(admin, "/api/platform", {
    action: "retire-standard",
    id: latest.id,
  });
  await req(admin, "/api/platform", { action: "install-tableting", plant });
  assert(
    (await db.standard.findUniqueOrThrow({ where: { id: latest.id } }))
      .archived,
  );
  assert.deepEqual(
    (await db.record.findUniqueOrThrow({ where: { id: record.id } })).data,
    record.data,
  );
  const other = await req(
    manager,
    "/api/platform?view=leaders&equipment=" + randomUUID(),
  );
  assert.equal(other.standards.length, 0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: four document templates, complete catalog, scoped Admin install, concurrent retry/case deduplication, source tasks and area handoffs, tablet fields, persisted handoff snapshot, compatible revisions, retirement/history preservation.",
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
