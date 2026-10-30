import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
// The launcher must never reuse an out-of-date application or recompile for docs alone.
const {
  sourceFingerprint,
  cachedBuild,
} = require("../scripts/build-state.cjs");
test("build cache invalidates source changes, ignores docs, and rejects missing runtime files", () => {
  const root = mkdtempSync(path.join(tmpdir(), "floorwork-cache-"));
  try {
    mkdirSync(path.join(root, "app"));
    mkdirSync(path.join(root, "docs"));
    writeFileSync(path.join(root, "app/page.tsx"), "first");
    writeFileSync(path.join(root, "package-lock.json"), "{}");
    const a = sourceFingerprint(root);
    assert(!cachedBuild(root, a));
    for (const file of [
      "server.js",
      ".next/BUILD_ID",
      "tools/setup.cjs",
      "tools/create-admin.cjs",
      "node_modules/.prisma/client/query_compiler_bg.wasm",
      "node_modules/.prisma/client/query_compiler_bg.wasm",
    ]) {
      const full = path.join(root, ".floorwork/runtime", file);
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, "fixture");
    }
    writeFileSync(
      path.join(root, ".floorwork/build.json"),
      JSON.stringify({ fingerprint: a }),
    );
    assert(cachedBuild(root, a));
    writeFileSync(path.join(root, "docs/readme.md"), "documentation");
    assert.equal(sourceFingerprint(root), a);
    writeFileSync(path.join(root, "app/page.tsx"), "changed");
    const b = sourceFingerprint(root);
    assert.notEqual(b, a);
    assert(!cachedBuild(root, b));
    rmSync(path.join(root, ".floorwork/runtime/server.js"));
    assert(!cachedBuild(root, a));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
