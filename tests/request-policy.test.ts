import { test } from "node:test";
import assert from "node:assert/strict";
import {
  configuredOrigin,
  requestAllowed,
  originCheckDiagnostic,
  requestOriginAllowed,
} from "../lib/request-policy";
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

test("Codespaces loopback forwarding requires the exact runtime preview and preserves API site checks", () => {
  const env = {
    CODESPACES: "true",
    CODESPACE_NAME: "pilot-example",
    GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: "app.github.dev",
  };
  const origin = configuredOrigin("https://pilot-example-3000.app.github.dev");
  for (const host of ["localhost:3000", "127.0.0.1:3000", "[::1]:3000"]) {
    for (const forwarded of [undefined, origin.host, host]) {
      const headers = new Headers({ host });
      if (forwarded) headers.set("x-forwarded-host", forwarded);
      assert(requestAllowed(headers, "/", origin, env));
      assert(requestAllowed(headers, "/api/account", origin, env));
      assert(!requestAllowed(headers, "/", origin));
      assert(
        !requestAllowed(headers, "/", origin, { ...env, CODESPACES: "false" }),
      );
      assert(
        !requestAllowed(headers, "/", origin, {
          ...env,
          CODESPACE_NAME: "another-space",
        }),
      );
      headers.set("sec-fetch-site", "cross-site");
      assert(!requestAllowed(headers, "/api/account", origin, env));
    }
  }
  for (const host of [
    "attacker.example",
    "localhost:3001",
    "localhost.attacker.example:3000",
  ]) {
    assert(
      !requestAllowed(
        new Headers({ host, "x-forwarded-host": origin.host }),
        "/",
        origin,
        env,
      ),
    );
  }
  for (const forwarded of [
    "attacker.example",
    origin.host + ", attacker.example",
    "127.0.0.1:3000",
  ]) {
    assert(
      !requestAllowed(
        new Headers({ host: "localhost:3000", "x-forwarded-host": forwarded }),
        "/",
        origin,
        env,
      ),
    );
  }
  assert(
    !requestAllowed(
      new Headers({ host: "localhost:3000" }),
      "/",
      configuredOrigin("https://company.example"),
      env,
    ),
  );
});

test("origin diagnostics expose address metadata without cookies, credentials, paths or query strings", () => {
  const req = new Request("https://preview.example/private?token=secret", {
    headers: {
      origin: "http://localhost:3000",
      cookie: "session=secret",
      authorization: "Bearer secret",
      "sec-fetch-site": "same-origin",
    },
  });
  assert.deepEqual(
    originCheckDiagnostic(
      req,
      "https://user:password@preview.example/path?key=secret",
    ),
    {
      expectedOrigin: "https://preview.example",
      receivedOrigin: "http://localhost:3000",
      requestOrigin: "https://preview.example",
      fetchSite: "same-origin",
    },
  );
  const serialized = JSON.stringify(
    originCheckDiagnostic(
      req,
      "https://user:password@preview.example/path?key=secret",
    ),
  );
  for (const secret of ["password", "secret", "session", "Bearer", "private"])
    assert(!serialized.includes(secret));
  const invalid = originCheckDiagnostic(
    new Request("https://preview.example", {
      headers: { origin: "malformed secret" },
    }),
    undefined,
  );
  assert.equal(invalid.expectedOrigin, "<missing>");
  assert.equal(invalid.receivedOrigin, "<invalid>");
});

test("rewritten Codespaces POST Origin requires browser origin proof and same-origin Fetch Metadata", () => {
  const env = {
    CODESPACES: "true",
    CODESPACE_NAME: "pilot-example",
    GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: "app.github.dev",
  };
  const origin = configuredOrigin("https://pilot-example-3000.app.github.dev");
  const valid = {
    host: "localhost:3000",
    origin: "https://localhost:3000",
    "x-floorwork-origin": origin.origin,
    "sec-fetch-site": "same-origin",
  };
  assert(requestOriginAllowed(new Headers(valid), origin, env));
  assert(
    requestOriginAllowed(
      new Headers({ ...valid, origin: "http://localhost:3000" }),
      origin,
      env,
    ),
  );
  assert(requestOriginAllowed(new Headers({ origin: origin.origin }), origin));
  assert(!requestOriginAllowed(new Headers(valid), origin));
  assert(
    !requestOriginAllowed(new Headers(valid), origin, {
      ...env,
      CODESPACE_NAME: "other-space",
    }),
  );
  for (const [key, value] of Object.entries({
    host: "attacker.example",
    origin: "https://attacker.example",
    "x-floorwork-origin": "https://attacker.example",
    "sec-fetch-site": "cross-site",
  }))
    assert(
      !requestOriginAllowed(
        new Headers({ ...valid, [key]: value }),
        origin,
        env,
      ),
    );
  for (const value of ["same-site", "none", ""])
    assert(
      !requestOriginAllowed(
        new Headers({ ...valid, "sec-fetch-site": value }),
        origin,
        env,
      ),
    );
  for (const key of [
    "origin",
    "host",
    "x-floorwork-origin",
    "sec-fetch-site",
  ]) {
    const headers = new Headers(valid);
    headers.delete(key);
    assert(!requestOriginAllowed(headers, origin, env));
  }
  assert(
    !requestOriginAllowed(
      new Headers({ ...valid, "x-forwarded-host": "attacker.example" }),
      origin,
      env,
    ),
  );
  assert(
    !requestOriginAllowed(
      new Headers(valid),
      configuredOrigin("https://company.example"),
      env,
    ),
  );
});
