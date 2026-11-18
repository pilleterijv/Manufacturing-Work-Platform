require("tsx/cjs");
require("dotenv").config({ quiet: true });
const { db } = require("../lib/db.ts"),
  { hashPassword } = require("../lib/security.ts"),
  { randomUUID } = require("node:crypto"),
  { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises");
const origin = process.env.APP_URL;
let browser;
async function main() {
  assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
  const temporary = "Temporary fixture " + randomUUID() + "!",
    replacement = "Replacement fixture " + randomUUID() + "!";
  const user = await db.user.create({
    data: {
      username: "transition-" + randomUUID().slice(0, 8),
      name: "Transition Fixture",
      password: await hashPassword(temporary),
      role: "Operator",
      mustChange: true,
      workspaceAccess: { mode: "restricted", locations: [], equipmentIds: [] },
    },
  });
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
      serviceWorkers: "block",
      viewport: { width: 820, height: 1180 },
    }),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin);
  await page.getByLabel("Username", { exact: true }).fill(user.username);
  await page.getByLabel("Password", { exact: true }).fill(temporary);
  await page
    .getByLabel("Keep me signed in on this device for 30 days", { exact: true })
    .check();
  const oldUsername = await page
      .getByLabel("Username", { exact: true })
      .elementHandle(),
    oldPassword = await page
      .getByLabel("Password", { exact: true })
      .elementHandle();
  await page.getByRole("button", { name: "Sign in →", exact: true }).click();
  await page
    .getByRole("heading", { name: "Set your own password", exact: true })
    .waitFor();
  assert(
    (await page
      .getByLabel("Temporary password", { exact: true })
      .inputValue()) === "",
    "Temporary password must start blank after login",
  );
  assert(
    (await page
      .getByLabel("New password · 12–128 characters", { exact: true })
      .inputValue()) === "",
    "New password must not inherit the login password",
  );
  assert(
    !(await oldUsername.evaluate((el) => el.isConnected)),
    "Sign-in username element must not become a password element",
  );
  assert(
    !(await oldPassword.evaluate((el) => el.isConnected)),
    "Sign-in password element must be replaced at the mode boundary",
  );
  await fs.mkdir("docs/screenshots/auth-transitions", { recursive: true });
  await page.screenshot({
    path: "docs/screenshots/auth-transitions/blank-password-setup.png",
  });
  await page.getByLabel("Temporary password", { exact: true }).fill(temporary);
  await page
    .getByLabel("New password · 12–128 characters", { exact: true })
    .fill(replacement);
  await page.getByRole("button", { name: "Set password", exact: true }).click();
  await page
    .getByRole("heading", { name: "Welcome back", exact: true })
    .waitFor();
  assert(
    (await page.getByLabel("Username", { exact: true }).inputValue()) === "",
    "Password must never appear in the returned username field",
  );
  assert(
    (await page.getByLabel("Password", { exact: true }).inputValue()) === "",
    "Returned login password must start blank",
  );
  assert(
    !(await page
      .getByLabel("Keep me signed in on this device for 30 days", {
        exact: true,
      })
      .isChecked()),
  );
  assert.equal(
    (await (await context.request.get(origin + "/api/account")).json()).user,
    null,
  );
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: user.id } })).username,
    user.username,
  );
  await page.screenshot({
    path: "docs/screenshots/auth-transitions/blank-returned-login.png",
  });
  await page.getByLabel("Username", { exact: true }).fill(user.username);
  await page.getByLabel("Password", { exact: true }).fill(replacement);
  await page.getByRole("button", { name: "Sign in →", exact: true }).click();
  await page
    .getByRole("heading", { name: "Welcome, Transition.", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page
    .getByRole("heading", { name: "Welcome back", exact: true })
    .waitFor();
  assert(
    (await page.getByLabel("Username", { exact: true }).inputValue()) === "",
  );
  assert(
    (await page.getByLabel("Password", { exact: true }).inputValue()) === "",
  );
  // Public registration and recovery also use separate form instances.
  await page
    .getByRole("button", { name: "Request an account", exact: true })
    .click();
  await page
    .getByLabel("Requested username", { exact: true })
    .fill("unsubmitted-fixture");
  await page
    .getByRole("button", { name: "Forgot my password", exact: true })
    .click();
  assert(
    (await page
      .getByLabel("Username or account email", { exact: true })
      .inputValue()) === "",
    "Recovery must not inherit registration fields",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: login/setup/returned-login use isolated blank inputs; password never becomes username; fresh remember choice; session revoked and replacement login succeeds; logout and registration/recovery fields isolated; tablet UI.",
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
