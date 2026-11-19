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
  run("scripts/demo-seed.ts");
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
  for (const username of ["demo-operator", "demo-leader", "demo-manager", "demo-maintenance"]) {
    const ctx = await browser.newContext({ serviceWorkers: "block" });
    const login = await ctx.request.post(origin + "/api/account", {
      headers: { Origin: origin },
      data: { action: "login", username, password, remember: false },
    });
    assert.equal(login.status(), 200, username);
    const q = await ctx.request.get(origin + "/api/work-queue");
    assert.equal(q.status(), 200, username);
    await ctx.close();
  }
  assert.deepEqual(errors, []);
  assert(!serverErrors.includes("PrismaClientKnownRequestError"));
  console.log(
    "PASS: isolated demo seeds all feature datasets, setup is repeatable, all five roles sign in, 21 section APIs load, production results are visible, demo banner renders and live email/SQL/AI stay disabled. Temporary demo database/media are removed."
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
