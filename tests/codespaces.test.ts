import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const {
  configuration,
  prepareEnvironment,
} = require("../scripts/codespaces.cjs");
test("Codespaces uses the exact private preview origin and internal database", () => {
  const value = configuration({
    CODESPACES: "true",
    CODESPACE_NAME: "sample-name-123",
    GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: "app.github.dev",
    APP_ORIGIN: "https://unrelated.example",
    DATABASE_URL: "postgresql://company/production",
  });
  assert.equal(value.APP_ORIGIN, "https://sample-name-123-3000.app.github.dev");
  assert.equal(
    value.DATABASE_URL,
    "postgresql://work:work@db:5432/work_rebuild",
  );
  assert.equal(value.DATABASE_SETUP_URL, value.DATABASE_URL);
});
test("Codespaces refuses missing context and malformed preview hosts", () => {
  assert.throws(() => configuration({}));
  for (const domain of [
    "app.github.dev/path",
    "evil.example:443",
    "app.github.dev@evil.example",
    "",
  ]) {
    assert.throws(() =>
      configuration({
        CODESPACES: "true",
        CODESPACE_NAME: "test",
        GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: domain,
      }),
    );
  }
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { configuredOrigin, requestAllowed } from "../lib/request-policy";
test("Codespaces preserves private files, refreshes the preview and refuses another database", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "floorwork-codespaces-"));
  const source = {
    CODESPACES: "true",
    CODESPACE_NAME: "pilot-1",
    GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: "app.github.dev",
  };
  try {
    fs.writeFileSync(
      path.join(root, ".env"),
      "PRIVATE_WINDOWS_SETTING=keep-me\n",
    );
    const file = path.join(root, ".env.codespaces");
    const privateText = 'SMTP_PASS="contains spaces and # punctuation"\n';
    fs.writeFileSync(file, privateText);
    const first = prepareEnvironment(root, source);
    assert.equal(first.SMTP_PASS, "contains spaces and # punctuation");
    assert(fs.readFileSync(file, "utf8").startsWith(privateText));
    const second = prepareEnvironment(root, {
      ...source,
      CODESPACE_NAME: "pilot-2",
    });
    assert.equal(second.APP_ORIGIN, "https://pilot-2-3000.app.github.dev");
    assert.equal(
      fs.readFileSync(path.join(root, ".env"), "utf8"),
      "PRIVATE_WINDOWS_SETTING=keep-me\n",
    );
    const origin = configuredOrigin(second.APP_ORIGIN);
    assert(
      requestAllowed(
        new Headers({ host: origin.host }),
        "/api/account",
        origin,
      ),
    );
    assert(
      !requestAllowed(
        new Headers({
          host: "localhost:3000",
          "x-forwarded-host": origin.host,
        }),
        "/api/account",
        origin,
      ),
    );
    fs.appendFileSync(file, "DATABASE_URL=postgresql://company/production\n");
    const before = fs.readFileSync(file, "utf8");
    assert.throws(() => prepareEnvironment(root, source), /different database/);
    assert.equal(fs.readFileSync(file, "utf8"), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
