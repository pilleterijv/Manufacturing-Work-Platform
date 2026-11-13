require("tsx/cjs");
require("dotenv").config({ quiet: true });
const { db } = require("../lib/db.ts"),
  { hashPassword } = require("../lib/security.ts"),
  { chromium } = require("playwright"),
  { randomUUID } = require("node:crypto"),
  { mkdir } = require("node:fs/promises"),
  assert = require("node:assert/strict");
const origin = process.env.APP_URL,
  suffix = randomUUID().slice(0, 8),
  users = [],
  roles = [],
  equipment = [];
let browser;
async function main() {
  assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
  const password = "Role fixture " + randomUUID() + "!",
    hash = await hashPassword(password);
  for (const department of ["Alpha", "Beta"])
    equipment.push(
      await db.equipment.create({
        data: {
          name: "Role press " + suffix + department,
          plant: "Role " + suffix,
          department,
          area: "Packing",
          line: "",
        },
      }),
    );
  for (const [n, role] of [
    "Admin",
    "Manager",
    "Operator",
    "Operator",
    "DL/TL",
  ].entries())
    users.push(
      await db.user.create({
        data: {
          username: "roles-" + suffix + "-" + n,
          name: "Role fixture " + n,
          role,
          password: hash,
          mustChange: false,
          workspaceAccess: {
            mode: "restricted",
            locations: [],
            equipmentIds: [equipment[n === 3 ? 1 : 0].id],
          },
        },
      }),
    );
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const contexts = [];
  async function request(c, path, body, status = 200) {
    const r = await c.request[body ? "post" : "get"](
      origin + path,
      body ? { headers: { Origin: origin }, data: body } : {},
    );
    assert.equal(r.status(), status, await r.text());
    return r.json();
  }
  async function login(i) {
    const c = await browser.newContext({
      serviceWorkers: "block",
      viewport: { width: 1280, height: 1000 },
    });
    contexts.push(c);
    await request(c, "/api/account", {
      action: "login",
      username: users[i].username,
      password,
      remember: false,
    });
    return c;
  }
  const admin = await login(0),
    manager = await login(1);
  const role = "PM technician " + suffix,
    managerRole = "Review manager " + suffix;
  const definition = {
    name: role,
    baseRole: "Operator",
    description: "Complete and maintain PMs in assigned areas",
    grants: ["work", "maintenance"],
    adminPrivileges: ["maintenance.manage"],
  };
  await request(manager, "/api/roles", null, 403);
  await request(
    manager,
    "/api/roles",
    { action: "create", ...definition },
    403,
  );
  await request(admin, "/api/roles", { action: "create", ...definition });
  roles.push(role);
  await request(admin, "/api/roles", { action: "create", ...definition }, 409);
  await request(
    admin,
    "/api/roles",
    { action: "create", ...definition, name: "ADMIN" },
    400,
  );
  await request(
    admin,
    "/api/roles",
    {
      action: "create",
      ...definition,
      name: "Global " + suffix,
      grants: ["permissions"],
    },
    400,
  );
  await request(
    admin,
    "/api/roles",
    {
      action: "create",
      ...definition,
      name: "Global " + suffix,
      baseRole: "Admin",
    },
    400,
  );
  await request(
    admin,
    "/api/roles",
    { action: "update", ...definition, role, version: 99 },
    409,
  );
  await request(
    admin,
    "/api/roles",
    { action: "update", ...definition, role, version: 1, baseRole: "Manager" },
    400,
  );
  async function assign(i, roleName, status = 200) {
    return request(
      admin,
      "/api/platform",
      {
        action: "user",
        id: users[i].id,
        username: users[i].username,
        name: users[i].name,
        email: "",
        role: roleName,
        active: true,
      },
      status,
    );
  }
  await assign(2, role);
  const stored = await db.user.findUnique({ where: { id: users[2].id } });
  assert.equal(stored.role, "Operator");
  assert.equal(stored.customRole, role);
  assert.deepEqual(stored.workspaceAccess, users[2].workspaceAccess);
  const tech = await login(2),
    account = (await request(tech, "/api/account")).user;
  assert.equal(account.customRole, role);
  assert.deepEqual([...account.grants].sort(), ["maintenance", "work"]);
  assert(account.adminPrivileges.includes("maintenance.manage"));
  assert(!account.grants.includes("manage"));
  await request(tech, "/api/roles", null, 403);
  await request(tech, "/api/account-management", null, 403);
  const visible = await request(tech, "/api/platform?view=equipment");
  assert(visible.equipment.some((e) => e.id === equipment[0].id));
  assert(!visible.equipment.some((e) => e.id === equipment[1].id));
  const plan = { action: "save", kind: "pm", title: "Role inspection " + suffix,
    equipmentId: equipment[0].id, assigneeId: users[2].id, intervalDays: 7,
    nextDue: "2027-01-01", active: true,
    steps: [{ id: "guard", text: "Inspect guard", photo: false }] };
  await request(tech, "/api/maintenance", plan);
  await request(tech, "/api/maintenance", { ...plan, equipmentId: equipment[1].id }, 403);
  await request(admin, "/api/roles", {
    action: "create",
    name: managerRole,
    baseRole: "Manager",
    description: "Review only",
    grants: ["dashboard"],
    adminPrivileges: [],
  });
  roles.push(managerRole);
  await assign(4, managerRole);
  const reviewer = await login(4);
  const reviewAccount = (await request(reviewer, "/api/account")).user;
  assert.equal(reviewAccount.role, "Manager");
  assert.deepEqual(reviewAccount.adminPrivileges, []);
  await request(reviewer, "/api/account-management", null, 403);
  await request(
    reviewer,
    "/api/account-management",
    { action: "active", id: users[3].id, active: false, version: 1 },
    403,
  );
  // Existing sessions immediately lose role privileges; individual additions remain explicit.
  await db.user.update({
    where: { id: users[2].id },
    data: { extraGrants: ["studies"] },
  });
  await request(admin, "/api/roles", {
    action: "update",
    ...definition,
    role,
    version: 1,
    grants: ["work"],
    adminPrivileges: [],
  });
  const changed = (await request(tech, "/api/account")).user;
  assert.deepEqual([...changed.grants].sort(), ["studies", "work"]);
  assert.deepEqual(changed.adminPrivileges, []);
  await request(tech, "/api/maintenance", plan, 403);
  await request(
    admin,
    "/api/roles",
    { action: "retire", role, version: 2 },
    409,
  );
  const listing = await request(manager, "/api/account-management");
  assert(!listing.assignableRoles.some((r) => r.name === managerRole));
  assert(!listing.accounts.some((a) => a.id === users[3].id));
  const beta = await db.user.findUnique({where:{id:users[3].id}});
  await request(manager, "/api/account-management", {action:"active",id:beta.id,version:beta.version,active:false},403);
  // UI: create a role using named controls, then select the existing custom role.
  await request(admin, "/api/dashboard-settings", {
    preferences: { home: "Permissions", widgets: [], defaultScope: "personal" },
  });
  const page = await admin.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin);
  await page
    .getByRole("heading", { name: "Roles and permissions", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Create custom role", exact: true })
    .click();
  const uiRole = "Floor observer " + suffix;
  roles.push(uiRole);
  await page.getByLabel("Role name", { exact: true }).fill(uiRole);
  await page.getByRole("checkbox", { name: /Centerline audits/ }).check();
  await page.getByRole("button", { name: /Save role|Create role/ }).click();
  await page.getByRole("status").filter({ hasText: "Role saved" }).waitFor();
  await page.getByLabel("Choose role to review").selectOption(role);
  await mkdir("docs/screenshots/custom-roles", { recursive: true });
  await page.screenshot({
    path: "docs/screenshots/custom-roles/permissions.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  await assign(2, "Operator");
  await request(admin, "/api/roles", { action: "retire", role, version: 2 });
  await assign(2, role, 400);
  const history = await request(admin, "/api/roles");
  assert(
    history.audit.some(
      (a) =>
        a.role === role &&
        a.action === "Updated" &&
        a.snapshot.before &&
        a.snapshot.after &&
        a.actorName === users[0].name,
    ),
  );
  assert(!JSON.stringify(history).includes(hash));
  console.log(
    "Custom roles: API boundaries, scoped assignments, immediate revocation, protected Admin, version checks, retirement and UI passed",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    await db.user.updateMany({
      where: { id: { in: users.map((u) => u.id) } },
      data: { customRole: null },
    });
    await db.roleAudit.deleteMany({
      where: { actorId: { in: users.map((u) => u.id) } },
    });
    await db.maintenancePlan.deleteMany({where:{equipmentId:{in:equipment.map(e=>e.id)}}});
    await db.session.deleteMany({
      where: { userId: { in: users.map((u) => u.id) } },
    });
    await db.accountAudit.deleteMany({
      where: {
        OR: [
          { actorId: { in: users.map((u) => u.id) } },
          { targetId: { in: users.map((u) => u.id) } },
        ],
      },
    });
    await db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
    await db.policy.deleteMany({ where: { role: { in: roles } } });
    await db.equipment.deleteMany({
      where: { id: { in: equipment.map((e) => e.id) } },
    });
    await db.$disconnect();
  });
