const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const net = require("node:net");
const os = require("node:os");
const crypto = require("node:crypto");
process.chdir(path.join(__dirname, ".."));
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
function npm(args) {
  run(process.execPath, [npmCli, ...args]);
}
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function main() {
  if (process.platform !== "win32")
    throw Error("Use README setup steps on Linux/macOS");
  if (Number(process.versions.node.split(".")[0]) < 22)
    throw Error("Install Node.js 24 LTS");
  if (!fs.existsSync(npmCli))
    throw Error(
      "Install the official Node.js Windows package, which includes npm",
    );
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", () =>
      reject(Error("Port 3000 is in use. Close the other app using it.")),
    );
    server.listen(3000, "127.0.0.1", () => server.close(resolve));
  });
  run("docker", ["info", "--format", "{{.ServerVersion}}"]);
  run("docker", ["compose", "version"]);
  if (!fs.existsSync(".env")) fs.copyFileSync(".env.example", ".env");
  const lock = crypto
    .createHash("sha256")
    .update(fs.readFileSync("package-lock.json"))
    .digest("hex");
  const marker = "node_modules/.floorwork-lock";
  if (!fs.existsSync(marker) || fs.readFileSync(marker, "utf8") !== lock) {
    npm([
      "ci",
      "--cache",
      path.join(os.tmpdir(), "floorwork-npm"),
      "--no-audit",
      "--no-fund",
    ]);
    fs.writeFileSync(marker, lock);
  }
  require("dotenv").config({ quiet: true });
  const database = new URL(process.env.DATABASE_URL || "");
  if (
    !["localhost", "127.0.0.1"].includes(database.hostname) ||
    database.port !== "5432" ||
    database.pathname !== "/work_rebuild"
  )
    throw Error(
      "This launcher only manages the supplied local work_rebuild database. Your .env was preserved.",
    );
  if (process.env.APP_ORIGIN !== "http://localhost:3000")
    throw Error(
      "This launcher requires APP_ORIGIN=http://localhost:3000. Your .env was preserved.",
    );
  npm(["run", "db:generate"]);
  run("docker", ["compose", "up", "-d", "db"]);
  let ready = false;
  for (let i = 0; i < 60; i++) {
    const probe = spawnSync(
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
    );
    if (probe.status === 0) {
      ready = true;
      break;
    }
    await delay(500);
  }
  if (!ready)
    throw Error("PostgreSQL did not become ready. Check Docker Desktop.");
  npm(["run", "db:setup"]);
  npm(["run", "user:create", "--", "--if-needed"]);
  npm(["run", "build"]);
  console.log(
    "\nStarting Floorwork. Keep this window open. Press Ctrl+C to stop.\n",
  );
  const server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3000",
    ],
    { stdio: "inherit", shell: false },
  );
  server.on("error", () => {
    console.error("Unable to start server");
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
  console.log("Open http://localhost:3000 once the app reports Ready.");
}
main().catch((e) => {
  console.error("\nFloorwork setup stopped:", e.message);
  console.error("Your existing files and database have not been deleted.");
  process.exitCode = 1;
});
