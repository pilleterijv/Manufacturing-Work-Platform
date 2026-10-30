require("tsx/cjs");
require("dotenv").config({ quiet: true });
const { db } = require("../lib/db.ts"),
  { verifyPassword } = require("../lib/security.ts"),
  { spawn } = require("node:child_process"),
  { randomUUID } = require("node:crypto"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const root = process.env.RUNTIME_DIR;
if (!root) throw Error("Set RUNTIME_DIR to an isolated prepared runtime");
const username = "runtime-" + randomUUID().slice(0, 8),
  password = `Runtime ${randomUUID()}!`;
async function main() {
  assert(!fs.existsSync(path.join(root, ".env")));
  assert(!fs.existsSync(path.join(root, "uploads")));
  assert(
    fs.existsSync(
      path.join(root, "node_modules/.prisma/client/query_compiler_bg.wasm"),
    ),
  );
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(root, "tools/create-admin.cjs")],
      { cwd: process.cwd(), env: process.env, stdio: ["pipe", "pipe", "pipe"] },
    );
    const answers = [
      ["Admin username", username],
      ["Display name", "Runtime verification"],
      ["Temporary password", password],
      ["Confirm password", password],
    ];
    let stage = 0,
      output = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(Error("Bundled account tool timed out"));
    }, 15000);
    child.stdout.on("data", (chunk) => {
      output += chunk;
      while (stage < answers.length && output.includes(answers[stage][0])) {
        child.stdin.write(answers[stage][1] + "\n");
        stage++;
      }
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0)
        return reject(
          Error(
            "Bundled account tool failed: " +
              output.replaceAll(password, "[redacted]"),
          ),
        );
      assert(!output.includes(password), "Password was echoed");
      resolve();
    });
  });
  const u = await db.user.findUnique({ where: { username } });
  assert(u && u.mustChange && u.role === "Admin");
  assert(await verifyPassword(password, u.password));
  console.log(
    "PASS: isolated runtime database/account tools, required WASM asset, hidden password prompts, and exclusion of configuration/photos.",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.user.deleteMany({ where: { username } });
    await db.$disconnect();
  });
