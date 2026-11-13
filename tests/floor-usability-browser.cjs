require("tsx/cjs");
require("dotenv").config({ quiet: true });
const { db } = require("../lib/db.ts"),
  { hashPassword } = require("../lib/security.ts"),
  { chromium } = require("playwright"),
  { randomUUID } = require("node:crypto"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises");
const origin = process.env.APP_URL,
  suffix = randomUUID().slice(0, 8),
  users = [],
  equipment = [],
  defects = [];
let browser;
async function main() {
  assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
  const password = "Floor fixture " + randomUUID() + "!",
    hash = await hashPassword(password);
  for (const department of ["Alpha", "Beta"])
    equipment.push(
      await db.equipment.create({
        data: {
          name: "Floor press " + suffix + department,
          plant: "Floor " + suffix,
          department,
          area: "Packing",
          line: "",
        },
      }),
    );
  for (const role of ["Admin", "Manager", "DL/TL", "Operator"])
    users.push(
      await db.user.create({
        data: {
          username: "floor-" + suffix + "-" + users.length,
          name: "Floor " + role,
          role,
          password: hash,
          mustChange: false,
          workspaceAccess: {
            mode: "restricted",
            locations: [],
            equipmentIds: [equipment[0].id],
          },
        },
      }),
    );
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
  async function login(i) {
    const c = await browser.newContext({
      serviceWorkers: "block",
      viewport: { width: 820, height: 1180 },
      hasTouch: true,
    });
    await req(c, "/api/account", {
      action: "login",
      username: users[i].username,
      password,
      remember: false,
    });
    return c;
  }
  const admin = await login(0),
    operator = await login(3);
  const report = {
    action: "report",
    requestKey: randomUUID(),
    equipmentId: equipment[0].id,
    title: "Guard noise " + suffix,
    description: "Synthetic machine noise",
    priority: "Medium",
    media: [],
  };
  const [a, b] = await Promise.all([
    req(operator, "/api/defects", report),
    req(operator, "/api/defects", report),
  ]);
  assert.equal(a.id, b.id);
  defects.push(a.id);
  assert.equal(
    await db.defect.count({ where: { equipmentId: equipment[0].id } }),
    1,
  );
  await req(
    operator,
    "/api/defects",
    { ...report, title: "Changed after saving" },
    409,
  );
  const related = await req(
    operator,
    "/api/related-open?equipment=" + equipment[0].id,
  );
  assert(related.defects.some((d) => d.id === a.id));
  await req(
    operator,
    "/api/related-open?equipment=" + equipment[1].id,
    null,
    403,
  );
  await db.defect.create({
    data: {
      equipmentId: equipment[0].id,
      equipmentSnapshot: equipment[0],
      title: "Closed fixture " + suffix,
      description: "Closed",
      priority: "Low",
      status: "Resolved",
      reportedBy: users[3].id,
      media: [],
      history: [],
    },
  });
  const focused = await req(operator, "/api/defects?focus=personal-open");
  assert(focused.defects.every((d) => d.status === "Open"));
  assert(focused.defects.some((d) => d.id === a.id));
  const forbidden = await req(
    operator,
    "/api/defects?equipment=" + equipment[1].id,
  );
  assert.equal(forbidden.defects.length, 0);
  const selected = await req(operator, "/api/defects?item=" + a.id);
  assert.deepEqual(
    selected.defects.map((d) => d.id),
    [a.id],
  );
  const errors = [],
    page = await operator.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin);
  await page.getByRole("heading", { name: "My shift", exact: true }).waitFor();
  await page
    .locator("nav")
    .getByRole("button", { name: "Defect reporting", exact: false })
    .click();
  await page
    .getByRole("heading", { name: "Report a machine defect" })
    .waitFor();
  await page
    .getByLabel("Defect machine", { exact: true })
    .selectOption(equipment[0].id);
  await page.getByRole("region", { name: "Existing machine issues" }).count();
  await page
    .getByRole("button", { name: "Defect: " + report.title, exact: true })
    .waitFor();
  await page.getByLabel("Defect title", { exact: true }).fill("Unsaved test");
  let prompts = 0;
  page.once("dialog", async (d) => {
    prompts++;
    await d.dismiss();
  });
  await page
    .locator("nav")
    .getByRole("button", { name: "Troubleshooting", exact: false })
    .click();
  assert.equal(prompts, 1);
  assert.equal(
    await page.getByLabel("Defect title", { exact: true }).inputValue(),
    "Unsaved test",
  );
  page.once("dialog", (d) => d.accept());
  await page
    .locator("nav")
    .getByRole("button", { name: "Overview", exact: false })
    .click();
  await page.getByRole("heading", { name: "My shift", exact: true }).waitFor();
  await page
    .getByRole("button", { name: "View Open defects assignments", exact: true })
    .click();
  await page.getByLabel("Active dashboard filter").waitFor();
  assert(
    await page
      .getByLabel("Active dashboard filter")
      .innerText()
      .then((s) => s.includes("your open assignments")),
  );
  await page.getByRole("button", { name: "Clear dashboard filter" }).click();
  await page
    .getByLabel("Machine context", { exact: true })
    .selectOption(equipment[0].id);
  await page.getByText("Scan or enter machine label", { exact: true }).click();
  await page.getByLabel("Machine label or ID").fill(equipment[1].id);
  await page.getByRole("button", { name: "Find machine", exact: true }).click();
  await page
    .getByText("Machine not found in your assigned locations.", { exact: true })
    .waitFor();
  await fs.mkdir("docs/screenshots/floor-usability", { recursive: true });
  await page.screenshot({
    path: "docs/screenshots/floor-usability/tablet-context-and-defects.png",
    fullPage: true,
  });
  for (const [i, title] of [
    [0, "Administration"],
    [1, "Department review"],
    [2, "My shift board"],
  ]) {
    const c = await login(i),
      p = await c.newPage();
    await p.goto(origin);
    await p.getByRole("heading", { name: title, exact: true }).waitFor();
    await p.screenshot({
      path: "docs/screenshots/floor-usability/role-" + i + ".png",
      fullPage: true,
    });
    await c.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: role homes, guarded unsaved work, exact open/selected filters, machine context, scoped duplicate suggestions, concurrent report retry protection and tablet layout.",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    const ids = users.map((u) => u.id);
    await db.submissionReceipt.deleteMany({ where: { userId: { in: ids } } });
    await db.defect.deleteMany({
      where: { equipmentId: { in: equipment.map((e) => e.id) } },
    });
    await db.session.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.equipment.deleteMany({
      where: { id: { in: equipment.map((e) => e.id) } },
    });
    await db.$disconnect();
  });
