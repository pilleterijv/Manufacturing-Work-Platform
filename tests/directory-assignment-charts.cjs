const { expandTools } = require("./ui-workspace.cjs");
require("tsx/cjs");
require("dotenv").config({ quiet: true });
const assert = require("node:assert/strict"),
  { randomUUID } = require("node:crypto"),
  { chromium } = require("playwright"),
  { db } = require("../lib/db.ts"),
  { hashPassword } = require("../lib/security.ts"),
  {
    deliverAssignmentEmails,
    queueAssignments,
  } = require("../lib/assignment-notifications.ts"),
  fs = require("node:fs");
let browser;
async function main() {
  assert(
    /^floorwork_roles_[a-f0-9]{32}$/.test(
      new URL(process.env.DATABASE_URL).pathname.slice(1),
    ),
  );
  const origin = process.env.APP_URL,
    tag = randomUUID().slice(0, 8),
    password = "Assignment fixture " + randomUUID() + "!",
    hash = await hashPassword(password);
  const e = await db.equipment.create({
    data: {
      name: "Press " + tag,
      plant: "Chart " + tag,
      department: "Tableting",
      area: "Compressing",
      line: "",
    },
  });
  const access = { mode: "restricted", locations: [], equipmentIds: [e.id] };
  const admin = await db.user.create({
    data: {
      username: "admin-" + tag,
      name: "Chart Administrator",
      role: "Admin",
      password: hash,
      mustChange: false,
    },
  });
  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const c = await browser.newContext({ serviceWorkers: "block" });
  async function post(path, body, status = 200) {
    const r = await c.request.post(origin + path, {
      headers: { Origin: origin },
      data: body,
    });
    assert.equal(r.status(), status, await r.text());
    return r.json();
  }
  await post("/api/account", {
    action: "login",
    username: admin.username,
    password,
    remember: false,
  });
  const people = [];
  for (const [first, last] of [
    ["Mary Ann", "van der Meer"],
    ["Jordan", "Lee"],
  ]) {
    const username = "person-" + tag + people.length;
    await post("/api/platform", {
      action: "user",
      username,
      firstName: first,
      lastName: last,
      email: username + "@example.invalid",
      role: "Operator",
      active: true,
      password,
    });
    const p = await db.user.findUniqueOrThrow({ where: { username } });
    assert.equal(p.firstName, first);
    assert.equal(p.lastName, last);
    assert.equal(p.name, first + " " + last);
    await db.user.update({
      where: { id: p.id },
      data: { mustChange: false, workspaceAccess: access },
    });
    people.push(p);
  }
  await post(
    "/api/platform",
    {
      action: "user",
      username: "bad-" + tag,
      firstName: "Missing",
      lastName: "",
      email: "bad@example.invalid",
      role: "Operator",
      active: true,
      password,
    },
    400,
  );
  await post("/api/access-requests", {
    action: "register",
    username: "request-" + tag,
    firstName: "Alex",
    lastName: "Garcia",
    email: "request-" + tag + "@example.invalid",
    department: "Tableting",
    reason: "Pilot",
  });
  const request = await db.registrationRequest.findFirstOrThrow({
    where: { username: "request-" + tag },
  });
  assert.equal(request.firstName, "Alex");
  assert.equal(request.lastName, "Garcia");
  const found = await (
    await c.request.get(
      origin + "/api/people?search=" + encodeURIComponent("van der Meer"),
    )
  ).json();
  assert(found.people.some((p) => p.id === people[0].id));
  assert(!("email" in found.people[0]));
  const plan = {
    action: "save",
    kind: "cil",
    title: "Inspect seals " + tag,
    equipmentId: e.id,
    assigneeId: people[0].id,
    intervalDays: 7,
    nextDue: "2026-12-01",
    active: true,
    steps: [{ id: "check", text: "Inspect seal", photo: false }],
  };
  await post("/api/maintenance", plan);
  const pm = await db.maintenancePlan.findFirstOrThrow({
    where: { title: plan.title },
  });
  assert.equal(
    await db.assignmentDelivery.count({ where: { entityId: pm.id } }),
    1,
  );
  await post("/api/maintenance", {
    ...plan,
    id: pm.id,
    version: 1,
    assigneeId: people[1].id,
  });
  // Current email is resolved now, not copied into the assignment row.
  await db.user.update({
    where: { id: people[1].id },
    data: { email: "updated-" + tag + "@example.invalid" },
  });
  const mails = [];
  process.env.SMTP_FROM = "no-reply@example.invalid";
  const transport = {
    sendMail: async (m) => {
      mails.push(m);
      return { accepted: [m.to] };
    },
  };
  await deliverAssignmentEmails(transport);
  assert.equal(mails.length, 1);
  assert.equal(mails[0].to, "updated-" + tag + "@example.invalid");
  assert(mails[0].text.includes(plan.title));
  assert.equal(
    (
      await db.assignmentDelivery.findFirstOrThrow({
        where: { entityId: pm.id, userId: people[0].id },
      })
    ).status,
    "Cancelled",
  );
  await deliverAssignmentEmails(transport);
  assert.equal(mails.length, 1);
  const body = {
    action: "create",
    title: "Problem " + tag,
    method: "2D",
    equipmentId: e.id,
    occurredOn: "2026-11-19",
    reportedBy: "Fixture",
    ownerId: people[0].id,
    reviewerId: people[1].id,
    team: "",
    dueDate: "2026-12-01",
    previousId: null,
    answers: {},
    requestKey: randomUUID(),
  };
  const problem = await post("/api/problems", body);
  await post("/api/problems", body);
  assert.equal(
    await db.assignmentDelivery.count({ where: { entityId: problem.id } }),
    2,
  );
  await post("/api/problems", {
    action: "addAction",
    id: problem.id,
    version: 1,
    type: "Containment",
    title: "Contain issue " + tag,
    ownerId: people[0].id,
    dueDate: "2026-12-01",
    media: [],
  });
  const action = await db.problemAction.findFirstOrThrow({
    where: { problemId: problem.id },
  });
  assert.equal(
    await db.assignmentDelivery.count({ where: { entityId: action.id } }),
    1,
  );
  // Disabled recipients cannot receive queued messages.
  await db.user.update({
    where: { id: people[0].id },
    data: { active: false },
  });
  await deliverAssignmentEmails(transport);
  assert.equal(
    (
      await db.assignmentDelivery.findFirstOrThrow({
        where: { entityId: action.id },
      })
    ).status,
    "Cancelled",
  );
  // A deliberately missing email never becomes a Sent delivery; restoring it allows a later retry.
  await db.user.update({
    where: { id: people[0].id },
    data: { active: true, email: null },
  });
  await db.$transaction((tx) =>
    queueAssignments(tx, {
      type: "action",
      id: action.id,
      equipmentId: e.id,
      assignees: [people[0].id],
      revision: 2,
    }),
  );
  await deliverAssignmentEmails(transport);
  let retry = await db.assignmentDelivery.findFirstOrThrow({
    where: { entityId: action.id, status: "Pending" },
  });
  assert.equal(retry.attempts, 1);
  assert(retry.lastError);
  await db.user.update({
    where: { id: people[0].id },
    data: { email: "recovered-" + tag + "@example.invalid" },
  });
  await db.assignmentDelivery.update({
    where: { id: retry.id },
    data: { nextAttemptAt: new Date(0) },
  });
  await deliverAssignmentEmails(transport);
  assert.equal(
    (await db.assignmentDelivery.findUniqueOrThrow({ where: { id: retry.id } }))
      .status,
    "Sent",
  );
  const page = await c.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto(origin);
  await expandTools(page);
  await page
    .getByRole("button", { name: /TPM \/ CIL/ })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Dashboard", exact: true })
    .first()
    .click();
  const chart = page.getByRole("region", {
    name: "Status breakdown",
    exact: true,
  });
  await chart.waitFor();
  await chart.getByRole("combobox").selectOption("donut");
  await chart.getByRole("img").waitFor();
  fs.mkdirSync("docs/screenshots/directory-assignment-charts", {
    recursive: true,
  });
  await chart.screenshot({
    path: "docs/screenshots/directory-assignment-charts/chart.png",
  });
  await chart.getByRole("combobox").selectOption("table");
  assert(await chart.getByRole("table").isVisible());
  await page
    .getByRole("button", { name: /Accounts/, exact: false })
    .first()
    .click();
  await page.getByLabel("First name", { exact: true }).waitFor();
  await page.screenshot({
    path: "docs/screenshots/directory-assignment-charts/account.png",
    fullPage: false,
  });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: structured account/request identity, scoped name search, assignment queue, current-email lookup, reassignment cancellation, idempotency, disabled recipient, missing-email retry, charts/table and tablet layout. Synthetic transport only; no email sent externally.",
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
