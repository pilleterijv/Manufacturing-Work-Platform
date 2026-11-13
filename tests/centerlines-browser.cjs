require("tsx/cjs");
require("dotenv").config({ quiet: true });
const { db } = require("../lib/db.ts"),
  { hashPassword } = require("../lib/security.ts"),
  { chromium } = require("playwright"),
  { randomUUID } = require("node:crypto"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  Excel = require("exceljs");
const origin = process.env.APP_URL || "http://localhost:3000",
  suffix = randomUUID().slice(0, 8),
  prefix = "Centerline-" + suffix,
  password = "Fixture " + randomUUID() + "!";
const users = [],
  equipment = [],
  profiles = [],
  contexts = [];
let browser, photo;
const api = async (c, body) => {
  const r = await c.request.post(origin + "/api/centerlines", {
    headers: { Origin: origin },
    data: body,
  });
  return { status: r.status(), data: await r.json() };
};
async function main() {
  assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
  for (const department of [prefix + " A", prefix + " B"])
    equipment.push(
      await db.equipment.create({
        data: {
          name: department + " press",
          plant: prefix,
          department,
          area: "Compressing",
          line: "",
        },
      }),
    );
  const hash = await hashPassword(password);
  for (const [role, index] of [
    ["Admin", 0],
    ["Manager", 0],
    ["Operator", 0],
    ["Manager", 1],
    ["Operator", 0],
  ])
    users.push(
      await db.user.create({
        data: {
          username: "centerline-" + suffix + "-" + users.length,
          name: role + " Centerline",
          role,
          password: hash,
          mustChange: false,
          workspaceAccess: {
            mode: "restricted",
            locations: [],
            equipmentIds: [equipment[index].id],
          },
          ...(users.length === 4
            ? { adminPrivileges: ["centerlines.manage"] }
            : {}),
        },
      }),
    );
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  for (const u of users) {
    const c = await browser.newContext({
      serviceWorkers: "block",
      viewport: { width: 1440, height: 1000 },
    });
    contexts.push(c);
    const r = await c.request.post(origin + "/api/account", {
      headers: { Origin: origin },
      data: { action: "login", username: u.username, password },
    });
    assert.equal(r.status(), 200);
  }
  const [admin, manager, operator, other, delegate] = contexts;
  const parameter = {
    id: randomUUID(),
    name: "Feed speed",
    kind: "numeric",
    unit: "rpm",
    target: 100,
    lower: 90,
    upper: 110,
    expected: "",
    instructions: "Read the speed display",
    photo: false,
  };
  const text = {
    ...parameter,
    id: randomUUID(),
    name: "Guard position",
    kind: "text",
    target: null,
    lower: null,
    upper: null,
    expected: "Closed",
    unit: "",
    instructions: "Verify position",
    photo: false,
  };
  const input = {
    action: "save",
    title: prefix + " approved setup",
    equipmentId: equipment[0].id,
    setup: "SKU-TEST",
    notes: "Use approved machine setup",
    parameters: [parameter, text],
  };
  assert.equal((await api(operator, input)).status, 403);
  assert.equal((await api(other, input)).status, 403);
  assert.equal(
    (
      await api(manager, {
        ...input,
        parameters: [{ ...parameter, lower: 120 }],
      })
    ).status,
    400,
  );
  assert.equal((await api(delegate, input)).status, 200);
  let c = await db.centerline.findFirst({ where: { title: input.title } });
  profiles.push(c.id);
  assert.equal(
    (await other.request.get(origin + "/api/centerlines")).status(),
    200,
  );
  assert.equal(
    (
      await (await other.request.get(origin + "/api/centerlines")).json()
    ).plans.some((x) => x.id === c.id),
    false,
  );
  const audit = {
    action: "audit",
    id: c.id,
    version: c.version,
    submissionId: randomUUID(),
    context: "Shift 1 / batch 123",
    responses: [
      { parameterId: parameter.id, actual: "110", comment: "", media: [] },
      { parameterId: text.id, actual: "closed", comment: "", media: [] },
    ],
  };
  assert.equal((await api(other, audit)).status, 403);
  assert.equal(
    (
      await api(operator, {
        ...audit,
        responses: [audit.responses[0], audit.responses[0]],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await api(operator, {
        ...audit,
        responses: [
          { ...audit.responses[0], actual: "NaN" },
          audit.responses[1],
        ],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await api(operator, {
        ...audit,
        responses: [
          { ...audit.responses[0], actual: "111" },
          audit.responses[1],
        ],
      })
    ).status,
    400,
  );
  const results = await Promise.all([
    api(operator, audit),
    api(operator, audit),
  ]);
  assert(
    results.every((x) => x.status === 200),
    JSON.stringify(results),
  );
  assert.equal(await db.record.count({ where: { id: audit.submissionId } }), 1);
  assert.equal(
    (await api(operator, { ...audit, context: "changed" })).status,
    409,
  );
  let record = await db.record.findUnique({
    where: { id: audit.submissionId },
  });
  assert.equal(record.data.followUp, false);
  assert.equal(record.data.responses[0].actual, "110");
  const fail = {
    ...audit,
    submissionId: randomUUID(),
    responses: [
      {
        ...audit.responses[0],
        actual: "111",
        comment: "Above limit; notified supervisor",
      },
      audit.responses[1],
    ],
  };
  assert.equal((await api(operator, fail)).status, 200);
  assert.equal(
    (await db.record.findUnique({ where: { id: fail.submissionId } })).data
      .followUp,
    true,
  );
  assert.equal(
    (
      await api(manager, {
        ...input,
        id: c.id,
        version: 1,
        parameters: [{ ...parameter, upper: 120 }, text],
      })
    ).status,
    200,
  );
  assert.equal(
    (await api(operator, { ...audit, submissionId: randomUUID() })).status,
    409,
  );
  assert.equal(
    (await api(manager, { ...input, id: c.id, version: 1 })).status,
    409,
  );
  assert.equal(
    (await db.record.findUnique({ where: { id: fail.submissionId } })).data
      .centerlineSnapshot.parameters[0].upper,
    110,
  );
  const filtered = await (
    await manager.request.get(
      origin +
        "/api/centerlines?person=" +
        users[2].id +
        "&search=" +
        encodeURIComponent(equipment[0].name),
    )
  ).json();
  assert.equal(filtered.summary.total, 2);
  assert.equal(filtered.summary.followUps, 1);
  const suggestions = await (
    await manager.request.get(
      origin + "/api/section-options?section=Centerlines&q=" + prefix,
    )
  ).json();
  assert(JSON.stringify(suggestions).includes(input.title));
  const exportResponse = await manager.request.get(
    origin + "/api/centerlines?format=xlsx&search=" + prefix,
  );
  assert.equal(exportResponse.status(), 200);
  const workbook = new Excel.Workbook();
  await workbook.xlsx.load(await exportResponse.body());
  assert.equal(workbook.getWorksheet("Audit readings").rowCount, 5);
  assert.equal(workbook.getWorksheet("Centerline settings").rowCount, 3);
  // Browser: real create/edit controls, automatic out-of-limits result, immutable audit history, dashboard and refresh-preserved drafts.
  const page = await manager.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin);
  await page
    .getByRole("button", { name: "≋ Centerlines", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Machine centerlines", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Add centerline", exact: true })
    .click();
  await page
    .getByLabel("Centerline title", { exact: true })
    .fill(prefix + " browser setup");
  await page
    .getByLabel("Centerline machine", { exact: true })
    .selectOption(equipment[0].id);
  await page.getByLabel("Product / setup", { exact: true }).fill("SKU-UI");
  await page.getByLabel("Setting name 1", { exact: true }).fill("Temperature");
  await page.getByLabel("Target 1", { exact: true }).fill("50");
  await page.getByLabel("Lower limit 1", { exact: true }).fill("45");
  await page.getByLabel("Upper limit 1", { exact: true }).fill("55");
  await page.getByLabel("Unit 1", { exact: true }).fill("°C");
  await page
    .getByRole("button", { name: "Save centerline", exact: true })
    .click();
  await page.getByText("Centerline settings saved.", { exact: true }).waitFor();
  const ui = await db.centerline.findFirst({
    where: { title: prefix + " browser setup" },
  });
  profiles.push(ui.id);
  const row = page.getByRole("row").filter({ hasText: ui.title });
  await row
    .getByRole("button", { name: "Audit centerline", exact: true })
    .click();
  await page
    .getByLabel("Actual reading · Temperature", { exact: true })
    .fill("56");
  await page
    .getByText("Out of limits — follow up required", { exact: true })
    .waitFor();
  await page
    .getByLabel("Comment / action taken · Temperature", { exact: true })
    .fill("Temperature high; escalated to manager");
  await page
    .getByRole("button", { name: "↻ Refresh history", exact: true })
    .click();
  assert.equal(
    await page
      .getByLabel("Actual reading · Temperature", { exact: true })
      .inputValue(),
    "56",
  );
  await fs.mkdir("docs/screenshots/centerlines", { recursive: true });
  await page
    .getByRole("heading", { name: "Audit: " + ui.title, exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: "docs/screenshots/centerlines/audit.png" });
  await page
    .getByRole("button", { name: "Save centerline audit", exact: true })
    .click();
  await page.getByText("Centerline audit saved.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await page
    .getByRole("heading", { name: "Centerlines at a glance", exact: true })
    .waitFor();
  await page.screenshot({ path: "docs/screenshots/centerlines/dashboard.png" });
  await page
    .getByRole("button", { name: "Open in detail", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Machine centerlines", exact: true })
    .waitFor();
  await row.getByRole("button", { name: "Edit settings", exact: true }).click();
  await page
    .getByRole("heading", { name: "Edit centerline", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: "docs/screenshots/centerlines/settings.png" });
  await page
    .getByRole("button", { name: "Cancel settings", exact: true })
    .click();
  // Required evidence and media scope (manager reads permitted evidence, other department cannot).
  const png = await require("sharp")({
    create: { width: 16, height: 16, channels: 3, background: "#ee6600" },
  })
    .png()
    .toBuffer();
  const photoResponse = await operator.request.post(origin + "/api/photos", {
    headers: { Origin: origin },
    data: { image: "data:image/png;base64," + png.toString("base64") },
  });
  assert.equal(photoResponse.status(), 200);
  const photoData = await photoResponse.json();
  photo = photoData.id;
  assert.equal(
    (
      await api(manager, {
        ...input,
        id: c.id,
        version: 2,
        parameters: [{ ...parameter, photo: true }, text],
      })
    ).status,
    200,
  );
  const evidenceAudit = { ...audit, version: 3, submissionId: randomUUID() };
  assert.equal((await api(operator, evidenceAudit)).status, 400);
  evidenceAudit.responses = [
    {
      ...audit.responses[0],
      media: [{ id: photo, kind: "photo", caption: "Machine reading" }],
    },
    audit.responses[1],
  ];
  assert.equal((await api(operator, evidenceAudit)).status, 200);
  assert.equal(
    (await manager.request.get(origin + "/api/photos/" + photo)).status(),
    200,
  );
  assert.equal(
    (await other.request.get(origin + "/api/photos/" + photo)).status(),
    403,
  );
  assert.equal(
    (await api(other, { action: "retire", id: c.id, version: 3 })).status,
    403,
  );
  assert.equal(
    (await api(manager, { action: "retire", id: c.id, version: 3 })).status,
    200,
  );
  assert.equal(
    (await api(operator, { ...evidenceAudit, submissionId: randomUUID() }))
      .status,
    409,
  );
  assert.equal(
    (await api(manager, { ...input, id: c.id, version: 4 })).status,
    409,
  );
  const after = await (
    await manager.request.get(origin + "/api/centerlines")
  ).json();
  assert(after.records.some((r) => r.id === audit.submissionId));
  assert.equal((await api(operator, evidenceAudit)).status, 200);
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.reload();
  await page
    .getByRole("button", { name: "≋ Centerlines", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Machine centerlines", exact: true })
    .waitFor();
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: "docs/screenshots/centerlines/tablet.png" });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: centerline definitions, delegated editing, department isolation, numeric/text limits, required evidence, immutable revisions, stale writes, retry deduplication, filters/suggestions, scoped Excel/media, retirement, audit form, dashboard, refresh-preserved drafts and tablet layout.",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await browser?.close();
    await db.record.deleteMany({
      where: { kind: "centerline", userId: { in: users.map((x) => x.id) } },
    });
    await db.centerline.deleteMany({
      where: { createdBy: { in: users.map((x) => x.id) } },
    });
    if (photo) {
      await db.photo.deleteMany({ where: { id: photo } });
      await fs.rm("uploads/" + photo + ".webp", { force: true });
    }
    await db.session.deleteMany({
      where: { userId: { in: users.map((x) => x.id) } },
    });
    await db.user.deleteMany({ where: { id: { in: users.map((x) => x.id) } } });
    await db.equipment.deleteMany({
      where: { id: { in: equipment.map((x) => x.id) } },
    });
    await db.$disconnect();
  });
