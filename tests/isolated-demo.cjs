require("dotenv").config({ quiet: true });
const { Pool } = require("pg"),
  { randomUUID } = require("node:crypto"),
  { spawn, spawnSync } = require("node:child_process"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os"),
  assert = require("node:assert/strict"),
  { chromium } = require("playwright"),
  { demoEnvironment } = require("../scripts/demo-config.cjs");
const source = new URL(process.env.DATABASE_URL);
assert(["localhost", "127.0.0.1"].includes(source.hostname));
const name = "floorwork_demo_" + randomUUID().replaceAll("-", "").slice(0, 12),
  url = new URL(source);
url.pathname = "/" + name;
assert.notEqual(url.pathname, source.pathname);
const parent = new Pool({ connectionString: source.toString() });
let server, browser, folder, demo;
async function main() {
  folder = await fs.mkdtemp(path.join(os.tmpdir(), "floorwork-demo-test-"));
  await parent.query('CREATE DATABASE "' + name + '"');
  const password = "Demo test " + randomUUID() + "!",
    origin = "http://localhost:3108",
    env = {
      ...demoEnvironment({ ...process.env, CODESPACES: "false" }, url.toString(), folder),
      FLOORWORK_DEMO_PASSWORD: password,
      APP_ORIGIN: origin,
      PORT: "3108",
      HOSTNAME: "127.0.0.1",
    };
  function run(file) {
    const r = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", file], { env, encoding: "utf8" });
    assert.equal(r.status, 0, "Demo preparation failed: " + r.stdout + r.stderr);
  }
  run("scripts/setup.ts");
  run("scripts/demo-seed.ts");
  demo = new Pool({ connectionString: url.toString() });
  const before = (await demo.query('SELECT count(*)::int AS n FROM "User"')).rows[0].n;
  // Reproduce the old invalid department grant, then verify non-destructive upgrade.
  await demo.query(`UPDATE "User" SET "workspaceAccess"=$1::jsonb WHERE username='demo-manager'`, [
    JSON.stringify({
      mode: "restricted",
      locations: [{ plant: "DEMO Plant — fictional", department: "Tableting" }],
      equipmentIds: [],
    }),
  ]);
  await demo.query(`UPDATE "Setting" SET value=jsonb_set(value, '{version}', '1') WHERE key='demo-dataset'`);
  const examplesBefore = (await demo.query('SELECT count(*)::int AS n FROM "Problem"')).rows[0].n;
  run("scripts/demo-seed.ts");
  assert.equal((await demo.query('SELECT count(*)::int AS n FROM "Problem"')).rows[0].n, examplesBefore);
  assert.equal(
    (await demo.query('SELECT count(*)::int AS n FROM "User"')).rows[0].n,
    before,
    "Repeated setup must not duplicate examples"
  );
  server = spawn(process.execPath, [".floorwork/runtime/server.js"], {
    env,
    stdio: ["ignore", "ignore", "pipe"],
  });
  let serverErrors = "";
  server.stderr.on("data", (d) => (serverErrors += d.toString()));
  let ready = false;
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(origin + "/api/account")).status === 200) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  assert(ready, "Demo server failed to start");
  browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
  const c = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1024, height: 768 } });
  await c.addCookies([
    {
      name: "floorwork",
      value: "existing-normal-app-session",
      url: origin,
      httpOnly: true,
      sameSite: "Strict",
    },
  ]);
  let r = await c.request.post(origin + "/api/account", {
    headers: { Origin: origin },
    data: { action: "login", username: "demo-admin", password, remember: false },
  });
  assert.equal(r.status(), 200);
  const jar = await c.cookies();
  assert.equal(jar.find((x) => x.name === "floorwork")?.value, "existing-normal-app-session");
  assert(
    jar.some((x) => x.name === "floorwork-demo"),
    "Demo login uses its own cookie namespace"
  );
  const paths = [
    "/api/platform?view=work",
    "/api/platform?view=leaders",
    "/api/platform?view=audits",
    "/api/platform?view=changeovers",
    "/api/platform?view=studies",
    "/api/maintenance?kind=pm",
    "/api/maintenance?kind=cil",
    "/api/centerlines",
    "/api/five-s",
    "/api/defects",
    "/api/problems",
    "/api/operations?view=ideas",
    "/api/operations?view=downtime",
    "/api/external-data?section=Production%20results",
    "/api/platform?view=training",
    "/api/platform?view=guides",
    "/api/leadership",
    "/api/roles",
    "/api/access-requests",
    "/api/work-queue",
    "/api/submissions",
  ];
  for (const p of paths) {
    r = await c.request.get(origin + p);
    assert.equal(r.status(), 200, p + " " + (await r.text()));
    const d = await r.json();
    assert(d && typeof d === "object");
  }
  const results = await (
    await c.request.get(origin + "/api/external-data?section=Production%20results")
  ).json();
  assert(results.items.length >= 7);
  const integrations = await (await c.request.get(origin + "/api/integrations")).json();
  assert.equal(integrations.assignmentEmail.configured, false);
  assert.equal(integrations.sql.configured, false);
  const help = await (await c.request.get(origin + "/api/assistant")).json();
  assert.equal(help.aiConfigured, false);
  const page = await c.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin);
  await page.getByRole("note").filter({ hasText: "DEMO — FICTIONAL SAMPLE DATA" }).waitFor();
  await page.getByRole("heading", { name: "Assigned to me and my station", exact: true }).waitFor();
  await page.locator(".work-queue").getByText("DEMO changeover cart", { exact: false }).waitFor();
  await fs.mkdir("docs/screenshots/demo", { recursive: true });
  await page.screenshot({ path: "docs/screenshots/demo/admin.png", fullPage: false });
  await page.locator(".work-queue").screenshot({ path: "docs/screenshots/demo/assignments.png" });
  for (const [section, example] of [
    ["Preventive maintenance", "DEMO weekly press inspection"],
    ["TPM / CIL", "DEMO clean and inspect press"],
    ["5S audits", "DEMO Compressing 5S audit"],
    ["Centerlines", "DEMO press centerline"],
    ["Problem solving", "DEMO 2D label variation investigation"],
    ["Production results", "DEMO batch 1"],
    ["Training", "DEMO device-uploaded training video"],
    ["Troubleshooting", "DEMO visual troubleshooting guide"],
  ]) {
    await page
      .locator("nav")
      .getByRole("button", { name: new RegExp(section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) })
      .first()
      .click();
    await page.getByText(example, { exact: false }).first().waitFor();
  }
  const photo = (await demo.query('SELECT id FROM "Photo" LIMIT 1')).rows[0].id,
    video = (await demo.query('SELECT id FROM "GuideMedia" LIMIT 1')).rows[0].id;
  assert.equal((await c.request.get(origin + "/api/photos/" + photo)).status(), 200);
  assert.equal((await c.request.get(origin + "/api/guide-media/" + video)).status(), 200);
  await page
    .getByRole("button", { name: /^View photo:/ })
    .first()
    .click();
  const viewer = page.getByRole("dialog");
  await viewer.waitFor();
  await viewer.getByRole("button", { name: "Zoom photo", exact: true }).click();
  await viewer.locator("img.media-zoom").waitFor();
  await page.keyboard.press("Escape");
  await viewer.waitFor({ state: "hidden" });
  await page
    .getByRole("button", { name: /^View video:/ })
    .first()
    .click();
  await viewer.waitFor();
  assert.equal(await viewer.locator("video").count(), 1);
  await viewer.getByRole("button", { name: "Close viewer" }).click();
  // A submitted record outside the demo operator's area remains inaccessible.
  const coating = (await demo.query(`SELECT id FROM "Equipment" WHERE name='DEMO coater 01'`)).rows[0].id;
  const pressId = (await demo.query(`SELECT id FROM "Equipment" WHERE name='DEMO tablet press 01'`)).rows[0]
    .id;
  const author = (await demo.query(`SELECT id FROM "User" WHERE username='demo-leader'`)).rows[0].id;
  await demo.query(
    `INSERT INTO "Defect" (id,"equipmentId",title,description,priority,"reportedBy","equipmentSnapshot",media,history,"updatedAt") VALUES ($1,$2,'DEMO coating-area-only finding','Fictional scope test','Normal',$3,'{}','[]','[]',NOW())`,
    [randomUUID(), coating, author]
  );
  for (const username of ["demo-operator", "demo-leader", "demo-manager", "demo-maintenance"]) {
    const ctx = await browser.newContext({ serviceWorkers: "block" });
    const login = await ctx.request.post(origin + "/api/account", {
      headers: { Origin: origin },
      data: { action: "login", username, password, remember: false },
    });
    assert.equal(login.status(), 200, username);
    const q = await ctx.request.get(origin + "/api/work-queue");
    assert.equal(q.status(), 200, username);
    const problems = await (await ctx.request.get(origin + "/api/problems")).json();
    for (const method of ["2D", "4D"])
      for (const status of ["In progress", "Closed"])
        assert(
          problems.items.some((p) => p.method === method && p.status === status),
          username + " shares " + method + " " + status
        );
    const defects = await (await ctx.request.get(origin + "/api/defects")).json();
    assert(
      defects.defects.some((d) => d.title === "DEMO worn label guide"),
      username + " sees another user's submission"
    );
    assert.equal(
      defects.defects.some((d) => d.title === "DEMO coating-area-only finding"),
      username !== "demo-operator"
    );
    const equipment = (await (await ctx.request.get(origin + "/api/platform?view=work")).json()).equipment;
    assert(
      equipment.some((e) => e.id === pressId),
      username + " sees Compressing"
    );
    assert(!equipment.some((e) => e.department !== "Tableting"), username + " stays in Tableting");
    assert.equal(
      (await ctx.request.get(origin + "/api/photos/" + photo)).status(),
      200,
      username + " reads shared photo"
    );
    assert.equal(
      (await ctx.request.get(origin + "/api/guide-media/" + video)).status(),
      200,
      username + " reads shared video"
    );
    const notices = await (await ctx.request.get(origin + "/api/operations?view=summary")).json();
    assert(
      notices.notifications.some((n) => n.kind === "overdue"),
      username + " gets overdue notifications"
    );
    await ctx.close();
  }
  await page
    .locator("nav")
    .getByRole("button", { name: /Operator tasks/ })
    .first()
    .click();
  const row = page.locator("tr.record-row").first();
  await row.waitFor();
  await row.locator("td").first().click();
  const detail = page.getByRole("region", { name: "Expanded record" });
  assert(
    await row.getAttribute("aria-expanded").then((v) => v === "true"),
    "Clicking anywhere on record summary opens its full data"
  );
  await detail
    .getByRole("button", { name: /^View photo:/ })
    .first()
    .click();
  await viewer.waitFor();
  assert(
    await viewer.locator("img").evaluate((img) => img.complete && img.naturalWidth > 1000),
    "Realistic demo image loads"
  );
  await viewer.getByRole("button", { name: "Close viewer" }).click();
  assert(
    await row.getAttribute("aria-expanded").then((v) => v === "true"),
    "Media controls do not collapse the record"
  );
  await row.focus();
  await page.keyboard.press("Enter");
  assert.equal(await row.getAttribute("aria-expanded").then((v) => v === "true"), false);
  await page.keyboard.press("Space");
  assert(await row.getAttribute("aria-expanded").then((v) => v === "true"));
  assert(
    await row
      .locator("td")
      .first()
      .evaluate((td) => parseFloat(getComputedStyle(td).fontSize) >= 16)
  );
  await page.setViewportSize({ width: 768, height: 1024 });
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2),
    "Tablet page avoids document overflow"
  );
  await page.screenshot({ path: "docs/screenshots/demo/readable-history-tablet.png", fullPage: false });
  await detail
    .getByRole("button", { name: /^View photo:/ })
    .first()
    .click();
  await viewer.waitFor();
  await page.screenshot({ path: "docs/screenshots/demo/photo-viewer-tablet.png", fullPage: false });
  await viewer.getByRole("button", { name: "Close viewer" }).click();
  assert.deepEqual(errors, []);
  assert(!serverErrors.includes("PrismaClientKnownRequestError"));
  console.log(
    "PASS: isolated demo seeds all feature datasets, setup is repeatable, all five roles sign in, 21 section APIs load, department sharing and area denials hold, in-progress/closed cases and overdue notices are visible, expanded rows and photo/video viewers work on tablet, and live email/SQL/AI stay disabled. Temporary demo database/media are removed."
  );
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    if (server && server.exitCode === null) {
      server.kill("SIGTERM");
      await new Promise((r) => server.once("exit", r));
    }
    if (demo) await demo.end();
    await parent.query('DROP DATABASE IF EXISTS "' + name + '" WITH (FORCE)');
    await parent.end();
    if (folder) await fs.rm(folder, { recursive: true, force: true });
  });
