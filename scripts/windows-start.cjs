const fs = require("node:fs"),
  path = require("node:path"),
  { spawn, spawnSync } = require("node:child_process"),
  net = require("node:net"),
  os = require("node:os");
const { sourceFingerprint, cachedBuild } = require("./build-state.cjs");
const root = path.join(__dirname, "..");
process.chdir(root);
const npmCli = path.join(
  path.dirname(process.execPath),
  "node_modules",
  "npm",
  "bin",
  "npm-cli.js",
);
function run(exe, args) {
  const result = spawnSync(exe, args, { stdio: "inherit", shell: false });
  if (result.error || result.status !== 0)
    throw Error(
      `Command failed: ${path.basename(exe)} ${args.slice(0, 2).join(" ")}`,
    );
}
const npm = (args) => run(process.execPath, [npmCli, ...args]);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function main() {
  if (process.platform !== "win32")
    throw Error("Use README setup steps on Linux/macOS");
  if (Number(process.versions.node.split(".")[0]) < 22)
    throw Error("Install Node.js 24 LTS");
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", () =>
      reject(Error("Port 3000 is in use. Close the other app using it.")),
    );
    server.listen(3000, "127.0.0.1", () => server.close(resolve));
  });
  if (!fs.existsSync(".env")) fs.copyFileSync(".env.example", ".env");
  process.loadEnvFile(".env");
  const database = new URL(process.env.DATABASE_URL || "");
  if (
    !["localhost", "127.0.0.1"].includes(database.hostname) ||
    database.pathname !== "/work_rebuild"
  )
    throw Error(
      "This launcher only manages a local work_rebuild database. Your .env was preserved.",
    );
  if (process.env.APP_ORIGIN !== "http://localhost:3000")
    throw Error(
      "Set APP_ORIGIN=http://localhost:3000 for this launcher. Your .env was preserved.",
    );
  const mode = process.env.FLOORWORK_DATABASE_MODE || "docker";
  if (!["docker", "existing"].includes(mode))
    throw Error("FLOORWORK_DATABASE_MODE must be docker or existing");
  if (mode === "docker") {
    if (database.port !== "5432")
      throw Error("Docker mode requires database port 5432");
    run("docker", ["info", "--format", "{{.ServerVersion}}"]);
    run("docker", ["compose", "up", "-d", "db"]);
    let ready = false;
    for (let i = 0; i < 60; i++) {
      if (
        spawnSync(
          "docker",
          [
            "compose",
            "exec",
            "-T",
            "db",
            "pg_isready",
            "-U",
            "work",
            "-d",
            "work_rebuild",
          ],
          { stdio: "ignore", shell: false },
        ).status === 0
      ) {
        ready = true;
        break;
      }
      await delay(500);
    }
    if (!ready)
      throw Error("PostgreSQL did not become ready. Check Docker Desktop.");
  }
  const fingerprint = sourceFingerprint(root),
    runtime = path.join(root, ".floorwork", "runtime");
  if (!cachedBuild(root, fingerprint)) {
    if (!fs.existsSync(npmCli))
      throw Error("Install the official Node.js Windows package including npm");
    console.log(
      "\nPreparing the application. This happens on first use and after code updates.\n",
    );
    npm([
      "ci",
      "--cache",
      path.join(os.tmpdir(), "floorwork-npm"),
      "--no-audit",
      "--no-fund",
    ]);
    npm(["run", "db:generate"]);
    npm(["run", "build"]);
    run(process.execPath, ["scripts/prepare-runtime.cjs"]);
    fs.writeFileSync(".floorwork/build.json", JSON.stringify({ fingerprint }));
    if (!process.argv.includes("--keep-build-tools")) {
      fs.rmSync("node_modules", {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 500,
      });
      fs.rmSync(".next", {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 500,
      });
      console.log(
        "Removed build-only dependencies and cache to reclaim disk space.",
      );
    }
  } else
    console.log("Starting the saved build; no install or compilation needed.");
  run(process.execPath, [path.join(runtime, "tools", "setup.cjs")]);
  run(process.execPath, [
    path.join(runtime, "tools", "create-admin.cjs"),
    "--if-needed",
  ]);
  console.log(
    "\nStarting Floorwork. Keep this window open; Ctrl+C stops the application.\n",
  );
  const server = spawn(process.execPath, [path.join(runtime, "server.js")], {
    stdio: "inherit",
    shell: false,
    env: {
      ...process.env,
      HOSTNAME: "127.0.0.1",
      PORT: "3000",
      UPLOADS_DIR: path.join(root, "uploads"),
    },
  });
  server.on("error", () => {
    console.error("Unable to start the application");
    process.exitCode = 1;
  });
  process.on("SIGINT", () => server.kill("SIGINT"));
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null)
      throw Error("The app stopped before it was ready");
    try {
      const r = await fetch("http://localhost:3000/api/account");
      if (r.ok) {
        const opener = spawn(
          "cmd.exe",
          ["/d", "/s", "/c", 'start "" "http://localhost:3000"'],
          {
            shell: false,
            windowsVerbatimArguments: true,
            windowsHide: true,
            stdio: "ignore",
          },
        );
        opener.on("error", () =>
          console.log("Open http://localhost:3000 in your browser."),
        );
        console.log("Open http://localhost:3000 on this computer.");
        return;
      }
    } catch {}
    await delay(500);
  }
  console.log("Open http://localhost:3000 once the application reports Ready.");
}
main().catch((e) => {
  console.error("\nFloorwork setup stopped:", e.message);
  console.error(
    "Your account database, .env, and uploads have not been deleted.",
  );
  process.exitCode = 1;
});
