require("tsx/cjs");
require("dotenv").config({ quiet: true });
const { db } = require("../lib/db.ts"),
  { hashPassword } = require("../lib/security.ts"),
  { chromium } = require("playwright"),
  { randomUUID } = require("node:crypto"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises");
const origin = process.env.APP_URL || "http://localhost:3000",
  suffix = randomUUID().slice(0, 8),
  users = [],
  equipment = [],
  media = [];
let browser, centerline;
async function main() {
  assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
  const password = "Secure fixture " + randomUUID() + "!",
    hash = await hashPassword(password);
  for (let n = 0; n < 2; n++) {
    const eq = await db.equipment.create({
      data: {
        name: "Security press " + suffix + "-" + n,
        plant: "Security " + suffix,
        department: "Department " + n,
        area: "Area",
        line: "",
      },
    });
    equipment.push(eq);
    users.push(
      await db.user.create({
        data: {
          username: "security-" + suffix + "-" + n,
          name: "Security Fixture",
          role: "Manager",
          password: hash,
          mustChange: false,
          workspaceAccess: {
            mode: "restricted",
            locations: [],
            equipmentIds: [eq.id],
          },
        },
      }),
    );
  }
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const contexts = [];
  for (const u of users) {
    const c = await browser.newContext({
      serviceWorkers: "block",
      viewport: { width: 820, height: 1180 },
      hasTouch: true,
    });
    contexts.push(c);
    const r = await c.request.post(origin + "/api/account", {
      headers: { Origin: origin },
      data: {
        action: "login",
        username: u.username,
        password,
        remember: false,
      },
    });
    assert.equal(r.status(), 200);
  }
  const [manager, other] = contexts,
    anonymous = await browser.newContext();
  for (const route of [
    "/api/centerlines",
    "/api/platform",
    "/api/people",
    "/api/export",
    "/api/integrations",
    "/api/maintenance",
    "/api/external-data",
    "/api/guide-media/" + randomUUID(),
  ])
    assert.equal(
      (await anonymous.request.get(origin + route)).status(),
      401,
      route,
    );
  const bytes = Buffer.alloc(2 * 1024 * 1024);
  bytes.write("ftyp", 4, "ascii");
  bytes.write("range-test", 500, "ascii");
  for (const badOrigin of ["https://evil.example", null]) {
    const r = await manager.request.post(origin + "/api/guide-media", {
      headers: {
        "Content-Type": "video/mp4",
        ...(badOrigin ? { Origin: badOrigin } : {}),
      },
      data: bytes,
    });
    assert.equal(r.status(), 403);
  }
  const uploaded = await manager.request.post(origin + "/api/guide-media", {
    headers: { "Content-Type": "video/mp4", Origin: origin },
    data: bytes,
  });
  assert.equal(uploaded.status(), 200, await uploaded.text());
  const id = (await uploaded.json()).id;
  media.push(id);
  const marker =
    "Security " + suffix + ' <img src=x onerror="globalThis.pwned=1">';
  const param = {
    id: randomUUID(),
    name: '<script>alert("setting")</script>',
    kind: "numeric",
    unit: "rpm",
    target: 100,
    lower: 90,
    upper: 110,
    expected: "",
    instructions: "Literal <b>text</b>",
    photo: false,
  };
  const created = await manager.request.post(origin + "/api/centerlines", {
    headers: { Origin: origin },
    data: {
      action: "save",
      title: marker,
      equipmentId: equipment[0].id,
      setup: "",
      notes: "",
      parameters: [param],
    },
  });
  assert.equal(created.status(), 200);
  centerline = await db.centerline.findFirst({ where: { title: marker } });
  const audit = await manager.request.post(origin + "/api/centerlines", {
    headers: { Origin: origin },
    data: {
      action: "audit",
      id: centerline.id,
      version: 1,
      submissionId: randomUUID(),
      context: "",
      responses: [
        {
          parameterId: param.id,
          actual: "100",
          comment: "",
          media: [{ id, kind: "video", caption: marker }],
        },
      ],
    },
  });
  assert.equal(audit.status(), 200);
  for (const range of ["bytes=500-509", "bytes=-10", "bytes=500-"]) {
    const r = await manager.request.get(origin + "/api/guide-media/" + id, {
      headers: { Range: range },
    });
    assert.equal(r.status(), 206);
    assert(r.headers()["cache-control"].includes("no-store"));
    if (range === "bytes=500-509") {
      assert.equal((await r.body()).toString(), "range-test");
      assert.equal(r.headers()["content-length"], "10");
    }
  }
  assert.equal(
    (
      await manager.request.get(origin + "/api/guide-media/" + id, {
        headers: { Range: "bytes=999999999999999999-" },
      })
    ).status(),
    416,
  );
  assert.equal(
    (await other.request.get(origin + "/api/guide-media/" + id)).status(),
    403,
  );
  const page = await manager.newPage();
  await page.goto(origin);
  await page
    .getByRole("button", { name: "≋ Centerlines", exact: true })
    .click();
  await page.getByText(marker, { exact: true }).first().waitFor();
  assert.equal(await page.locator('img[src="x"]').count(), 0);
  assert.equal(await page.evaluate(() => globalThis.pwned), undefined);
  await page
    .getByRole("button", { name: "Audit centerline", exact: true })
    .click();
  await page.getByRole("group").filter({ hasText: param.name }).waitFor();
  assert.equal(
    await page
      .locator("script")
      .filter({ hasText: 'alert("setting")' })
      .count(),
    0,
  );
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await fs.mkdir("docs/screenshots/security-readiness", { recursive: true });
  await page.screenshot({
    path: "docs/screenshots/security-readiness/tablet-safe-content.png",
  });
  for (let n = 0; n < 6; n++) {
    const r = await manager.request.post(origin + "/api/account", {
      headers: { Origin: origin },
      data: {
        action: "password",
        current: "wrong password",
        password: "Different safe password " + randomUUID(),
      },
    });
    assert.equal(r.status(), n < 5 ? 400 : 429);
    const body = await r.text();
    assert(!/Prisma|SELECT|postgresql:|password=|node_modules/.test(body));
  }
  const manifest = await manager.request.get(origin + "/manifest.webmanifest");
  assert.equal(manifest.status(), 200);
  const m = await manifest.json();
  assert.equal(m.display, "standalone");
  for (const icon of m.icons)
    assert.equal((await manager.request.get(origin + icon.src)).status(), 200);
  console.log(
    "PASS: protected API reads, raw video upload CSRF checks, bounded range playback and media scope, text-context XSS encoding, tablet layout, password-change throttling, safe errors and PWA manifest/icons.",
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
    await db.record.deleteMany({ where: { userId: { in: ids } } });
    await db.centerline.deleteMany({ where: { createdBy: { in: ids } } });
    await db.guideMedia.deleteMany({ where: { id: { in: media } } });
    for (const id of media)
      await fs.rm("uploads/" + id + ".video", { force: true });
    await db.session.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.equipment.deleteMany({
      where: { id: { in: equipment.map((x) => x.id) } },
    });
    await db.rate.deleteMany({
      where: { OR: ids.map((id) => ({ key: { contains: id } })) },
    });
    await db.$disconnect();
  });
