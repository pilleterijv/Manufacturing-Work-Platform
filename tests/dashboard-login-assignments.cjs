require("tsx/cjs");
require("dotenv").config({ quiet: true });
const assert = require("node:assert/strict"),
  { randomUUID } = require("node:crypto"),
  { chromium } = require("playwright"),
  { db } = require("../lib/db.ts"),
  { hashPassword } = require("../lib/security.ts"),
  fs = require("node:fs");
let browser;
async function main() {
  assert(/^floorwork_roles_[a-f0-9]{32}$/.test(new URL(process.env.DATABASE_URL).pathname.slice(1)));
  const origin = process.env.APP_URL,
    tag = randomUUID().slice(0, 8),
    password = "Dashboard fixture " + randomUUID() + "!",
    hash = await hashPassword(password);
  const e = await db.equipment.create({
    data: {
      name: "Dashboard press " + tag,
      plant: "Assignment pilot " + tag,
      department: "Tableting",
      area: "Compressing",
      line: "",
    },
  });
  const users = [];
  for (const role of ["Admin", "Operator"])
    users.push(
      await db.user.create({
        data: {
          username: "home-" + tag + users.length,
          name: "Home fixture " + users.length,
          role,
          password: hash,
          mustChange: false,
          workspaceAccess: { mode: "restricted", locations: [], equipmentIds: [e.id] },
        },
      })
    );
  const standard = await db.standard.create({
    data: {
      family: randomUUID(),
      revision: 1,
      title: "Assigned startup " + tag,
      equipmentId: e.id,
      target: 10,
      tolerance: 1,
      kind: "run",
      workflow: "process",
      assigneeIds: [users[0].id],
      steps: [{ id: "check", text: "Inspect guard", photo: false }],
    },
  });
  const otherStandard = await db.standard.create({
    data: {
      family: randomUUID(),
      revision: 1,
      title: "Other employee checklist " + tag,
      equipmentId: e.id,
      target: 10,
      tolerance: 1,
      assigneeIds: [users[1].id],
      steps: [{ id: "check", text: "Inspect", photo: false }],
    },
  });
  const pm = await db.maintenancePlan.create({
    data: {
      title: "Future assigned PM " + tag,
      equipmentId: e.id,
      assigneeId: users[0].id,
      steps: [{ id: "check", text: "Inspect", photo: false }],
      intervalDays: 7,
      nextDue: "2050-12-31",
      createdBy: users[0].id,
      history: [],
    },
  });
  const problem = await db.problem.create({
    data: {
      reference: "2D-HOME-" + tag,
      method: "2D",
      title: "Future investigation " + tag,
      equipmentId: e.id,
      equipmentSnapshot: e,
      occurredOn: "2026-11-19",
      reportedBy: "Fixture",
      ownerId: users[0].id,
      reviewerId: users[0].id,
      team: "",
      dueDate: "2050-12-31",
      answers: {},
      createdBy: users[0].id,
      history: [],
    },
  });
  browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
  const c = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1024, height: 768 } }),
    page = await c.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let firstRead = true,
    loginCount = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/account") && r.method() === "POST") loginCount++;
  });
  await page.route("**/api/platform?view=overview", async (route) => {
    if (firstRead) {
      firstRead = false;
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Sign in to continue" }),
      });
    } else await route.continue();
  });
  await page.goto(origin);
  await page.getByLabel("Username", { exact: true }).fill(users[0].username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in →", exact: true }).click();
  await page.getByRole("heading", { name: "Assigned to me and my station", exact: true }).waitFor();
  const queue = page.locator(".work-queue");
  await queue.getByText("Assigned startup " + tag, { exact: false }).waitFor();
  await queue.getByText("Future assigned PM " + tag, { exact: false }).waitFor();
  await queue.getByText("Future investigation " + tag, { exact: false }).waitFor();
  assert.equal(loginCount, 1, "Read recovery must not repeat login POST");
  assert.equal(await page.getByRole("alert").filter({ hasText: "Sign in to continue" }).count(), 0);
  const payload = await (await c.request.get(origin + "/api/work-queue")).json();
  assert(payload.items.some((x) => x.filters.standard === standard.id));
  assert(!payload.items.some((x) => x.filters.standard === otherStandard.id));
  assert.equal(payload.items.find((x) => x.id === problem.id).status, "Upcoming");
  assert.equal(payload.items.find((x) => x.id === pm.id).status, "Upcoming");
  fs.mkdirSync("docs/screenshots/dashboard-login-assignments", { recursive: true });
  await queue.screenshot({ path: "docs/screenshots/dashboard-login-assignments/my-assignments.png" });
  // A slow, obsolete refresh must not overwrite the next section with its old 401.
  let release;
  const gate = new Promise((r) => (release = r));
  let entered;
  const waiting = new Promise((r) => (entered = r));
  await page.unroute("**/api/platform?view=overview");
  await page.route("**/api/platform?view=overview", async (route) => {
    entered();
    await gate;
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "Sign in to continue" }),
    });
  });
  await page.getByRole("button", { name: /Refresh section/ }).click();
  await waiting;
  await page
    .locator("nav")
    .getByRole("button", { name: /Work queue/ })
    .first()
    .click();
  await page.getByRole("heading", { name: "My shift work queue", exact: true }).waitFor();
  const obsoleteResponse = page.waitForResponse(
    (r) => r.url().includes("/api/platform?view=overview") && r.status() === 401
  );
  release();
  await obsoleteResponse;
  assert.equal(await page.getByRole("alert").filter({ hasText: "Sign in to continue" }).count(), 0);
  // Genuine expired authentication leaves the dashboard instead of retaining stale account content.
  await c.clearCookies();
  await page.getByRole("button", { name: /Refresh section/ }).click();
  await page.getByLabel("Username", { exact: true }).waitFor();
  assert.equal(await page.locator(".work-queue").count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: one failed login dashboard read recovers without repeating login; stale refresh 401 cannot overwrite new navigation; expired session returns to login; Admin home lists own standalone checklist and future PM/investigation, excludes another account's checklist."
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
