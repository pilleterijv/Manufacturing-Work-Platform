require("tsx/cjs");
require("dotenv").config({ quiet: true });
const assert = require("node:assert/strict"),
  { randomUUID } = require("node:crypto"),
  { chromium } = require("playwright");
const { db } = require("../lib/db.ts"),
  { hashPassword } = require("../lib/security.ts"),
  { stats } = require("../lib/rules.ts");
const origin = process.env.APP_URL || "http://localhost:3000";
const users = [],
  equipment = [],
  standards = [],
  records = [];
let browser;
async function main() {
  assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
  const password = `Tablet ${randomUUID()}!`,
    hash = await hashPassword(password),
    suffix = randomUUID().slice(0, 8);
  for (const role of ["Admin", "Operator"])
    users.push(
      await db.user.create({
        data: {
          username: "tablet-" + role.toLowerCase() + "-" + suffix,
          name: "Tablet " + role,
          role,
          password: hash,
          mustChange: false,
          workspaceAccess: { mode: "all", locations: [], equipmentIds: [] },
        },
      }),
    );
  for (const department of ["Tablet A " + suffix, "Tablet B " + suffix])
    equipment.push(
      await db.equipment.create({
        data: {
          name: "Tablet fixture",
          plant: "Test",
          department,
          area: "Packing",
          line: "Line A",
        },
      }),
    );
  const family = randomUUID();
  await db.standard.createMany({
    data: Array.from({ length: 105 }, (_, i) => ({
      id: randomUUID(),
      family,
      revision: i + 1,
      title: "Tablet standard " + suffix,
      equipmentId: equipment[0].id,
      target: 30,
      tolerance: 10,
      steps: [{ id: "check", text: "Verify guard", photo: false }],
    })),
  });
  standards.push(
    ...(
      await db.standard.findMany({ where: { family }, select: { id: true } })
    ).map((r) => r.id),
  );
  const at = new Date("2026-11-02T12:00:00Z");
  await db.record.createMany({
    data: [0, 1].flatMap((eq) =>
      Array.from({ length: 3 }, (_, i) => ({
        id: randomUUID(),
        kind: "study",
        userId: users[0].id,
        created: at,
        data: {
          equipmentId: equipment[eq].id,
          equipmentSnapshot: equipment[eq],
          title: "Study",
          cycles: [
            { element: "A", seconds: (eq + 1) * 10 + i, at: at.toISOString() },
          ],
        },
      })),
    ),
  });
  const ideaData = Array.from({ length: 205 }, (_, i) => ({
    id: randomUUID(),
    title: `Tablet idea ${i}`,
    equipmentId: equipment[0].id,
    equipmentSnapshot: equipment[0],
    currentState: "Current",
    proposal: "Future",
    process: "Changeover",
    dueDate: "2026-12-01",
    createdAt: at,
    createdBy: users[0].id,
    submitterId: users[0].id,
    pilotId: users[1].id,
    validatorId: users[0].id,
  }));
  await db.idea.createMany({ data: ideaData });
  const reason = await db.downtimeReason.findFirst(),
    config = (await db.setting.findUnique({ where: { key: "shifts" } })).value;
  await db.downtime.createMany({
    data: Array.from({ length: 105 }, () => ({
      id: randomUUID(),
      equipmentId: equipment[0].id,
      equipmentSnapshot: equipment[0],
      reasonId: reason.id,
      reasonName: reason.name,
      shiftConfig: config,
      startedAt: at,
      endedAt: new Date(+at + 60000),
      startedBy: users[0].id,
      stoppedBy: users[0].id,
    })),
  });
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 768, height: 1024 },
    isMobile: true,
    hasTouch: true,
  });
  let r = await context.request.post(origin + "/api/account", {
    headers: { Origin: origin },
    data: {
      action: "login",
      username: users[0].username,
      password,
      remember: false,
    },
  });
  assert.equal(r.status(), 200);
  const get = async (path) => {
    const r = await context.request.get(origin + path);
    assert.equal(r.status(), 200, await r.text());
    return r.json();
  };
  // Bounded pages with timestamp ties and a deleted boundary row remain stable.
  let first = await get(
    "/api/operations?view=ideas&department=" +
      encodeURIComponent(equipment[0].department),
  );
  assert.equal(first.ideas.length, 100);
  assert.equal(first.downtime.length, 0);
  assert(first.ideasPage.hasMore);
  const seen = new Set(first.ideas.map((i) => i.id));
  const boundary = first.ideas.at(-1).id;
  await db.idea.delete({ where: { id: boundary } });
  let next = await get(
    "/api/operations?" +
      new URLSearchParams({
        view: "ideas",
        department: equipment[0].department,
        cursor: first.ideasPage.cursor,
      }),
  );
  assert.equal(next.ideas.length, 100);
  for (const i of next.ideas) {
    assert(!seen.has(i.id));
    seen.add(i.id);
  }
  next = await get(
    "/api/operations?" +
      new URLSearchParams({
        view: "ideas",
        department: equipment[0].department,
        cursor: next.ideasPage.cursor,
      }),
  );
  assert.equal(next.ideas.length, 5);
  assert(!next.ideasPage.hasMore);
  for (const i of next.ideas) {
    assert(!seen.has(i.id));
    seen.add(i.id);
  }
  assert.equal(seen.size, 205);
  assert.equal(
    (
      await get(
        "/api/operations?view=ideas&department=" +
          encodeURIComponent(equipment[1].department),
      )
    ).ideas.length,
    0,
  );
  assert.equal((await get("/api/operations?view=downtime")).ideas.length, 0);
  const work = await get("/api/platform?view=work");
  assert.equal(work.standards.filter((s) => s.family === family).length, 1);
  assert.equal(work.standards.find((s) => s.family === family).revision, 105);
  assert.equal(work.content.length, 0);
  const rev = await get("/api/platform?view=revisions&family=" + family);
  assert.equal(rev.revisions.length, 100);
  assert(rev.hasMore);
  const older = await get(
    "/api/platform?view=revisions&family=" +
      family +
      "&before=" +
      rev.revisions.at(-1).revision,
  );
  assert.equal(older.revisions.length, 5);
  const report = await get(
    "/api/dashboard?" +
      new URLSearchParams({
        department: equipment[0].department,
        from: "2026-11-02",
        to: "2026-11-02",
      }),
  );
  assert.equal(report.summary.studies, 3);
  assert.equal(report.summary.observations, 3);
  assert.equal(report.summary.equipment, 1);
  assert.equal(report.summary.standards, 1);
  assert.equal(report.summary.downtimeSeconds, 6300);
  const expected = stats([10, 11, 12]);
  for (const key of Object.keys(expected))
    assert(
      Math.abs(report.summary.cycleStats[key] - expected[key]) < 1e-9,
      key,
    );
  // Host and fetch-metadata protection, private caching and no leaked platform header.
  r = await context.request.get(origin + "/api/account", {
    headers: { Host: "attacker.example" },
  });
  assert.equal(r.status(), 403);
  r = await context.request.get(origin + "/api/account", {
    headers: { "Sec-Fetch-Site": "cross-site" },
  });
  assert.equal(r.status(), 403);
  r = await context.request.get(origin + "/api/account");
  assert.match(r.headers()["cache-control"], /no-store/);
  assert.equal(r.headers()["x-powered-by"], undefined);
  assert.equal(r.headers()["cross-origin-resource-policy"], "same-origin");
  const manifest = await get("/manifest.webmanifest");
  assert.equal(manifest.display, "standalone");
  assert(manifest.icons.some((i) => i.sizes === "512x512"));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin);
  await page
    .getByRole("heading", { name: "Whole-floor performance", exact: true })
    .waitFor();
  await page.evaluate(() => navigator.serviceWorker.ready);
  assert(
    await page.evaluate(() => {
      const banner = document.querySelector(".install-banner"),
        sidebar = document.querySelector(".sidebar");
      if (!banner || !sidebar || getComputedStyle(sidebar).position !== "fixed")
        return true;
      return (
        sidebar.getBoundingClientRect().top >=
        banner.getBoundingClientRect().bottom - 1
      );
    }),
    "Install instructions overlap tablet navigation",
  );
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page
    .getByLabel("Leadership department", { exact: true })
    .selectOption(equipment[0].department);
  await page
    .locator("form.leadership-filters")
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await page
    .getByRole("heading", {
      name: equipment[0].department + " — section dashboard",
      exact: true,
    })
    .waitFor();
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "Tablet dashboard overflows viewport",
  );
  await page.screenshot({
    path: "docs/screenshots/tablet-department-dashboard.png",
    fullPage: true,
  });
  const cache = await page.evaluate(async () => {
    const names = await caches.keys();
    const urls = [];
    for (const name of names) {
      for (const r of await (await caches.open(name)).keys())
        urls.push(new URL(r.url).pathname);
    }
    return urls;
  });
  assert.deepEqual(cache, ["/offline.html"]);
  await context.setOffline(true);
  await page.goto(origin);
  await page.getByRole("heading", { name: "Reconnect to Floorwork" }).waitFor();
  await page.screenshot({
    path: "docs/screenshots/tablet-offline.png",
    fullPage: true,
  });
  await context.setOffline(false);
  assert.deepEqual(errors, []);
  const operator = await browser.newContext({
    viewport: { width: 820, height: 1180 },
    isMobile: true,
    hasTouch: true,
  });
  r = await operator.request.post(origin + "/api/account", {
    headers: { Origin: origin },
    data: {
      action: "login",
      username: users[1].username,
      password,
      remember: false,
    },
  });
  assert.equal(r.status(), 200);
  r = await operator.request.get(origin + "/api/dashboard");
  assert.equal(r.status(), 200);
  assert((await r.json()).department);
  assert.equal(
    (await operator.request.get(origin + "/api/leadership")).status(),
    403,
  );
  assert.equal(
    (
      await operator.request.get(
        origin + "/api/platform?view=revisions&family=" + family,
      )
    ).status(),
    403,
  );
  const op = await operator.newPage();
  await op.goto(origin);
  await op.getByRole("heading", { name: /section dashboard$/ }).waitFor();
  assert.equal(
    await op.getByRole("button", { name: /Leadership dashboard$/ }).count(),
    0,
  );
  console.log(
    "PASS: tablet PWA manifest/service worker, offline privacy, department SQL statistics, latest standards and revision paging, 205 tied-timestamp ideas across deleted cursor, 105 downtime rows, host/cross-site guards, tablet layout and role separation.",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    const eq = equipment.map((e) => e.id),
      ids = users.map((u) => u.id);
    const ideas = (
      await db.idea.findMany({
        where: { equipmentId: { in: eq } },
        select: { id: true },
      })
    ).map((i) => i.id);
    await db.notification.deleteMany({ where: { ideaId: { in: ideas } } });
    await db.ideaParticipant.deleteMany({ where: { ideaId: { in: ideas } } });
    await db.idea.deleteMany({ where: { id: { in: ideas } } });
    await db.downtime.deleteMany({ where: { equipmentId: { in: eq } } });
    await db.record.deleteMany({ where: { userId: { in: ids } } });
    await db.standard.deleteMany({ where: { id: { in: standards } } });
    await db.equipment.deleteMany({ where: { id: { in: eq } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });
