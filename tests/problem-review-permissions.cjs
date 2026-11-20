require("tsx/cjs");
require("dotenv").config({ quiet: true });
const { db } = require("../lib/db.ts"),
  { hashPassword } = require("../lib/passwords.ts"),
  { defaultRequirements } = require("../lib/problem-rules.ts");
const { randomUUID } = require("node:crypto"),
  assert = require("node:assert/strict"),
  { chromium } = require("playwright"),
  fs = require("node:fs/promises");
const origin = process.env.APP_URL;
assert(/^floorwork_roles_[a-f0-9]{32}$/.test(new URL(process.env.DATABASE_URL).pathname.slice(1)));
let browser;
async function main() {
  const tag = randomUUID().slice(0, 8),
    password = "Review fixture " + randomUUID() + "!",
    hash = await hashPassword(password),
    users = [],
    contexts = [];
  for (const [key, role] of [
    ["admin", "Admin"],
    ["manager", "Manager"],
    ["owner", "Operator"],
    ["participant", "Operator"],
    ["action", "Operator"],
    ["reviewer", "DL/TL"],
    ["outside-leader", "DL/TL"],
    ["outside-operator", "Operator"],
  ])
    users.push(
      await db.user.create({
        data: {
          username: `review-${key}-${tag}`,
          name: `${key} ${tag}`,
          role,
          password: hash,
          mustChange: false,
          workspaceAccess: { mode: "all", locations: [], equipmentIds: [] },
        },
      })
    );
  const equipment = [];
  for (const name of ["Press A", "Press B"])
    equipment.push(
      await db.equipment.create({
        data: { name: `${name} ${tag}`, plant: tag, department: "Review", area: "Compressing", line: "" },
      })
    );
  browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
  for (const user of users) {
    const c = await browser.newContext({ serviceWorkers: "block" });
    const r = await c.request.post(origin + "/api/account", {
      headers: { Origin: origin },
      data: { action: "login", username: user.username, password, remember: false },
    });
    assert.equal(r.status(), 200);
    contexts.push(c);
  }
  const [admin, manager, owner, participant, actionOwner, reviewer, outsiderLeader, outsiderOperator] =
    contexts;
  async function post(c, body, status = 200) {
    const r = await c.request.post(origin + "/api/problems", { headers: { Origin: origin }, data: body });
    assert.equal(r.status(), status, await r.text());
    return status === 200 ? r.json() : null;
  }
  async function get(c, id) {
    const r = await c.request.get(origin + "/api/problems?id=" + id);
    assert.equal(r.status(), 200, await r.text());
    return r.json();
  }
  const input = {
    method: "2D",
    title: `Shared case ${tag}`,
    equipmentId: equipment[0].id,
    occurredOn: "2026-11-18",
    reportedBy: users[2].name,
    ownerId: users[2].id,
    reviewerId: users[5].id,
    participantIds: [users[3].id],
    team: users[1].name + " (typed name does not authorize editing)",
    dueDate: "2026-11-19",
    previousId: null,
    answers: { problem: "Repeated startup variation", rootCause: `Unique guide alignment ${tag}` },
  };
  const saved = await post(admin, { action: "create", ...input });
  let detail = await get(admin, saved.id);
  await post(admin, {
    action: "addAction",
    id: saved.id,
    version: detail.version,
    type: "Corrective",
    title: "Inspect alignment",
    ownerId: users[4].id,
    dueDate: "2026-11-19",
    required: true,
  });
  detail = await get(admin, saved.id);
  await post(admin, {
    action: "addAction",
    id: saved.id,
    version: detail.version,
    type: "Containment",
    title: "Check affected material",
    ownerId: users[2].id,
    dueDate: "2026-11-19",
    required: true,
  });
  for (const outsider of [manager, outsiderLeader, outsiderOperator]) {
    const r = await get(outsider, saved.id);
    assert.equal(r.permissions.editCase, false);
    assert.equal(r.permissions.requirements, false);
    await post(
      outsider,
      { action: "update", ...input, id: r.id, version: r.version, status: "In progress" },
      403
    );
    await post(
      outsider,
      {
        action: "addAction",
        id: r.id,
        version: r.version,
        type: "Corrective",
        title: "Unassigned edit",
        ownerId: users[2].id,
        dueDate: input.dueDate,
      },
      403
    );
    const a = r.actions[0];
    await post(
      outsider,
      {
        action: "updateAction",
        id: r.id,
        version: a.version,
        actionId: a.id,
        status: "Completed",
        comment: "Unassigned change",
      },
      403
    );
    await post(
      outsider,
      { action: "create", ...input, requirements: { fields: [], actionTypes: [], requireAction: false } },
      403
    );
  }
  for (const assigned of [owner, participant, reviewer]) {
    const r = await get(assigned, saved.id);
    assert.equal(r.permissions.editCase, true);
    assert.equal(r.permissions.requirements, false);
    await post(
      assigned,
      {
        action: "update",
        ...input,
        id: r.id,
        version: r.version,
        status: "In progress",
        requirements: { fields: [], actionTypes: [], requireAction: false },
      },
      403
    );
    const a = r.actions[0];
    await post(
      assigned,
      {
        action: "editAction",
        id: r.id,
        actionId: a.id,
        version: a.version,
        type: a.type,
        title: a.title,
        ownerId: a.ownerId,
        dueDate: a.dueDate,
        required: false,
      },
      403
    );
  }
  detail = await get(participant, saved.id);
  await post(participant, {
    action: "update",
    ...input,
    id: detail.id,
    version: detail.version,
    status: "In progress",
  });
  detail = await get(actionOwner, saved.id);
  const mine = detail.actions.find((a) => a.ownerId === users[4].id),
    other = detail.actions.find((a) => a.ownerId !== users[4].id);
  await post(actionOwner, {
    action: "updateAction",
    id: detail.id,
    actionId: mine.id,
    version: mine.version,
    status: "In progress",
    comment: "Checking reference position",
  });
  await post(
    actionOwner,
    {
      action: "updateAction",
      id: detail.id,
      actionId: other.id,
      version: other.version,
      status: "Completed",
      comment: "Not my action",
    },
    403
  );
  const personal = await (await participant.request.get(origin + "/api/work-queue?scope=my")).json();
  assert(
    JSON.stringify(personal).includes(saved.id),
    "Selected participants see their case in My assignments"
  );
  const assignedNotice = await (
    await participant.request.get(origin + "/api/operations?view=summary")
  ).json();
  assert(
    assignedNotice.notifications.some((n) => n.kind === "assignment"),
    "Selected participants receive assignment notifications"
  );
  // Completed historical case on another machine, with valid required evidence/actions.
  const answers = Object.fromEntries(
    defaultRequirements("4D").fields.map((key) => [key, "Fictional verified evidence"])
  );
  answers.problem = "Repeated startup variation";
  answers.rootCause = `Unique guide alignment ${tag}`;
  const past = await post(admin, {
    action: "create",
    ...input,
    method: "4D",
    title: `Closed case ${tag}`,
    equipmentId: equipment[1].id,
    answers,
  });
  let old = await get(admin, past.id);
  await post(admin, {
    action: "addAction",
    id: old.id,
    version: old.version,
    type: "Corrective",
    title: "Standardize guide",
    ownerId: users[2].id,
    dueDate: input.dueDate,
  });
  old = await get(admin, past.id);
  await post(admin, {
    action: "updateAction",
    id: old.id,
    actionId: old.actions[0].id,
    version: old.actions[0].version,
    status: "Completed",
    comment: "Verified with fictional evidence",
  });
  old = await get(admin, past.id);
  await post(admin, {
    action: "update",
    ...input,
    method: "4D",
    title: `Closed case ${tag}`,
    equipmentId: equipment[1].id,
    answers,
    id: old.id,
    version: old.version,
    status: "Closed",
  });
  let list = await (
    await manager.request.get(
      origin + "/api/problems?search=" + encodeURIComponent(`Unique guide alignment ${tag}`)
    )
  ).json();
  assert.equal(list.items.length, 2);
  list = await (
    await manager.request.get(
      origin + "/api/problems?machine=" + equipment[1].id + "&status=Closed&method=4D"
    )
  ).json();
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].id, past.id);
  await db.user.update({ where: { id: users[4].id }, data: { active: false } });
  const historical = await get(manager, saved.id);
  assert(
    historical.casePeople.some((p) => p.id === users[4].id && p.name === users[4].name && p.active === false),
    "Inactive assignee names remain readable in past cases"
  );
  // Department-scoped viewing remains separate from contribution permissions.
  await db.user.update({
    where: { id: users[7].id },
    data: { workspaceAccess: { mode: "restricted", locations: [], equipmentIds: [equipment[1].id] } },
  });
  assert.equal((await outsiderOperator.request.get(origin + "/api/problems?id=" + saved.id)).status(), 403);
  const page = await manager.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin);
  await page
    .locator("nav")
    .getByRole("button", { name: /Problem solving/ })
    .first()
    .click();
  const row = page.getByRole("row", { name: `View problem ${detail.reference}`, exact: true });
  await row.waitFor();
  await row.locator("td").nth(1).click();
  const report = page.getByRole("article", { name: "Problem-solving report" });
  await report.waitFor();
  assert.equal(await report.getByRole("button", { name: "Edit record", exact: true }).count(), 0);
  await report.getByText("Repeated startup variation", { exact: true }).waitFor();
  const dismiss = page.getByRole("button", { name: "Dismiss", exact: true });
  if (await dismiss.isVisible()) await dismiss.click();
  await fs.mkdir("docs/screenshots/problem-review", { recursive: true });
  await report.screenshot({ path: "docs/screenshots/problem-review/manager-report-desktop.png" });
  await page.setViewportSize({ width: 768, height: 1024 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
  await fs.mkdir("docs/screenshots/problem-review", { recursive: true });
  await report.screenshot({ path: "docs/screenshots/problem-review/manager-read-only.png" });
  await report.getByRole("button", { name: "Close report" }).click();
  await row.focus();
  await page.keyboard.press("Enter");
  await report.waitFor();
  await report.getByRole("button", { name: "Close report" }).click();
  await page
    .getByLabel("Find past problems or root causes", { exact: true })
    .fill(`Unique guide alignment ${tag}`);
  await page.getByRole("row", { name: `View problem ${old.reference}`, exact: true }).waitFor();
  // Dashboard rows also lead directly to the report.
  await page.locator("nav").getByRole("button", { name: "Problem solving dashboard", exact: true }).click();
  await page.getByRole("row", { name: `View problem ${input.title}`, exact: true }).click();
  await report.waitFor();
  assert.deepEqual(errors, []);
  // A participant gets an editor, but all requirement controls stay locked.
  const teamPage = await participant.newPage();
  await teamPage.goto(origin);
  await teamPage.getByRole("button", { name: "Sign out", exact: true }).waitFor();
  const more = teamPage.getByRole("button", { name: "More tools and history", exact: true });
  if (await more.isVisible()) await more.click();
  await teamPage
    .locator("nav")
    .getByRole("button", { name: /Problem solving/ })
    .first()
    .click();
  await teamPage.getByRole("row", { name: `View problem ${detail.reference}`, exact: true }).click();
  await teamPage.getByRole("button", { name: "Edit record", exact: true }).click();
  const closure = teamPage
    .locator("fieldset")
    .filter({ has: teamPage.locator("legend", { hasText: "Closure requirements" }) })
    .last();
  for (const control of await closure.locator("input").all())
    assert(await control.isDisabled(), "Non-admin closure settings must be disabled");
  await teamPage.screenshot({
    path: "docs/screenshots/problem-review/participant-editor.png",
    fullPage: false,
  });
  console.log(
    "PASS: managers can open read-only reports; case and dashboard row/keyboard navigation works; history searches causes across machines including closed cases; outsider roles cannot mutate; participants and action owners have explicit rights; only Admin can change required fields/actions; cross-scope IDs remain denied; tablet report renders without JS errors."
  );
}
main()
  .catch((e) => {
    console.error(e.stack || e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    await db.$disconnect();
  });
