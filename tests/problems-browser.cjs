require("tsx/cjs");
require("dotenv").config({ quiet: true });
const { randomUUID } = require("node:crypto"),
  assert = require("node:assert/strict"),
  { chromium } = require("playwright");
const { db } = require("../lib/db.ts"),
  { hashPassword } = require("../lib/security.ts"),
  { methodology } = require("../lib/problem-rules.ts");
const origin = process.env.APP_URL || "http://localhost:3000",
  users = [],
  records = [];
let browser, eq;
async function main() {
  assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
  const password = `Problems ${randomUUID()}!`,
    hash = await hashPassword(password),
    suffix = randomUUID().slice(0, 8);
  for (const [role, name] of [
    ["Admin", "Problem Admin"],
    ["Manager", "Problem Reviewer"],
    ["Operator", "Problem Operator"],
    ["Operator", "Other Operator"],
  ])
    users.push(
      await db.user.create({
        data: {
          username: `problem-${users.length}-${suffix}`,
          name,
          role,
          password: hash,
          mustChange: false,
        },
      }),
    );
  eq = await db.equipment.create({
    data: {
      name: "Problem test machine",
      plant: "Test",
      department: "Problem " + suffix,
      area: "Test",
      line: "Test",
    },
  });
  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const contexts = [];
  for (const u of users) {
    const c = await browser.newContext();
    const r = await c.request.post(origin + "/api/account", {
      headers: { Origin: origin },
      data: { action: "login", username: u.username, password },
    });
    assert.equal(r.status(), 200);
    contexts.push(c);
  }
  const [admin, reviewer, operator, other] = contexts;
  const post = async (c, b) => {
    const r = await c.request.post(origin + "/api/problems", {
      headers: { Origin: origin },
      data: b,
    });
    return { status: r.status(), body: await r.json() };
  };
  const get = async (c, path = "") => {
    const r = await c.request.get(origin + "/api/problems" + path);
    assert.equal(r.status(), 200, await r.text());
    return r.json();
  };
  const anon = await browser.newContext();
  assert.equal(
    (await anon.request.get(origin + "/api/problems")).status(),
    401,
  );
  const input = {
    title: "Recurring label misalignment",
    method: "2D",
    equipmentId: eq.id,
    occurredOn: "2026-11-06",
    reportedBy: users[2].name,
    ownerId: users[2].id,
    reviewerId: users[1].id,
    team: "Production and Quality",
    dueDate: "2026-11-07",
    previousId: null,
    answers: { problem: "Five labels misaligned in first-piece inspection" },
  };
  let r = await post(operator, { action: "create", ...input });
  assert.equal(r.status, 200, JSON.stringify(r));
  records.push(r.body.id);
  const id = r.body.id;
  let detail = await get(operator, "?id=" + id);
  assert.equal(
    (
      await post(other, {
        action: "update",
        ...input,
        id,
        version: detail.version,
        status: "In progress",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await post(operator, {
        action: "update",
        ...input,
        id,
        version: detail.version,
        status: "Closed",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await post(reviewer, {
        action: "update",
        ...input,
        id,
        version: detail.version,
        status: "Closed",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await post(operator, {
        action: "update",
        ...input,
        method: "8D",
        id,
        version: detail.version,
        status: "Open",
      })
    ).status,
    400,
  );
  r = await post(operator, {
    action: "addAction",
    id,
    version: detail.version,
    type: "Corrective",
    title: "Replace worn label guide",
    ownerId: users[2].id,
    dueDate: "2026-11-07",
  });
  assert.equal(r.status, 200);
  assert.equal(
    (
      await post(operator, {
        action: "addAction",
        id,
        version: detail.version,
        type: "Corrective",
        title: "Duplicate stale update",
        ownerId: users[2].id,
        dueDate: "2026-11-07",
      })
    ).status,
    409,
  );
  detail = await get(operator, "?id=" + id);
  let a = detail.actions[0];
  assert.equal(
    (
      await post(other, {
        action: "updateAction",
        id,
        actionId: a.id,
        version: a.version,
        status: "Completed",
        comment: "Unauthorized",
      })
    ).status,
    403,
  );
  r = await post(operator, {
    action: "updateAction",
    id,
    actionId: a.id,
    version: a.version,
    status: "Completed",
    comment: "Guide replaced; 30 first pieces passed",
  });
  assert.equal(r.status, 200);
  assert.equal(
    (
      await post(operator, {
        action: "updateAction",
        id,
        actionId: a.id,
        version: a.version,
        status: "Open",
        comment: "Stale",
      })
    ).status,
    409,
  );
  const queue = await get(
    operator,
    "?view=queue&department=" + encodeURIComponent(eq.department),
  );
  assert.equal(queue.items.length, 0);
  const answers = Object.fromEntries(
    methodology["2D"].sections.flatMap((s) =>
      s.fields.map(([key]) => [key, "Verified test evidence"]),
    ),
  );
  r = await post(reviewer, {
    action: "update",
    ...input,
    answers,
    id,
    version: detail.version,
    status: "Closed",
  });
  assert.equal(r.status, 200, JSON.stringify(r));
  detail = await get(reviewer, "?id=" + id);
  assert(detail.closedAt);
  assert(detail.actions[0].completedAt);
  assert.equal(detail.actions[0].history.length, 2);
  assert.equal(
    (
      await post(operator, {
        action: "addAction",
        id,
        version: detail.version,
        type: "Corrective",
        title: "Closed record edit",
        ownerId: users[2].id,
        dueDate: "2026-11-07",
      })
    ).status,
    409,
  );
  r = await post(operator, {
    action: "create",
    ...input,
    method: "4D",
    previousId: id,
  });
  assert.equal(r.status, 200);
  records.push(r.body.id);
  const summary = await get(
    admin,
    "?department=" + encodeURIComponent(eq.department),
  );
  assert.equal(summary.summary.closedActions, 1);
  assert.equal(summary.items.length, 2);
  const xlsx = await admin.request.get(
    origin +
      "/api/problems?format=xlsx&department=" +
      encodeURIComponent(eq.department),
  );
  assert.equal(xlsx.status(), 200);
  const Excel = require("exceljs"),
    book = new Excel.Workbook();
  await book.xlsx.load(await xlsx.body());
  assert.equal(book.getWorksheet("Problem solving").rowCount, 3);
  assert.equal(book.getWorksheet("Actions and checkpoints").rowCount, 2);
  const page = await operator.newPage();
  await page.goto(origin);
  await page
    .getByRole("button", { name: "Open Problem solving section", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Problem-solving records", exact: true })
    .waitFor();
  await page.getByLabel("Problem department").selectOption(eq.department);
  await page.getByText(input.title, { exact: true }).first().waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Open Accounts section", exact: true })
      .count(),
    0,
  );
  console.log(
    "Problem-solving integration passed: persistence, assigned roles, stale writes, closure, escalation, queue, Excel and dashboard navigation.",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    await db.problemAction.deleteMany({
      where: { problemId: { in: records } },
    });
    await db.problem.updateMany({
      where: { id: { in: records } },
      data: { previousId: null },
    });
    await db.problem.deleteMany({ where: { id: { in: records } } });
    if (eq) await db.equipment.delete({ where: { id: eq.id } });
    await db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
    await db.$disconnect();
  });
