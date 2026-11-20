// Full production HTTP/proxy/browser smoke. No real database, accounts or credentials.
const { spawn } = require("node:child_process"),
  http = require("node:http"),
  assert = require("node:assert/strict"),
  { chromium } = require("playwright"),
  { diagnose } = require("../scripts/demo-doctor.cjs");
let server, proxy, browser;
async function main() {
  const port = 3116,
    origin = new URL(`https://fictional-preview-${port}.app.github.dev`);
  server = spawn(process.execPath, [".floorwork/runtime/server.js"], {
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      APP_ORIGIN: origin.origin,
      CODESPACES: "true",
      CODESPACE_NAME: "fictional-preview",
      GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: "app.github.dev",
      DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/no_database",
      DATABASE_SETUP_URL: "postgresql://unused:unused@127.0.0.1:1/no_database",
      FLOORWORK_WORKER_MODE: "external",
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  server.stderr.on("data", (d) => (stderr += d.toString()));
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/`)).status === 200) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  assert(ready, "Production runtime did not respond");
  const checks = await diagnose(origin, port);
  assert(
    checks.every((c) => c.ok),
    JSON.stringify(checks)
  );
  proxy = http.createServer((req, res) => {
    const upstream = http.request(
      {
        host: "127.0.0.1",
        port,
        path: req.url,
        method: req.method,
        headers: {
          ...req.headers,
          host: `127.0.0.1:${port}`,
          "x-forwarded-host": origin.host,
          "x-forwarded-proto": "https",
        },
      },
      (r) => {
        const headers = { ...r.headers };
        delete headers.connection;
        delete headers["keep-alive"];
        delete headers["transfer-encoding"];
        res.writeHead(r.statusCode, headers);
        r.pipe(res);
      }
    );
    upstream.on("error", () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
  });
  await new Promise((r) => proxy.listen(0, "127.0.0.1", r));
  browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
  const page = await browser.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const response = await page.goto(`http://127.0.0.1:${proxy.address().port}/`);
  assert.equal(response.status(), 200);
  await page.getByRole("heading", { name: "Welcome back", exact: true }).waitFor();
  assert.equal(await page.locator('input[type="password"]').count(), 1);
  assert.deepEqual(errors, []);
  assert(!stderr.includes("PrismaClientKnownRequestError"));
  console.log(
    "PASS: current production build sends complete browser-encoded HTML and JavaScript under local, public Host and rewritten Codespaces proxy headers; Chromium renders the sign-in page through a streaming reverse proxy with security headers intact and without accessing a real database."
  );
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    if (proxy) await new Promise((r) => proxy.close(r));
    if (server && server.exitCode === null) {
      server.kill("SIGTERM");
      await new Promise((r) => server.once("exit", r));
    }
  });
