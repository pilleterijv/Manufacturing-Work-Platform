require("tsx/cjs");
require("dotenv").config({ quiet: true });
const { db } = require("../lib/db.ts"),
  { hashPassword } = require("../lib/security.ts"),
  { randomUUID } = require("node:crypto"),
  fs = require("node:fs"),
  zlib = require("node:zlib"),
  assert = require("node:assert/strict"),
  Excel = require("exceljs");
const origin = process.env.APP_URL || "http://localhost:3000",
  baseline = process.env.BASELINE_URL;
let user, equipment, standard;
const ids = { records: [], downtime: [], ideas: [] };
async function login(url, password) {
  const r = await fetch(url + "/api/account", {
    method: "POST",
    headers: { Origin: url, "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "login",
      username: user.username,
      password,
      remember: false,
    }),
  });
  assert.equal(r.status, 200);
  return r.headers
    .getSetCookie()
    .find((s) => s.startsWith("floorwork="))
    .split(";")[0];
}
async function sample(url, path, cookie) {
  const r = await fetch(url + path, { headers: { Cookie: cookie } });
  assert.equal(r.status, 200);
  const text = await r.text();
  return { bytes: Buffer.byteLength(text), data: JSON.parse(text) };
}
async function main() {
  assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
  if (baseline)
    assert(["localhost", "127.0.0.1"].includes(new URL(baseline).hostname));
  const password = `Benchmark ${randomUUID()}!`;
  user = await db.user.create({
    data: {
      username: "perf-" + randomUUID().slice(0, 8),
      name: "Performance fixture",
      password: await hashPassword(password),
      role: "Admin",
      mustChange: false,
    },
  });
  equipment = await db.equipment.create({
    data: {
      name: "Benchmark equipment",
      plant: "Test",
      department: "Performance fixture",
      area: "Test",
      line: "Test",
    },
  });
  standard = await db.standard.create({
    data: {
      title: "Benchmark check",
      family: randomUUID(),
      revision: 1,
      equipmentId: equipment.id,
      target: 45,
      tolerance: 10,
      steps: [{ id: "verify", text: "Verify setup", photo: false }],
    },
  });
  const snapshot = JSON.parse(JSON.stringify({ ...standard, equipment }));
  const reason = await db.downtimeReason.findFirst({ where: { active: true } }),
    config = (await db.setting.findUnique({ where: { key: "shifts" } })).value;
  for (let i = 0; i < 160; i++) {
    const id = randomUUID();
    ids.records.push(id);
  }
  await db.record.createMany({
    data: ids.records.map((id) => ({
      id,
      kind: "run",
      userId: user.id,
      standardId: standard.id,
      data: {
        snapshot,
        responses: [
          {
            stepId: "verify",
            answer: true,
            photo: null,
            comment: "Example observation. ".repeat(20),
          },
        ],
        durationSeconds: 30,
        followUp: false,
      },
    })),
  });
  for (let i = 0; i < 100; i++) {
    ids.downtime.push(randomUUID());
    ids.ideas.push(randomUUID());
  }
  await db.downtime.createMany({
    data: ids.downtime.map((id) => ({
      id,
      equipmentId: equipment.id,
      reasonId: reason.id,
      reasonName: reason.name,
      equipmentSnapshot: equipment,
      shiftConfig: config,
      startedAt: new Date(Date.now() - 7200000),
      endedAt: new Date(Date.now() - 3600000),
      startedBy: user.id,
      stoppedBy: user.id,
    })),
  });
  await db.idea.createMany({
    data: ids.ideas.map((id) => ({
      id,
      title: "Benchmark improvement",
      equipmentId: equipment.id,
      equipmentSnapshot: equipment,
      currentState: "Current process observation. ".repeat(10),
      proposal: "Proposed controlled improvement. ".repeat(15),
      dueDate: "2026-12-01",
      createdBy: user.id,
      submitterId: user.id,
      pilotId: user.id,
      validatorId: user.id,
    })),
  });
  const cookie = await login(origin, password);
  const page = await sample(origin, "/api/platform", cookie);
  assert.equal(page.data.records.length, 100);
  assert(page.data.page.hasMore);
  const next = await sample(
    origin,
    "/api/platform?view=records&cursor=" + page.data.page.cursor,
    cookie,
  );
  assert.equal(
    new Set([...page.data.records, ...next.data.records].map((r) => r.id)).size,
    160,
  );
  assert.equal(next.data.records.length, 60);
  assert(!next.data.page.hasMore);
  const overview = await sample(origin, "/api/platform?view=overview", cookie);
  assert.equal(overview.data.records.length, 8);
  assert.equal(overview.data.overview.runs, 160);
  const poll = await sample(origin, "/api/operations?view=summary", cookie),
    live = await sample(origin, "/api/operations?view=live", cookie);
  assert(
    !("ideas" in poll.data) &&
      !("people" in poll.data) &&
      !("downtime" in poll.data),
  );
  assert.equal(live.data.active.length, 0);
  const full = await sample(origin, "/api/operations", cookie);
  const exportResponse = await fetch(origin + "/api/export", {
    headers: { Cookie: cookie },
  });
  assert.equal(exportResponse.status, 200);
  const workbook = new Excel.Workbook();
  await workbook.xlsx.load(Buffer.from(await exportResponse.arrayBuffer()));
  assert.equal(workbook.getWorksheet("Standard work").rowCount, 161);
  assert.equal(workbook.getWorksheet("Downtime events").rowCount, 101);
  assert.equal(workbook.getWorksheet("Improvement ideas").rowCount, 101);
  const { chromium } = require("playwright");
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  try {
    const context = await browser.newContext();
    await context.addCookies([
      {
        name: "floorwork",
        value: cookie.split("=")[1],
        url: origin,
        httpOnly: true,
        sameSite: "Strict",
      },
    ]);
    const page = await context.newPage();
    await page.clock.install();
    await page.goto(origin);
    await page
      .getByRole("heading", { name: "Welcome, Performance.", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "☑ Standard work", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Load more history", exact: true })
      .click();
    await page.waitForFunction(
      () => document.querySelectorAll("tbody tr").length === 160,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Load more history", exact: true })
        .count(),
      0,
    );
    const summaryResponse = page.waitForResponse((r) =>
      r.url().includes("/api/operations?view=summary"),
    );
    await page.clock.fastForward(21000);
    assert.equal((await summaryResponse).status(), 200);
  } finally {
    await browser.close();
  }
  const html = await (await fetch(origin)).text();
  const scripts = [
    ...new Set(
      [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]),
    ),
  ];
  let raw = 0,
    gzip = 0;
  for (const src of scripts) {
    const bytes = Buffer.from(
      await (await fetch(new URL(src, origin))).arrayBuffer(),
    );
    raw += bytes.length;
    gzip += zlib.gzipSync(bytes).length;
  }
  const result = {
    loginJavaScriptFiles: scripts.length,
    loginJavaScriptRawBytes: raw,
    loginJavaScriptGzipBytes: gzip,
    fixture: { history: 160, downtime: 100, ideas: 100 },
    overviewBytes: overview.bytes,
    historyPageBytes: page.bytes,
    summaryPollBytes: poll.bytes,
    livePollBytes: live.bytes,
    fullOperationsBytes: full.bytes,
    streamedExportRows: { standardWork: 160, downtime: 100, ideas: 100 },
  };
  if (baseline) {
    const oldCookie = await login(baseline, password);
    result.baselineFullPollBytes = (
      await sample(baseline, "/api/operations", oldCookie)
    ).bytes;
    result.baselinePlatformBytes = (
      await sample(baseline, "/api/platform", oldCookie)
    ).bytes;
  }
  fs.mkdirSync(".measurements", { recursive: true });
  fs.writeFileSync(".measurements/after.json", JSON.stringify(result, null, 2));
  console.log(result);
  console.log(
    "PASS: bounded histories, exact overview totals, small polling payloads, and complete streamed exports across database page boundaries.",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.record.deleteMany({ where: { id: { in: ids.records } } });
    await db.downtime.deleteMany({ where: { id: { in: ids.downtime } } });
    await db.idea.deleteMany({ where: { id: { in: ids.ideas } } });
    if (standard) await db.standard.delete({ where: { id: standard.id } });
    if (equipment) await db.equipment.delete({ where: { id: equipment.id } });
    if (user) {
      await db.session.deleteMany({ where: { userId: user.id } });
      await db.user.delete({ where: { id: user.id } });
    }
    await db.$disconnect();
  });
