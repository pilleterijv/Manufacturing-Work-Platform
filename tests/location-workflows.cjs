require("tsx/cjs");
require("dotenv").config({ quiet: true });
const assert = require("node:assert/strict"),
  { randomUUID } = require("node:crypto"),
  fs = require("node:fs/promises"),
  { spawnSync } = require("node:child_process"),
  { chromium } = require("playwright");
const { db } = require("../lib/db.ts"),
  { hashPassword } = require("../lib/security.ts");
const origin = process.env.APP_URL || "http://localhost:3000",
  prefix = "Scope-" + randomUUID().slice(0, 8),
  users = [],
  eqs = [],
  contexts = [],
  photos = [],
  videos = [];
let browser, reason;
const check = async (r, status = 200) => {
  assert.equal(r.status(), status, await r.text());
  return r.json();
};
const post = (c, path, data) =>
  c.request.post(origin + path, { headers: { Origin: origin }, data });
const get = (c, path) => c.request.get(origin + path);
async function main() {
  assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
  const password = "Scope " + randomUUID() + "!",
    hash = await hashPassword(password);
  for (const [role, name] of [
    ["Admin", "Jordan Scope"],
    ["Manager", "Morgan A"],
    ["Manager", "Morgan B"],
    ["DL/TL", "Taylor A"],
    ["DL/TL", "Taylor Other"],
    ["Operator", "Alex A"],
    ["Operator", "Unassigned"],
  ]) {
    users.push(
      await db.user.create({
        data: {
          username: prefix.toLowerCase() + "-" + users.length,
          name,
          role,
          password: hash,
          mustChange: false,
        },
      }),
    );
  }
  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  async function login(u) {
    const c = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: "block",
    });
    await check(
      await post(c, "/api/account", {
        action: "login",
        username: u.username,
        password,
        remember: false,
      }),
    );
    contexts.push(c);
    return c;
  }
  const admin = await login(users[0]);
  for (const [department, area] of [
    ["A", "Pack"],
    ["A", "Mix"],
    ["B", "Pack"],
  ]) {
    await check(
      await post(admin, "/api/platform", {
        action: "location",
        plant: prefix,
        department,
        area,
        line: "",
      }),
    );
    await check(
      await post(admin, "/api/platform", {
        action: "equipment",
        name: "Filler 01",
        plant: prefix,
        department,
        area,
        line: "",
      }),
    );
    eqs.push(
      await db.equipment.findFirstOrThrow({
        where: { plant: prefix, department, area },
      }),
    );
  }
  await check(
    await post(admin, "/api/platform", {
      action: "location",
      plant: " " + prefix.toLowerCase() + " ",
      department: "a",
      area: "pack",
      line: "",
    }),
    409,
  );
  await check(
    await post(admin, "/api/platform", {
      action: "equipment",
      name: "Typo machine",
      plant: prefix,
      department: "Aa",
      area: "Pack",
      line: "",
    }),
    400,
  );
  for (const [index, locations] of [
    [1, [{ plant: prefix, department: "A", area: null }]],
    [2, [{ plant: prefix, department: "B", area: null }]],
    [
      3,
      [
        { plant: prefix, department: "A", area: "Pack" },
        { plant: prefix, department: "A", area: "Mix" },
      ],
    ],
    [4, [{ plant: prefix, department: "A", area: "Pack" }]],
    [5, [{ plant: prefix, department: "A", area: "Pack" }]],
  ])
    await check(
      await post(admin, "/api/platform", {
        action: "workspaceAccess",
        id: users[index].id,
        access: { mode: "restricted", locations, equipmentIds: [] },
      }),
    );
  const manager = await login(users[1]),
    other = await login(users[2]),
    tl = await login(users[3]),
    otherTl = await login(users[4]),
    op = await login(users[5]),
    none = await login(users[6]);
  let data = await check(await get(manager, "/api/platform?view=manage"));
  assert.deepEqual(
    data.equipment.map((e) => e.id).sort(),
    eqs
      .slice(0, 2)
      .map((e) => e.id)
      .sort(),
  );
  assert.equal(
    (await check(await get(none, "/api/platform?view=work"))).equipment.length,
    0,
  );
  await check(
    await post(manager, "/api/platform", {
      action: "workspaceAccess",
      id: users[1].id,
      access: { mode: "all", locations: [], equipmentIds: [] },
    }),
    403,
  );
  const scheduleDirectory = await check(
    await get(manager, "/api/shift-schedules"),
  );
  for (const person of scheduleDirectory.people)
    assert.deepEqual(Object.keys(person).sort(), [
      "hasEmail",
      "id",
      "name",
      "role",
    ]);
  const runFamily = randomUUID(),
    auditFamily = randomUUID();
  const standard = {
    action: "standard",
    family: runFamily,
    title: prefix + " operator work",
    equipmentId: eqs[0].id,
    target: 30,
    tolerance: 10,
    steps: [{ id: "check", text: "Verify safe condition", photo: false }],
  };
  await check(await post(manager, "/api/platform", standard));
  await check(
    await post(manager, "/api/platform", {
      ...standard,
      family: randomUUID(),
      equipmentId: eqs[2].id,
    }),
    403,
  );
  await check(
    await post(manager, "/api/platform", {
      ...standard,
      family: auditFamily,
      title: prefix + " leader work",
      kind: "audit",
      assigneeIds: [users[3].id],
    }),
  );
  const run = await db.standard.findFirstOrThrow({
      where: { family: runFamily },
    }),
    audit = await db.standard.findFirstOrThrow({
      where: { family: auditFamily },
    });
  assert(
    (await check(await get(tl, "/api/platform?view=audits"))).standards.some(
      (s) => s.id === audit.id,
    ),
  );
  assert(
    !(
      await check(await get(otherTl, "/api/platform?view=audits"))
    ).standards.some((s) => s.id === audit.id),
  );
  const completion = {
    action: "audit",
    standardId: audit.id,
    started: new Date().toISOString(),
    responses: [
      { stepId: "check", answer: true, photo: null, comment: "Verified" },
    ],
  };
  await check(await post(otherTl, "/api/platform", completion), 403);
  await check(await post(tl, "/api/platform", completion));
  await check(
    await post(other, "/api/platform", {
      ...completion,
      action: "run",
      standardId: run.id,
    }),
    403,
  );
  await check(
    await post(op, "/api/platform", {
      ...completion,
      action: "run",
      standardId: run.id,
    }),
  );
  await check(
    await post(other, "/api/platform", {
      action: "study",
      title: prefix,
      equipmentId: eqs[0].id,
      cycles: [{ element: "x", seconds: 1, at: new Date().toISOString() }],
    }),
    403,
  );
  // Reporter, owner, reviewer and individual action owners must share the equipment assignment.
  const problem = {
    action: "create",
    method: "2D",
    title: prefix + " issue",
    equipmentId: eqs[0].id,
    occurredOn: "2026-11-07",
    reportedBy: users[5].name,
    ownerId: users[3].id,
    reviewerId: users[1].id,
    team: "Pilot",
    dueDate: "2026-12-01",
    previousId: null,
    answers: { problem: "Seal issue" },
    requirements: {
      fields: ["problem"],
      requireAction: true,
      actionTypes: ["Containment", "Corrective", "Preventive"],
    },
  };
  await check(
    await post(manager, "/api/problems", {
      ...problem,
      reviewerId: users[2].id,
    }),
    400,
  );
  const created = await check(await post(manager, "/api/problems", problem));
  await check(await get(other, "/api/problems?id=" + created.id), 403);
  assert.equal(
    (await check(await get(other, "/api/problems"))).items.some(
      (p) => p.id === created.id,
    ),
    false,
  );
  let r = await db.problem.findUniqueOrThrow({ where: { id: created.id } });
  for (const type of ["Containment", "Corrective", "Preventive"]) {
    await check(
      await post(manager, "/api/problems", {
        action: "addAction",
        id: r.id,
        version: r.version,
        type,
        title: type + " seal action",
        ownerId: users[3].id,
        dueDate: "2026-12-01",
        required: true,
      }),
    );
    r = await db.problem.findUniqueOrThrow({ where: { id: r.id } });
  }
  const actions = await db.problemAction.findMany({
    where: { problemId: r.id },
  });
  for (const a of actions)
    await check(
      await post(tl, "/api/problems", {
        action: "updateAction",
        id: r.id,
        actionId: a.id,
        version: a.version,
        status: "Completed",
        comment: "Verified on equipment",
      }),
    );
  await check(
    await post(manager, "/api/problems", {
      action: "addAction",
      id: r.id,
      version: r.version,
      type: "Correction",
      title: "Optional improvement",
      ownerId: users[3].id,
      dueDate: "2026-12-01",
      required: true,
    }),
  );
  const optional = await db.problemAction.findFirstOrThrow({
    where: { problemId: r.id, type: "Correction" },
  });
  r = await db.problem.findUniqueOrThrow({ where: { id: r.id } });
  await check(
    await post(manager, "/api/problems", {
      ...problem,
      action: "update",
      id: r.id,
      version: r.version,
      status: "Closed",
    }),
    400,
  );
  await check(
    await post(manager, "/api/problems", {
      action: "editAction",
      id: r.id,
      actionId: optional.id,
      version: optional.version,
      type: "Preventive",
      title: "Optional follow-up",
      ownerId: users[5].id,
      dueDate: "2026-12-02",
      required: false,
    }),
  );
  r = await db.problem.findUniqueOrThrow({ where: { id: r.id } });
  await check(
    await post(manager, "/api/problems", {
      ...problem,
      action: "update",
      id: r.id,
      version: r.version,
      status: "Closed",
    }),
  );
  const fourInput = {
    ...problem,
    method: "4D",
    title: prefix + " recurring issue",
    requirements: {
      fields: ["problem"],
      requireAction: false,
      actionTypes: [],
    },
  };
  const four = await check(await post(manager, "/api/problems", fourInput));
  let fourRecord = await db.problem.findUniqueOrThrow({
    where: { id: four.id },
  });
  await check(
    await post(manager, "/api/problems", {
      action: "addAction",
      id: four.id,
      version: fourRecord.version,
      type: "Corrective",
      title: "Revise setup",
      ownerId: users[3].id,
      dueDate: "2026-12-01",
      required: true,
    }),
  );
  const fourAction = await db.problemAction.findFirstOrThrow({
    where: { problemId: four.id },
  });
  await check(
    await post(manager, "/api/problems", {
      action: "editAction",
      id: four.id,
      actionId: fourAction.id,
      version: fourAction.version,
      type: "Preventive",
      title: "Optional prevention improvement",
      ownerId: users[1].id,
      dueDate: "2026-12-02",
      required: false,
    }),
  );
  fourRecord = await db.problem.findUniqueOrThrow({ where: { id: four.id } });
  await check(
    await post(manager, "/api/problems", {
      ...fourInput,
      action: "update",
      id: four.id,
      version: fourRecord.version,
      status: "Closed",
    }),
  );
  // Scope also applies to guides, private evidence, video range requests and exports.
  const image = await require("sharp")({
    create: { width: 40, height: 40, channels: 3, background: "#147264" },
  })
    .png()
    .toBuffer();
  const photo = await check(
    await post(manager, "/api/photos", {
      image: "data:image/png;base64," + image.toString("base64"),
    }),
  );
  photos.push(photo.id);
  const videoPath = "/tmp/" + prefix + ".mp4";
  const ff = spawnSync("ffmpeg", [
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=green:s=64x64:d=1",
    "-an",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    videoPath,
  ]);
  assert.equal(ff.status, 0);
  const videoBytes = await fs.readFile(videoPath);
  await fs.unlink(videoPath);
  const video = await check(
    await post(manager, "/api/guide-media", {
      video: "data:video/mp4;base64," + videoBytes.toString("base64"),
    }),
  );
  videos.push(video.id);
  await check(
    await post(manager, "/api/guide-media", {
      video:
        "data:video/mp4;base64," +
        Buffer.from("<html>bad</html>").toString("base64"),
    }),
    400,
  );
  await check(
    await post(manager, "/api/platform", {
      action: "guide",
      title: prefix + " visual guide",
      equipmentId: eqs[0].id,
      body: "Issue: seal shifted. Fix: align to marks.",
      media: [
        { id: photo.id, kind: "photo", caption: "Issue" },
        { id: video.id, kind: "video", caption: "Fix" },
      ],
    }),
  );
  const guide = await db.content.findFirstOrThrow({
    where: { title: prefix + " visual guide" },
  });
  assert.equal((await get(op, "/api/photos/" + photo.id)).status(), 200);
  assert.equal((await get(other, "/api/photos/" + photo.id)).status(), 403);
  assert.equal(
    (await get(other, "/api/guide-media/" + video.id)).status(),
    403,
  );
  const partial = await op.request.get(
    origin + "/api/guide-media/" + video.id,
    { headers: { Range: "bytes=0-15" } },
  );
  assert.equal(partial.status(), 206);
  assert.equal((await partial.body()).length, 16);
  await check(
    await post(other, "/api/platform", {
      action: "guide",
      id: guide.id,
      title: "Stolen",
      equipmentId: eqs[2].id,
      body: "x",
      media: [],
    }),
    403,
  );
  const report = await check(await get(other, "/api/leadership?department=A"));
  assert.equal(report.summary.equipment, 0);
  assert.equal(report.summary.runs, 0);
  assert.equal(report.summary.openProblems, 0);
  const ownReport = await check(await get(manager, "/api/leadership"));
  assert.equal(ownReport.summary.equipment, 2);
  assert(ownReport.summary.runs >= 1);
  const exportResponse = await get(other, "/api/export");
  assert.equal(exportResponse.status(), 200);
  const workbook = new (require("exceljs").Workbook)();
  await workbook.xlsx.load(await exportResponse.body());
  assert.equal(workbook.getWorksheet("Standard work").rowCount, 1);
  const ownExport = await get(manager, "/api/export");
  assert.equal(ownExport.status(), 200);
  const ownWorkbook = new (require("exceljs").Workbook)();
  await ownWorkbook.xlsx.load(await ownExport.body());
  const workSheet = ownWorkbook.getWorksheet("Standard work"),
    header = workSheet.getRow(1).values;
  assert.equal(
    workSheet.getRow(2).getCell(header.indexOf("Department")).value,
    "A",
  );
  assert.equal(
    workSheet.getRow(2).getCell(header.indexOf("Equipment ID")).value,
    eqs[0].id,
  );
  const problemExport = await get(other, "/api/problems?format=xlsx");
  assert.equal(problemExport.status(), 200);
  const problemBook = new (require("exceljs").Workbook)();
  await problemBook.xlsx.load(await problemExport.body());
  assert.equal(problemBook.getWorksheet("Problem solving").rowCount, 1);
  reason = await db.downtimeReason.create({
    data: { name: prefix + " planned" },
  });
  await check(
    await post(other, "/api/operations", {
      action: "start",
      equipmentId: eqs[0].id,
      reasonId: reason.id,
    }),
    403,
  );
  await check(
    await post(manager, "/api/operations", {
      action: "idea",
      title: "No access",
      equipmentId: eqs[2].id,
      currentState: "x",
      proposal: "y",
      process: "",
      dueDate: "2026-12-01",
      submitterId: users[1].id,
      pilotId: users[1].id,
      validatorId: users[1].id,
      participantIds: [],
    }),
    403,
  );
  // Actual browser forms: controlled location selectors, multi-area assignments, DL/TL task, editable photo canvas.
  const errors = [],
    page = await admin.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin);
  await page.getByRole("button", { name: "♙ Accounts", exact: true }).click();
  await page
    .getByRole("heading", { name: "Departments, areas and lines" })
    .waitFor();
  await page.getByLabel("Account", { exact: true }).selectOption(users[3].id);
  await page
    .getByRole("heading", {
      name: "Department and area assignments · " + users[3].name,
    })
    .waitFor();
  await fs.mkdir("docs/screenshots/location-tasks", { recursive: true });
  await page.screenshot({
    path: "docs/screenshots/location-tasks/department-assignments.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "⊞ Manage", exact: true }).click();
  await page
    .getByRole("heading", { name: "Add equipment", exact: true })
    .waitFor();
  assert(await page.locator("select[name=department]").count());
  await page.screenshot({
    path: "docs/screenshots/location-tasks/location-dropdowns.png",
    fullPage: true,
  });
  const tp = await tl.newPage();
  await tp.goto(origin);
  await tp
    .getByRole("button", { name: "◉ Standard work audits", exact: true })
    .click();
  await tp.getByLabel("Standard work", { exact: true }).selectOption(audit.id);
  await tp.screenshot({
    path: "docs/screenshots/location-tasks/dl-tl-tasks.png",
    fullPage: true,
  });
  const mp = await manager.newPage();
  mp.on("pageerror", (e) => errors.push(e.message));
  await mp.goto(origin);
  await mp
    .getByRole("button", { name: "◇ Troubleshooting", exact: true })
    .click();
  await mp
    .getByRole("button", { name: "Edit guide and media" })
    .filter({ hasText: "Edit guide" })
    .first()
    .click();
  // Choose this synthetic guide if other resources exist.
  const article = mp.locator("article").filter({
    has: mp.getByRole("heading", { name: guide.title, exact: true }),
  });
  await article.getByRole("button", { name: "Edit guide and media" }).click();
  await mp.getByRole("button", { name: "Edit photo", exact: true }).click();
  await mp.getByRole("heading", { name: "Edit photo", exact: true }).waitFor();
  await mp.getByRole("button", { name: "Rotate", exact: true }).click();
  await mp.screenshot({
    path: "docs/screenshots/location-tasks/photo-editor.png",
    fullPage: true,
  });
  await mp
    .getByRole("button", { name: "Save edited photo", exact: true })
    .click();
  await mp
    .getByRole("button", { name: "Save guide changes", exact: true })
    .click();
  await mp.getByRole("status").waitFor();
  const edited = await db.content.findUniqueOrThrow({
    where: { id: guide.id },
  });
  assert.notEqual(edited.media[0].id, photo.id);
  photos.push(edited.media[0].id);
  await mp.screenshot({
    path: "docs/screenshots/location-tasks/visual-guide.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  await mp
    .getByRole("button", { name: "◈ Problem solving", exact: true })
    .click();
  await mp
    .getByRole("combobox", { name: "Search problem solving", exact: true })
    .fill(prefix + " recurring issue");
  await mp.getByRole("button", { name: "Apply filters", exact: true }).click();
  await mp
    .getByRole("row")
    .filter({ hasText: prefix + " recurring issue" })
    .getByRole("button", { name: "View / update", exact: true })
    .click();
  await mp.getByText("Closure requirements", { exact: true }).waitFor();
  await mp.screenshot({
    path: "docs/screenshots/location-tasks/problem-action-requirements.png",
    fullPage: true,
  });
  // Assignment revocation invalidates existing sessions and access is gone after login.
  await check(
    await post(admin, "/api/platform", {
      action: "workspaceAccess",
      id: users[1].id,
      access: { mode: "restricted", locations: [], equipmentIds: [] },
    }),
  );
  assert.equal((await get(manager, "/api/platform")).status(), 401);
  const revoked = await login(users[1]);
  assert.equal(
    (await check(await get(revoked, "/api/platform?view=manage"))).equipment
      .length,
    0,
  );
  await check(await get(revoked, "/api/problems?id=" + created.id), 403);
  assert.equal(
    (await get(revoked, "/api/photos/" + photos.at(-1))).status(),
    403,
  );
  assert.equal(
    (await get(revoked, "/api/guide-media/" + video.id)).status(),
    403,
  );
  console.log(
    "PASS: catalog dropdowns; department/area isolation and defaults; manager/DL assignments; assigned DL/TL tasks; configurable 2D action requirements and edits; protected device media, photo markup and video ranges; scoped reports, exports and revocation.",
  );
}
async function cleanup() {
  if (browser) await browser.close();
  const ids = users.map((u) => u.id),
    equipmentIds = eqs.map((e) => e.id);
  const problems = await db.problem.findMany({
    where: { createdBy: { in: ids } },
    select: { id: true },
  });
  await db.problemAction.deleteMany({
    where: { problemId: { in: problems.map((p) => p.id) } },
  });
  await db.problem.deleteMany({ where: { createdBy: { in: ids } } });
  await db.record.deleteMany({ where: { userId: { in: ids } } });
  await db.content.deleteMany({ where: { equipmentId: { in: equipmentIds } } });
  await db.standard.deleteMany({
    where: { equipmentId: { in: equipmentIds } },
  });
  await db.downtime.deleteMany({
    where: { equipmentId: { in: equipmentIds } },
  });
  await db.equipment.deleteMany({ where: { id: { in: equipmentIds } } });
  await db.location.deleteMany({ where: { plant: prefix } });
  await db.photo.deleteMany({ where: { userId: { in: ids } } });
  await db.guideMedia.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  if (reason) await db.downtimeReason.delete({ where: { id: reason.id } });
  for (const id of photos)
    await fs.unlink("uploads/" + id + ".webp").catch(() => {});
  for (const id of videos)
    await fs.unlink("uploads/" + id + ".video").catch(() => {});
  await db.$disconnect();
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(cleanup);
