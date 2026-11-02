import { test } from "node:test";
import assert from "node:assert/strict";
import { configuredOrigin, requestAllowed } from "../lib/request-policy";
import { decodeCursor, pageInfo } from "../lib/pagination";
import { randomUUID } from "node:crypto";
test("public origins require HTTPS and reject credentials, paths and alternate hosts", () => {
  for (const origin of [
    undefined,
    "http://floorwork.example",
    "https://user:pass@floorwork.example",
    "https://floorwork.example/path",
    "https://floorwork.example?redirect=other",
  ])
    assert.throws(() => configuredOrigin(origin));
  const publicOrigin = configuredOrigin("https://floorwork.example");
  assert(
    requestAllowed(
      new Headers({ host: "floorwork.example" }),
      "/api/account",
      publicOrigin,
    ),
  );
  assert(
    !requestAllowed(
      new Headers({
        host: "attacker.example",
        "x-forwarded-host": "floorwork.example",
      }),
      "/api/account",
      publicOrigin,
    ),
  );
  assert(
    !requestAllowed(
      new Headers({
        host: "floorwork.example",
        "sec-fetch-site": "cross-site",
      }),
      "/api/account",
      publicOrigin,
    ),
  );
  assert.equal(
    configuredOrigin("http://localhost:3000").host,
    "localhost:3000",
  );
});
test("history cursor preserves timestamp ties and rejects malformed input", () => {
  const row = { id: randomUUID(), createdAt: new Date("2026-11-02T10:00:00Z") };
  const page = pageInfo(
    Array.from({ length: 101 }, () => row),
    (r) => r.createdAt,
  );
  assert(page.hasMore);
  assert.deepEqual(decodeCursor(page.cursor), {
    id: row.id,
    at: row.createdAt,
  });
  assert.throws(() => decodeCursor("x".repeat(1000)));
  assert.throws(() =>
    decodeCursor(
      Buffer.from('{"id":"bad","at":"yesterday"}').toString("base64url"),
    ),
  );
});
