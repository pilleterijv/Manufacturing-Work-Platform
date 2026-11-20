// Read-only diagnostics. Never prints private settings, cookies, HTML or credentials.
const http = require("node:http"),
  https = require("node:https"),
  zlib = require("node:zlib"),
  fs = require("node:fs"),
  path = require("node:path");
const LIMIT = 4 * 1024 * 1024;
function probe(url, headers = {}) {
  return new Promise((resolve) => {
    const req = (url.startsWith("https:") ? https : http).get(
      url,
      {
        headers: {
          Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
          "Accept-Encoding": "gzip, deflate, br",
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        let size = 0;
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > LIMIT) res.destroy();
          else chunks.push(chunk);
        });
        res.on("error", () =>
          resolve({ ok: false, status: res.statusCode, issue: "Response stream ended before completion" })
        );
        res.on("end", () => {
          try {
            if (!res.complete || size > LIMIT) throw Error();
            const encoding = String(res.headers["content-encoding"] || "identity").toLowerCase();
            const bytes = Buffer.concat(chunks),
              opts = { maxOutputLength: LIMIT };
            const decoded =
              encoding === "gzip"
                ? zlib.gunzipSync(bytes, opts)
                : encoding === "br"
                  ? zlib.brotliDecompressSync(bytes, opts)
                  : encoding === "deflate"
                    ? zlib.inflateSync(bytes, opts)
                    : encoding === "identity"
                      ? bytes
                      : null;
            if (!decoded) throw Error();
            const body = decoded.toString("utf8");
            const asset = body.match(/<script[^>]+src="(\/_next\/static\/[^"?#]+\.js)(?:\?[^"#]*)?"/i)?.[1];
            resolve({
              ok: res.statusCode === 200,
              status: res.statusCode,
              encoding,
              bytes: decoded.length,
              html: /<html[\s>]/i.test(body),
              asset,
              type: String(res.headers["content-type"] || ""),
            });
          } catch {
            resolve({
              ok: false,
              status: res.statusCode,
              issue: "Incomplete or invalid compressed response",
            });
          }
        });
      }
    );
    req.setTimeout(8000, () =>
      req.destroy(Object.assign(new Error("Request timed out"), { code: "ETIMEDOUT" }))
    );
    req.on("error", (e) =>
      resolve({
        ok: false,
        issue: [
          "ECONNREFUSED",
          "ENOTFOUND",
          "ECONNRESET",
          "ETIMEDOUT",
          "CERT_HAS_EXPIRED",
          "EPROTO",
          "ERR_SSL_WRONG_VERSION_NUMBER",
          "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
          "DEPTH_ZERO_SELF_SIGNED_CERT",
          "ERR_TLS_CERT_ALTNAME_INVALID",
        ].includes(e.code)
          ? e.code
          : "Connection failed",
      })
    );
  });
}
async function diagnose(origin, port = 3001) {
  const target = `http://127.0.0.1:${port}`,
    results = [];
  for (const [label, headers] of [
    ["Local browser-style page", {}],
    ["Public Host browser-style page", { Host: origin.host }],
    [
      "Loopback proxy browser-style page",
      { Host: `localhost:${port}`, "X-Forwarded-Host": origin.host, "X-Forwarded-Proto": "https" },
    ],
  ]) {
    const r = await probe(target + "/", headers);
    results.push({ label, ...r, ok: r.ok && r.html });
  }
  const page = results.find((r) => r.ok && r.asset);
  if (page) {
    const r = await probe(target + page.asset, { Host: origin.host });
    results.push({ label: "Referenced JavaScript file", ...r, ok: r.ok && /javascript/.test(r.type || "") });
  } else
    results.push({
      label: "Referenced JavaScript file",
      ok: false,
      issue: "No working HTML page with a JavaScript reference",
    });
  return results;
}
async function main() {
  const root = path.join(__dirname, ".."),
    file = path.join(root, ".env.demo");
  if (!fs.existsSync(file)) throw Error("Demo settings are missing. Finish demo:setup first.");
  const vars = require("dotenv").parse(fs.readFileSync(file));
  const origin = new URL(require("./demo-config.cjs").demoOrigin(process.env));
  console.log("DEMO connectivity check — read-only; private settings and account data are omitted.");
  const git = require("node:child_process").spawnSync("git", ["rev-parse", "--short", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const revision = git.stdout?.trim();
  console.log("Source revision: " + (/^[a-f0-9]{7,40}$/.test(revision || "") ? revision : "unavailable"));
  const buildFile = path.join(root, ".floorwork/runtime/.next/BUILD_ID");
  const build = fs.existsSync(buildFile) ? fs.readFileSync(buildFile, "utf8").trim() : "";
  console.log(
    "Saved runtime build: " + (/^[a-zA-Z0-9_-]{1,100}$/.test(build) ? build : "missing or unrecognized")
  );
  const results = await diagnose(origin);
  for (const r of results)
    console.log(
      `${r.ok ? "PASS" : "FAIL"} ${r.label}: HTTP ${r.status || "unavailable"}${r.encoding ? ", " + r.encoding : ""}${r.issue ? "; " + r.issue : ""}`
    );
  if (vars.APP_ORIGIN !== origin.origin)
    console.log(
      "NOTE Saved preview address differs from this session; demo:start recomputes the current address."
    );
  if (process.env.CODESPACES === "true") {
    const external = await probe(origin.origin + "/");
    console.log(
      `Public Codespaces endpoint: HTTP ${external.status || "unavailable"}${external.issue ? "; " + external.issue : ""}`
    );
    console.log(
      "An unauthenticated 302/401 can be expected for a private port. This command does not log into GitHub or change port visibility."
    );
  }
  if (results.every((r) => r.ok))
    console.log(
      "Complete local/proxied HTML and JavaScript responses pass. This does not prove the private GitHub tunnel/browser path works."
    );
  else {
    console.log(
      "A failed local/proxy/asset check identifies an app/runtime problem. Keep the output; do not reset the database."
    );
    process.exitCode = 1;
  }
}
module.exports = { probe, diagnose };
if (require.main === module)
  main().catch(() => {
    console.error(
      "Demo diagnostics could not run. Confirm demo setup exists and the demo is running on port 3001."
    );
    process.exitCode = 1;
  });
