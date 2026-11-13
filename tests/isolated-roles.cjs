// Run role and regression workflows only against a disposable local database.
require("dotenv").config({ quiet: true });
const { Pool } = require("pg"),
  { spawn, spawnSync } = require("node:child_process"),
  { randomUUID } = require("node:crypto"),
  assert = require("node:assert/strict");
const parentUrl = new URL(process.env.DATABASE_URL || "");
assert(["localhost", "127.0.0.1"].includes(parentUrl.hostname));
const name = "floorwork_roles_" + randomUUID().replaceAll("-", "");
assert(/^floorwork_roles_[a-f0-9]{32}$/.test(name));
const url = new URL(parentUrl);
url.pathname = "/" + name;
const origin = "http://localhost:3107";
const env = {
  ...process.env,
  DATABASE_URL: url.toString(),
  DATABASE_SETUP_URL: url.toString(),
  APP_ORIGIN: origin,
  APP_URL: origin,
  HOSTNAME: "127.0.0.1",
  PORT: "3107",
  FLOORWORK_WORKER_MODE: "external",
  SMTP_HOST: "",
  COMPANY_SQL_SERVER: "",
  EXTERNAL_DATA_FEEDS_JSON: "[]",
  OPENAI_API_KEY: "",
  MAINTAINX_API_KEY: "",
  CODESPACES: "false",
};
const parent = new Pool({ connectionString: parentUrl.toString() });
let server;
async function run(file) {
  await new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [file], { env, stdio: "inherit" });
    p.on("error", reject);
    p.on("exit", (code) =>
      code === 0 ? resolve() : reject(Error(file + " failed: " + code)),
    );
  });
}
(async () => {
  await parent.query(`CREATE DATABASE "${name}"`);
  const setup = spawnSync(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", "scripts/setup.ts"],
    { env, encoding: "utf8" },
  );
  assert.equal(setup.status, 0, "Temporary setup failed: " + setup.stderr);
  server = spawn(process.execPath, [".floorwork/runtime/server.js"], {
    env,
    stdio: ["ignore", "ignore", "inherit"],
  });
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (server.exitCode !== null) throw Error("Isolated server stopped");
    try {
      if ((await fetch(origin + "/api/account")).status === 200) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  assert(ready, "Isolated server did not start");
  for (const file of process.argv.slice(2).length
    ? process.argv.slice(2)
    : [
        "tests/custom-roles-browser.cjs",
        "tests/browser.cjs",
        "tests/personal-access-assistant.cjs",
        "tests/security-readiness.cjs",
      ])
    await run(file);
})()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (server && server.exitCode === null) {
      server.kill("SIGTERM");
      await new Promise((r) => server.once("exit", r));
    }
    await parent.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await parent.end();
  });
