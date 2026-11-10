const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { parseEnv } = require("node:util");
function configuration(env) {
  if (env.CODESPACES !== "true")
    throw new Error("Run this command inside GitHub Codespaces.");
  const name = env.CODESPACE_NAME;
  const domain = env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
  if (
    !/^[a-z0-9-]+$/.test(name || "") ||
    !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(domain || "")
  )
    throw new Error("Codespaces preview address is unavailable.");
  return {
    DATABASE_URL: "postgresql://work:work@db:5432/work_rebuild",
    DATABASE_SETUP_URL: "postgresql://work:work@db:5432/work_rebuild",
    APP_ORIGIN: `https://${name}-3000.${domain}`,
  };
}
function prepareEnvironment(root, source) {
  const expected = configuration(source);
  const file = path.join(root, ".env.codespaces");
  const existing = fs.existsSync(file)
    ? parseEnv(fs.readFileSync(file, "utf8"))
    : {};
  for (const key of ["DATABASE_URL", "DATABASE_SETUP_URL"])
    if (existing[key] && existing[key] !== expected[key])
      throw new Error(
        "Codespaces pilot configuration targets a different database. Review it privately before continuing.",
      );
  const values = { ...existing, ...expected };
  // Keep private provider settings byte-for-byte; only append managed pilot values.
  const updates = Object.entries(expected).filter(
    ([key, value]) => existing[key] !== value,
  );
  if (updates.length) {
    fs.appendFileSync(
      file,
      "\n" + updates.map(([key, value]) => `${key}=${value}`).join("\n") + "\n",
      { mode: 0o600 },
    );
  }
  fs.chmodSync(file, 0o600);
  return {
    ...source,
    ...values,
    DOTENV_CONFIG_PATH: file,
    FLOORWORK_ENV_FILE: file,
  };
}
function main() {
  const root = path.join(__dirname, "..");
  process.chdir(root);
  const env = prepareEnvironment(root, process.env);
  function npm(...args) {
    const result = spawnSync("npm", args, {
      stdio: "inherit",
      env,
      shell: false,
    });
    if (result.error || result.status !== 0)
      throw new Error("Codespaces command failed. See the output above.");
  }
  switch (process.argv[2]) {
    case "setup":
      npm("ci");
      npm("run", "db:generate");
      npm("run", "db:setup");
      npm("run", "build");
      console.log(
        "Ready. Run npm run codespaces:admin, then npm run codespaces:start.",
      );
      break;
    case "admin":
      npm("run", "user:create", "--", "--if-needed");
      break;
    case "start":
      console.log(`Open ${env.APP_ORIGIN} (keep port 3000 private).`);
      npm("start");
      break;
    default:
      throw new Error("Use setup, admin or start.");
  }
}
module.exports = { configuration, prepareEnvironment };
if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
