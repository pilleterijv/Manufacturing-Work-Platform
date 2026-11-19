import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDemoUrl, demoEnvironment, demoOrigin } from "../scripts/demo-config.cjs";
import { requestAllowed, requestOriginAllowed } from "../lib/request-policy";
test("demo targets fail closed and secret-bearing integrations are stripped", () => {
  const url = "postgresql://demo:demo@localhost/floorwork_demo_0123456789ab";
  assert(validateDemoUrl(url));
  for (const target of [
    "postgresql://x:x@localhost/work_rebuild",
    "postgresql://x:x@company.example/floorwork_demo_0123456789ab",
    "mssql://localhost/floorwork_demo_0123456789ab",
  ])
    assert.throws(() => validateDemoUrl(target));
  const env = demoEnvironment(
    {
      SMTP_HOST: "real-mail",
      SMTP_PASSWORD: "real-secret",
      COMPANY_SQL_SERVER: "real-server",
      MAINTAINX_API_KEY: "real-key",
      OPENAI_API_KEY: "real-key",
      AZURE_STORAGE_CONNECTION_STRING: "real-storage",
      EXTERNAL_DATA_FEEDS_JSON: "real-feeds",
    },
    url,
    "/tmp/demo-only"
  );
  for (const key of [
    "SMTP_HOST",
    "SMTP_PASSWORD",
    "COMPANY_SQL_SERVER",
    "MAINTAINX_API_KEY",
    "OPENAI_API_KEY",
    "AZURE_STORAGE_CONNECTION_STRING",
  ])
    assert.equal(env[key], "");
  assert.equal(env.EXTERNAL_DATA_FEEDS_JSON, "[]");
  assert.equal(env.PORT, "3001");
  assert.equal(env.FLOORWORK_WORKER_MODE, "external");
  assert.equal(demoOrigin({}), "http://localhost:3001");
});
test("Codespaces demo forwarding trusts only the explicitly configured port and exact origin", () => {
  const tunnel = {
    CODESPACES: "true",
    CODESPACE_NAME: "fictional-demo",
    GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: "app.github.dev",
    PORT: "3001",
  };
  const origin = new URL(demoOrigin(tunnel)),
    headers = new Headers({
      host: "localhost:3001",
      origin: "https://localhost:3001",
      "sec-fetch-site": "same-origin",
      "x-floorwork-origin": origin.origin,
    });
  assert(requestAllowed(headers, "/api/account", origin, tunnel));
  assert(requestOriginAllowed(headers, origin, tunnel));
  headers.set("host", "localhost:3000");
  assert.equal(requestAllowed(headers, "/api/account", origin, tunnel), false);
  headers.set("host", "localhost:3001");
  headers.set("x-floorwork-origin", "https://other-3001.app.github.dev");
  assert.equal(requestOriginAllowed(headers, origin, tunnel), false);
  assert.equal(
    requestAllowed(new Headers({ host: "localhost:3001" }), "/", origin, { ...tunnel, PORT: "3000" }),
    false
  );
});
