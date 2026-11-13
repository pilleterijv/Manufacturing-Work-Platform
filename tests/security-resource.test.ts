import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, open, rm } from "node:fs/promises";
import path from "node:path";
import { readBodyBytes, readBoundedResponseJson } from "../lib/http-body";
import { videoRange } from "../lib/media-range";
import { openVideo } from "../lib/storage";
import { ConnectionCache } from "../lib/connection-cache";
import { securityEvent } from "../lib/security-events";
import { verifyPassword } from "../lib/passwords";
test("upstream/request bodies enforce actual size and deadline, cancelling readers", async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(new Uint8Array(20));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(
    () => readBodyBytes(new Response(stream), 10),
    /too large/,
  );
  assert(cancelled);
  const slow = new Response(
    new ReadableStream({
      cancel() {
        cancelled = true;
      },
    }),
  );
  await assert.rejects(() => readBodyBytes(slow, 100, 15), /timed out/);
  assert.deepEqual(await readBoundedResponseJson(new Response('{"ok":true}')), {
    ok: true,
  });
  await assert.rejects(
    () => readBoundedResponseJson(new Response("x".repeat(100)), 20),
    /too large/,
  );
});
test("video ranges reject malformed, excessive or unsafe values and handle suffix/open-ended ranges", () => {
  assert.deepEqual(videoRange("bytes=10-20", 100), {
    start: 10,
    end: 20,
    partial: true,
  });
  assert.deepEqual(videoRange("bytes=-10", 100), {
    start: 90,
    end: 99,
    partial: true,
  });
  assert.deepEqual(videoRange("bytes=95-", 100), {
    start: 95,
    end: 99,
    partial: true,
  });
  assert.deepEqual(videoRange(null, 100), {
    start: 0,
    end: 99,
    partial: false,
  });
  for (const s of [
    "bytes=100-",
    "bytes=20-10",
    "bytes=-0",
    "bytes=-",
    "bytes=0-1,3-4",
    "bytes=999999999999999999999-",
    "bytes=" + "0".repeat(110) + "-",
  ])
    assert.equal(videoRange(s, 100), null);
});
test("a range stream reads only selected bytes and closes on cancellation", async () => {
  assert(
    !process.env.AZURE_STORAGE_CONNECTION_STRING,
    "Only local fixtures may run this test",
  );
  const root = process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads"),
    id = randomUUID(),
    file = path.join(root, id + ".video");
  await mkdir(root, { recursive: true });
  const handle = await open(file, "wx", 0o600);
  try {
    await handle.truncate(32 * 1024 * 1024);
    await handle.write(Buffer.from("range-marker"), 0, 12, 20);
    await handle.close();
    const opened = await openVideo(id);
    assert.equal(opened.size, 32 * 1024 * 1024);
    const body = await opened.stream(20, 31);
    const output = Buffer.from(await new Response(body).arrayBuffer());
    assert.equal(output.toString(), "range-marker");
    const again = await openVideo(id);
    const stream = await again.stream(0, again.size - 1);
    const reader = stream.getReader();
    const first = await reader.read();
    assert(first.value!.byteLength <= 64 * 1024);
    await reader.cancel();
    reader.releaseLock();
  } finally {
    await handle.close().catch(() => {});
    await rm(file, { force: true });
  }
});
test("bounded connection cache reuses in-flight pools and evicts failures/unused credentials", async () => {
  const closed: string[] = [];
  const cache = new ConnectionCache<{ name: string }>(async (v) => {
    closed.push(v.name);
  }, 2);
  let creates = 0;
  const make = async () => {
    creates++;
    return { name: "first" };
  };
  const [a, b] = await Promise.all([
    cache.get("key", make),
    cache.get("key", make),
  ]);
  assert.equal(creates, 1);
  assert.equal(a, b);
  await cache.get("other", async () => ({ name: "second" }));
  await assert.rejects(() => cache.get("third", make), /limit/);
  await cache.retain(new Set(["key"]));
  assert.deepEqual(closed, ["second"]);
  await assert.rejects(
    () =>
      cache.get("bad", async () => {
        throw Error("failure");
      }),
    /failure/,
  );
  await cache.get("bad", async () => ({ name: "recovered" }));
  await cache.close();
  assert.equal(closed.length, 3);
});
test("security events discard secret-bearing fields and malformed password hashes fail safely", async () => {
  const original = console.info;
  const logs: string[] = [];
  console.info = (v) => logs.push(v);
  try {
    securityEvent("login_failed", {
      actorId: "password=secret\nforged",
      subjectHash: "token=secret",
      scope: "user@example.com",
    } as any);
  } finally {
    console.info = original;
  }
  assert.equal(logs.length, 1);
  assert(!logs[0].includes("secret"));
  assert(!logs[0].includes("example"));
  assert.equal(JSON.parse(logs[0]).event, "login_failed");
  for (const hash of [
    "salt:" + "x".repeat(128),
    "z".repeat(32) + ":" + "0".repeat(128),
    "short",
    "",
  ])
    assert.equal(await verifyPassword("valid length password", hash), false);
});
