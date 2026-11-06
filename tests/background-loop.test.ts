import { test } from "node:test";
import assert from "node:assert/strict";
import { periodicJob } from "../lib/background-loop";
test("a blocked or failing email job cannot block SQL polling or shift checks", async () => {
  let stop = false,
    sqlCalls = 0,
    shiftCalls = 0,
    emailCalls = 0,
    errors = 0,
    inflight = 0,
    maxInflight = 0;
  let release!: () => void;
  const mailBlocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const sql = periodicJob(
    async () => {
      inflight++;
      maxInflight = Math.max(maxInflight, inflight);
      sqlCalls++;
      inflight--;
      if (sqlCalls >= 3) {
        stop = true;
        release();
      }
    },
    3,
    () => stop,
    () => assert.fail("SQL should not fail"),
  );
  const shifts = periodicJob(
    async () => {
      shiftCalls++;
    },
    3,
    () => stop,
    () => assert.fail("Shift checks should not fail"),
  );
  const email = periodicJob(
    async () => {
      emailCalls++;
      await mailBlocked;
      throw Error("Relay failed");
    },
    3,
    () => stop,
    () => {
      errors++;
    },
  );
  await Promise.all([sql, shifts, email]);
  assert.equal(sqlCalls, 3);
  assert(shiftCalls >= 1);
  assert.equal(emailCalls, 1);
  assert.equal(errors, 1);
  assert.equal(maxInflight, 1);
});
