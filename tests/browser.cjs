require("tsx/cjs");
require("dotenv").config({ quiet: true });
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { mkdir } = require("node:fs/promises");
const { db } = require("../lib/db.ts");
const { hashPassword } = require("../lib/security.ts");
const Excel = require("exceljs");
const origin = process.env.APP_URL || "http://localhost:3000";
const suffix = randomUUID().slice(0, 8),
  password = `Floor-test ${randomUUID()}!`;
let browser;
const users = [],
  standardIds = [],
  contentIds = [];
let photoId;
const fixtureFamily = randomUUID();
async function request(context, path, body) {
  const r = await context.request[body ? "post" : "get"](
    origin + path,
    body ? { data: body, headers: { Origin: origin } } : {},
  );
  return { status: r.status(), body: await r.json() };
}
async function login(context, username, p = password) {
  const r = await request(context, "/api/account", {
    action: "login",
    username,
    password: p,
    remember: true,
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
}
async function main() {
  assert(
    ["localhost", "127.0.0.1"].includes(new URL(origin).hostname),
    "Tests only run against a local app",
  );
  const hash = await hashPassword(password);
  for (const role of ["Admin", "Manager", "DL/TL", "Operator"])
    users.push(
      await db.user.create({
        data: {
          username: `test-${role.toLowerCase().replace("/", "")}-${suffix}`,
          name:
            role === "Admin"
              ? "Jordan Test"
              : role === "Manager"
                ? "Morgan Supervisor"
                : `${role} Test`,
          role,
          password: hash,
          mustChange: false,
        },
      }),
    );
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    timezoneId: "America/Chicago",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await mkdir("docs/screenshots", { recursive: true });
  assert.equal((await request(context, "/api/platform")).status, 401);
  assert.equal(
    (await context.request.get(origin + "/api/preview")).status(),
    404,
  );
  await page.goto(origin);
  await page.getByLabel("Username", { exact: true }).fill(users[0].username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByText("Keep me signed in").click();
  await page.getByRole("button", { name: "Sign in →", exact: true }).click();
  await page.getByRole("heading", { name: "Welcome, Jordan." }).waitFor();
  const cookies = await context.cookies();
  const cookie = cookies.find((c) => c.name === "floorwork");
  assert(
    cookie.httpOnly &&
      cookie.sameSite === "Strict" &&
      cookie.expires > Date.now() / 1000,
  );
  await page.screenshot({
    path: "docs/screenshots/overview.png",
    fullPage: true,
  });
  const data = (await request(context, "/api/platform")).body;
  const equipment = data.equipment[0];
  let r = await request(context, "/api/platform", {
    action: "standard",
    title: "Packing quality verification",
    family: fixtureFamily,
    equipmentId: equipment.id,
    target: 0.1,
    tolerance: 10,
    steps: [
      { id: "inspection", text: "Verify first piece quality", photo: true },
    ],
  });
  assert.equal(r.status, 200);
  let s = await db.standard.findFirst({
    where: { family: fixtureFamily },
  });
  standardIds.push(s.id);
  await page.reload();
  await page.getByRole("heading", { name: "Welcome, Jordan." }).waitFor();
  await page
    .getByRole("button", { name: "☑ Standard work", exact: true })
    .click();
  await page.getByLabel("Standard work", { exact: true }).selectOption(s.id);
  await page.getByRole("button", { name: "✓ Yes", exact: true }).click();
  const image = await require("sharp")({
    create: { width: 60, height: 60, channels: 3, background: "#277267" },
  })
    .withMetadata({ orientation: 6 })
    .png()
    .toBuffer();
  await page.locator("input[type=file]").setInputFiles({
    name: "evidence.png",
    mimeType: "image/png",
    buffer: image,
  });
  await page.getByAltText("Evidence for step 1").waitFor();
  photoId = (await db.photo.findFirst({ where: { userId: users[0].id } })).id;
  await page
    .getByRole("button", { name: "Complete standard work", exact: true })
    .click();
  await page.getByRole("status").waitFor();
  assert.equal(
    await db.record.count({ where: { userId: users[0].id, kind: "run" } }),
    1,
  );
  await page
    .getByRole("button", { name: "◷ Time studies", exact: true })
    .click();
  await page.getByLabel("Study name").fill("Browser baseline");
  await page
    .getByLabel("Equipment", { exact: true })
    .selectOption(equipment.id);
  await page.getByRole("button", { name: "Start cycle", exact: true }).click();
  await page.waitForTimeout(450);
  await page
    .getByRole("button", { name: "Stop & record cycle", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save time study", exact: true })
    .click();
  await page.getByRole("status").waitFor();
  const study = await db.record.findFirst({
    where: { userId: users[0].id, kind: "study" },
  });
  assert(study.data.cycles[0].seconds > 0.3);
  await page
    .getByRole("button", { name: "◎ Supervisor audits", exact: true })
    .click();
  await page.getByLabel("Standard work", { exact: true }).selectOption(s.id);
  await page.getByLabel("Operator being audited").fill("Operator 104");
  await page.getByRole("button", { name: "✕ No", exact: true }).click();
  await page.locator("textarea").fill("Quality check requires follow-up.");
  await page
    .locator("input[type=file]")
    .setInputFiles({ name: "audit.png", mimeType: "image/png", buffer: image });
  await page.getByAltText("Evidence for step 1").waitFor();
  await page.getByRole("button", { name: "Start cycle", exact: true }).click();
  await page.waitForTimeout(350);
  await page
    .getByRole("button", { name: "Stop & record cycle", exact: true })
    .click();
  await page.screenshot({
    path: "docs/screenshots/supervisor-input.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Save audit", exact: true }).click();
  await page.getByRole("status").waitFor();
  const audit = await db.record.findFirst({
    where: { userId: users[0].id, kind: "audit" },
  });
  assert(audit.data.followUp);
  assert(audit.data.cycles[0].seconds > 0.2);
  r = await request(context, "/api/platform", {
    action: "standard",
    family: s.family,
    title: s.title,
    equipmentId: equipment.id,
    target: 90,
    tolerance: 15,
    steps: [{ id: "new", text: "Revised criteria", photo: false }],
  });
  assert.equal(r.status, 200);
  const revised = await db.standard.findFirst({
    where: { family: s.family, revision: 2 },
  });
  standardIds.push(revised.id);
  const old = await db.record.findUnique({ where: { id: audit.id } });
  assert.equal(old.data.snapshot.target, 0.1);
  assert.equal(old.data.snapshot.steps[0].id, "inspection");
  r = await request(context, "/api/platform", {
    action: "video",
    title: "Machine setup walkthrough",
    equipmentId: equipment.id,
    body: "https://youtu.be/dQw4w9WgXcQ",
  });
  assert.equal(r.status, 200);
  contentIds.push(
    (
      await db.content.findFirst({
        where: { title: "Machine setup walkthrough" },
      })
    ).id,
  );
  assert.equal(
    (
      await request(context, "/api/platform", {
        action: "video",
        title: "Unsafe",
        body: "javascript:alert(1)",
      })
    ).status,
    400,
  );
  await page.getByRole("button", { name: "▷ Training", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "▷ Training", exact: true }).click();
  await page.screenshot({
    path: "docs/screenshots/training.png",
    fullPage: true,
  });
  await page.route("https://www.youtube-nocookie.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<p>Provider test fixture</p>",
    }),
  );
  await page
    .getByRole("button", { name: "Play Machine setup walkthrough" })
    .click();
  await page.locator("iframe").waitFor();
  const exportResponse = await context.request.get(origin + "/api/export");
  assert.equal(exportResponse.status(), 200);
  const workbook = new Excel.Workbook();
  await workbook.xlsx.load(await exportResponse.body());
  assert.equal(workbook.worksheets.length, 6);
  assert(workbook.getWorksheet("Audit cycles").rowCount > 1);
  const operator = await browser.newContext();
  await login(operator, users[3].username);
  assert.equal(
    (
      await request(operator, "/api/platform", {
        action: "policy",
        role: "Operator",
        grants: ["users"],
      })
    ).status,
    403,
  );
  assert.equal(
    (await operator.request.get(origin + "/api/export")).status(),
    403,
  );
  assert.equal(
    (await operator.request.get(origin + "/api/photos/" + photoId)).status(),
    403,
  );
  assert.equal(
    (
      await request(operator, "/api/platform", {
        action: "run",
        standardId: s.id,
        started: new Date().toISOString(),
        responses: [
          { stepId: "inspection", answer: true, photo: photoId, comment: "" },
        ],
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await operator.request.post(origin + "/api/platform", {
        data: { action: "study" },
        headers: { Origin: "https://evil.example" },
      })
    ).status(),
    403,
  );
  assert.equal(
    (
      await operator.request.post(origin + "/api/platform", {
        data: { action: "study" },
      })
    ).status(),
    403,
  );
  assert.equal(
    (
      await context.request.post(origin + "/api/platform", {
        data: JSON.stringify({ action: "study", padding: "x".repeat(270000) }),
        headers: { Origin: origin, "Content-Type": "application/json" },
      })
    ).status(),
    413,
  );
  assert.equal(
    (
      await request(context, "/api/photos", {
        image: "data:image/png;base64,YmFk",
      })
    ).status,
    400,
  );
  const manager = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    timezoneId: "America/Chicago",
  });
  await login(manager, users[1].username);
  const mp = await manager.newPage();
  await mp.goto(origin);
  await mp
    .getByRole("button", { name: "◎ Supervisor audits", exact: true })
    .click();
  await mp
    .getByLabel("Standard work", { exact: true })
    .selectOption(revised.id);
  await mp.getByLabel("Operator being audited").fill("Operator 104");
  await mp.getByRole("button", { name: "✓ Yes", exact: true }).click();
  await mp.getByRole("button", { name: "Start cycle", exact: true }).click();
  await mp.waitForTimeout(300);
  await mp
    .getByRole("button", { name: "Stop & record cycle", exact: true })
    .click();
  await mp.screenshot({
    path: "docs/screenshots/supervisor-manager.png",
    fullPage: true,
  });
  assert.equal(
    await mp.getByRole("button", { name: "Accounts", exact: true }).count(),
    0,
  );
  const tl = await browser.newContext();
  await login(tl, users[2].username);
  assert.equal(
    (
      await request(tl, "/api/platform", {
        action: "equipment",
        name: "Denied",
        plant: "P",
        department: "D",
        area: "A",
        line: "L",
      })
    ).status,
    403,
  );
  const original = (await db.policy.findUnique({ where: { role: "Operator" } }))
    .grants;
  try {
    assert.equal(
      (
        await request(context, "/api/platform", {
          action: "policy",
          role: "Operator",
          grants: [],
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await request(operator, "/api/platform", {
          action: "study",
          title: "Denied",
          equipmentId: equipment.id,
          cycles: [
            { element: "Cycle", seconds: 1, at: new Date().toISOString() },
          ],
        })
      ).status,
      403,
    );
  } finally {
    await db.policy.update({
      where: { role: "Operator" },
      data: { grants: original },
    });
  }
  await page.getByRole("button", { name: "♙ Accounts", exact: true }).click();
  await page.getByLabel("Username", { exact: true }).fill("new-" + suffix);
  await page.getByLabel("Display name", { exact: true }).fill("New employee");
  await page.getByLabel("Temporary password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.getByRole("status").waitFor();
  const created = await db.user.findUnique({
    where: { username: "new-" + suffix },
  });
  assert(created);
  users.push(created);
  const fresh = await browser.newContext();
  await login(fresh, created.username);
  assert.equal((await request(fresh, "/api/platform")).status, 403);
  const newPassword = `Changed ${randomUUID()}!`;
  assert.equal(
    (
      await request(fresh, "/api/account", {
        action: "password",
        current: password,
        password: newPassword,
      })
    ).status,
    200,
  );
  assert.equal((await request(fresh, "/api/platform")).status, 401);
  await login(fresh, created.username, newPassword);
  assert.equal((await request(fresh, "/api/platform")).status, 200);
  const replay = await browser.newContext({
    storageState: await operator.storageState(),
  });
  await request(operator, "/api/account", { action: "logout" });
  assert.equal((await request(replay, "/api/platform")).status, 401);
  await login(operator, users[3].username);
  assert.equal(
    (
      await request(context, "/api/platform", {
        action: "user",
        id: users[3].id,
        username: users[3].username,
        name: users[3].name,
        role: "Operator",
        active: false,
      })
    ).status,
    200,
  );
  assert.equal((await request(operator, "/api/platform")).status, 401);
  assert.equal(
    (
      await request(operator, "/api/account", {
        action: "login",
        username: users[3].username,
        password,
        remember: false,
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request(context, "/api/platform", {
        action: "user",
        id: users[0].id,
        username: users[0].username,
        name: users[0].name,
        role: "Operator",
        active: true,
      })
    ).status,
    400,
  );
  for (let i = 0; i < 6; i++) {
    const attempt = await request(context, "/api/account", {
      action: "login",
      username: "missing-" + suffix,
      password: "incorrect-password",
      remember: false,
    });
    assert.equal(attempt.status, i < 5 ? 401 : 429);
  }
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    timezoneId: "America/Chicago",
    isMobile: true,
    hasTouch: true,
  });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(origin);
  await mobilePage.screenshot({
    path: "docs/screenshots/mobile-login.png",
    fullPage: true,
  });
  assert(
    await mobilePage.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await login(mobile, users[0].username);
  await mobilePage.reload();
  await mobilePage.getByRole("heading", { name: "Welcome, Jordan." }).waitFor();
  await mobilePage.screenshot({
    path: "docs/screenshots/mobile-overview.png",
    fullPage: true,
  });
  assert(
    await mobilePage.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  const probe = await context.newPage();
  await probe.route(origin + "/", async (route) => {
    const response = await route.fetch();
    const original = await response.text();
    const body = original.replace(
      "<head>",
      '<head><script id="untrusted-probe">globalThis.__untrustedProbe = true</script>',
    );
    assert.notEqual(body, original);
    await route.fulfill({ response, body });
  });
  await probe.goto(origin);
  assert(
    await probe.evaluate(
      () => document.getElementById("untrusted-probe") !== null,
    ),
  );
  assert.equal(
    await probe.evaluate(() => globalThis.__untrustedProbe),
    undefined,
  );
  await probe.close();
  const decoded = await context.request.get(origin + "/api/photos/" + photoId);
  assert.equal(decoded.status(), 200);
  const metadata = await require("sharp")(await decoded.body()).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.orientation, undefined);
  const html = await context.request.get(origin);
  const csp = html.headers()["content-security-policy"];
  assert(csp.includes("'nonce-") && !csp.includes("unsafe-eval"));
  const html2 = await context.request.get(origin);
  assert.notEqual(csp, html2.headers()["content-security-policy"]);
  assert.equal(html.headers()["x-content-type-options"], "nosniff");
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    "PASS: real login, photos, standard runs, timers, audits, immutable revisions, training, six-sheet Excel, four roles, role revocation, CSRF, upload validation, size limits, account provisioning, forced password change, session replay, CSP, and mobile layout.",
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
    await db.record.deleteMany({ where: { userId: { in: ids } } });
    const photos = await db.photo.findMany({ where: { userId: { in: ids } } });
    for (const photo of photos)
      await require("node:fs/promises").rm(
        require("node:path").join(process.cwd(), "uploads", photo.id + ".webp"),
        { force: true },
      );
    await db.photo.deleteMany({ where: { userId: { in: ids } } });
    await db.session.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.standard.deleteMany({ where: { id: { in: standardIds } } });
    await db.content.deleteMany({ where: { id: { in: contentIds } } });
    await db.rate.deleteMany({
      where: { OR: ids.map((id) => ({ key: { contains: id } })) },
    });
    await db.$disconnect();
  });
