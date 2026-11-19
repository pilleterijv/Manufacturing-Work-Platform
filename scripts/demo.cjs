// Separate local-only demonstration. Never seeds the configured operational database.
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  { spawnSync, spawn } = require("node:child_process"),
  { Pool } = require("pg");
const root = path.join(__dirname, ".."),
  envFile = path.join(root, ".env.demo"),
  folder = path.join(root, ".floorwork", "demo");
const { validateDemoUrl, demoEnvironment, demoOrigin } = require("./demo-config.cjs");
function run(file, env) {
  const r = spawnSync(process.execPath, [path.join(root, "node_modules/tsx/dist/cli.mjs"), file], {
    cwd: root,
    env,
    stdio: "inherit",
  });
  if (r.status !== 0) throw Error("Demo preparation failed. Your operational database was not seeded.");
}
async function main() {
  const action = process.argv[2] || "start";
  if (!["setup", "start", "reset"].includes(action)) throw Error("Use demo:setup, demo:start or demo:reset");
  if (action === "start") {
    if (!fs.existsSync(envFile)) throw Error("Run npm run demo:setup first.");
    const vars = require("dotenv").parse(fs.readFileSync(envFile));
    validateDemoUrl(vars.DATABASE_URL);
    const env = demoEnvironment({ ...process.env, ...vars }, vars.DATABASE_URL, folder);
    const verification = new Pool({ connectionString: env.DATABASE_URL, max: 1 });
    try {
      const m = await verification.query('SELECT value FROM "Setting" WHERE key=$1', ["demo-dataset"]);
      if (m.rows[0]?.value?.synthetic !== true) throw Error("Refusing to start an unmarked demo database.");
    } finally {
      await verification.end();
    }
    env.APP_ORIGIN = demoOrigin(env);
    env.FLOORWORK_ENV_FILE = envFile;
    console.log("DEMO ONLY. Open " + env.APP_ORIGIN + " (keep the forwarded port Private).");
    console.log(
      "Demo logins are in .floorwork/demo/accounts.txt. Stop with Ctrl+C. Your normal app is separate on port 3000."
    );
    const child = spawn(process.execPath, ["scripts/start-runtime.cjs"], {
      cwd: root,
      env,
      stdio: "inherit",
      shell: false,
    });
    child.on("exit", (code) => (process.exitCode = code || 0));
    for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
    return;
  }
  const privateFile = process.env.FLOORWORK_ENV_FILE || path.join(root, ".env");
  if (fs.existsSync(privateFile)) process.loadEnvFile(privateFile);
  const source = new URL(process.env.DATABASE_SETUP_URL || process.env.DATABASE_URL || "");
  if (
    !["postgres:", "postgresql:"].includes(source.protocol) ||
    !["localhost", "127.0.0.1", "db"].includes(source.hostname)
  )
    throw Error(
      "Demo setup needs local pilot PostgreSQL. It will not create/seed a company-hosted database. Ask IT for a separate local pilot connection."
    );
  const name = "floorwork_demo_" + crypto.createHash("sha256").update(root).digest("hex").slice(0, 12),
    url = new URL(source);
  url.pathname = "/" + name;
  validateDemoUrl(url.toString());
  if (source.pathname === url.pathname)
    throw Error("Refusing to use the operational connection as the demo database.");
  const parent = new Pool({ connectionString: source.toString(), max: 1, connectionTimeoutMillis: 5000 });
  try {
    const exists = (await parent.query("SELECT 1 FROM pg_database WHERE datname=$1", [name])).rowCount;
    if (exists && action === "reset") {
      const demo = new Pool({ connectionString: url.toString(), max: 1 });
      try {
        const m = await demo.query('SELECT value FROM "Setting" WHERE key=$1', ["demo-dataset"]);
        if (m.rows[0]?.value?.synthetic !== true) throw Error("Refusing to reset an unmarked database.");
      } finally {
        await demo.end();
      }
      await parent.query('DROP DATABASE "' + name + '"');
    }
    if (!exists || action === "reset") await parent.query('CREATE DATABASE "' + name + '"');
  } finally {
    await parent.end();
  }
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  const env = demoEnvironment(process.env, url.toString(), folder);
  env.APP_ORIGIN = demoOrigin(env);
  let password;
  if (fs.existsSync(path.join(folder, "accounts.txt")) && action !== "reset") password = undefined;
  else password = crypto.randomBytes(18).toString("base64url") + "!";
  if (password) env.FLOORWORK_DEMO_PASSWORD = password;
  // Explicit environment overrides dotenv's normal .env loading in both tools.
  run("scripts/setup.ts", env);
  run("scripts/demo-seed.ts", env);
  const keys = [
    "DATABASE_URL",
    "DATABASE_SETUP_URL",
    "APP_ORIGIN",
    "PORT",
    "UPLOADS_DIR",
    "FLOORWORK_DEMO_MODE",
    "FLOORWORK_WORKER_MODE",
    "SMTP_HOST",
    "SMTP_FROM",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "COMPANY_SQL_SERVER",
    "COMPANY_SQL_DATABASE",
    "COMPANY_SQL_USER",
    "COMPANY_SQL_PASSWORD",
    "MAINTAINX_API_KEY",
    "OPENAI_API_KEY",
    "AZURE_STORAGE_CONNECTION_STRING",
    "EXTERNAL_DATA_FEEDS_JSON",
  ];
  fs.writeFileSync(envFile, keys.map((k) => k + "=" + JSON.stringify(env[k] || "")).join("\n") + "\n", {
    mode: 0o600,
  });
  fs.chmodSync(envFile, 0o600);
  if (password)
    fs.writeFileSync(
      path.join(folder, "accounts.txt"),
      "FICTIONAL DEMO ONLY — no real employee accounts\nUsernames: demo-admin, demo-operator, demo-leader, demo-manager, demo-maintenance\nPassword for these demo accounts: " +
        password +
        "\n\nEmails and external integrations are disabled. Never reuse this password for the actual app.\n",
      { mode: 0o600 }
    );
  console.log(
    "Demo is ready. Credentials: .floorwork/demo/accounts.txt. Run npm run demo:start. No operational records were seeded."
  );
}
main().catch((e) => {
  console.error(
    e.message && /^(Demo|Use |Run |Refusing|Ask )/.test(e.message)
      ? e.message
      : "Demo setup could not finish. Check local PostgreSQL permissions/service availability; do not change the operational database to fix the demo."
  );
  process.exitCode = 1;
});
