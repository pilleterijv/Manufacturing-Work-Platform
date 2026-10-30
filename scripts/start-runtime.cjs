const fs = require("node:fs"),
  path = require("node:path"),
  { spawn } = require("node:child_process");
const root = path.join(__dirname, "..");
process.chdir(root);
if (fs.existsSync(".env")) process.loadEnvFile(".env");
const serverPath = path.join(root, ".floorwork/runtime/server.js");
if (!fs.existsSync(serverPath)) {
  console.error("Build the application first: npm run build");
  process.exitCode = 1;
} else {
  const server = spawn(process.execPath, [serverPath], {
    stdio: "inherit",
    shell: false,
    env: {
      ...process.env,
      HOSTNAME: "127.0.0.1",
      PORT: process.env.PORT || "3000",
      UPLOADS_DIR: process.env.UPLOADS_DIR || path.join(root, "uploads"),
    },
  });
  server.on("error", () => {
    console.error("Unable to start the saved runtime");
    process.exitCode = 1;
  });
  server.on("exit", (code) => {
    process.exitCode = code ?? 1;
  });
  process.on("SIGINT", () => server.kill("SIGINT"));
  process.on("SIGTERM", () => server.kill("SIGTERM"));
}
