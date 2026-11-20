import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { gzipSync } from "node:zlib";
import { probe, diagnose } from "../scripts/demo-doctor.cjs";
test("HTTP 200 alone cannot hide an invalid compressed page or missing runtime asset", async () => {
  const server = createServer((req, res) => {
    if (req.url === "/broken") {
      res.writeHead(200, { "Content-Encoding": "gzip" });
      res.end("invalid gzip");
      return;
    }
    if (req.url?.startsWith("/_next/")) {
      res.writeHead(404);
      res.end("Missing old runtime asset");
      return;
    }
    res.writeHead(200, { "Content-Encoding": "gzip", "Content-Type": "text/html" });
    res.end(gzipSync('<html><script src="/_next/static/sample.js"></script></html>'));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = (server.address() as import("node:net").AddressInfo).port,
      url = `http://127.0.0.1:${port}`;
    const bad = await probe(url + "/broken");
    assert.equal(bad.status, 200);
    assert.equal(bad.ok, false);
    const good = await probe(url + "/");
    assert(good.ok && good.html);
    assert.equal(good.encoding, "gzip");
    const checks = await diagnose(new URL("https://fictional-3001.app.github.dev"), port);
    assert(checks.slice(0, 3).every((r: { ok: boolean }) => r.ok));
    assert.equal(checks[3].ok, false);
    assert.equal(checks[3].status, 404);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  }
});
