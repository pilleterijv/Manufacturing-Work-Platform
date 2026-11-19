// Read-policy evidence only: current scope helpers and existing endpoints.
// The harness creates and drops a randomly named local test database.
require("tsx/cjs");
require("dotenv").config({ quiet: true });
const { db } = require("../lib/db.ts"),
  { equipmentIds, recordScope } = require("../lib/location-access.ts"),
  { hashPassword } = require("../lib/security.ts"),
  { randomUUID } = require("node:crypto"),
  { chromium } = require("playwright"),
  assert = require("node:assert/strict");
let browser;
async function main() {
  const origin = process.env.APP_URL;
  assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
  assert(
    /^floorwork_roles_[a-f0-9]{32}$/.test(
      new URL(process.env.DATABASE_URL).pathname.slice(1),
    ),
  );
  const tag = randomUUID().slice(0, 8),
    plant = "History scope " + tag,
    password = "Fixture " + randomUUID() + "!",
    hash = await hashPassword(password),
    eq = [],
    users = [];
  for (const area of ["Compressing", "Coating"])
    eq.push(
      await db.equipment.create({
        data: {
          name: "Station " + area,
          plant,
          department: "Tableting",
          area,
          line: "",
        },
      }),
    );
  for (const [role, area] of [
    ["Operator", "Compressing"],
    ["Operator", "Compressing"],
    ["Manager", "Compressing"],
    ["Operator", "Coating"],
  ])
    users.push(
      await db.user.create({
        data: {
          username: "scope-" + tag + users.length,
          name: "Scope fixture " + users.length,
          role,
          password: hash,
          mustChange: false,
          workspaceAccess: {
            mode: "restricted",
            locations: [{ plant, department: "Tableting", area }],
            equipmentIds: [],
          },
        },
      }),
    );
  const standards = [];
  for (const e of eq)
    standards.push(
      await db.standard.create({
        data: {
          family: randomUUID(),
          revision: 1,
          title: e.name,
          equipmentId: e.id,
          target: 10,
          tolerance: 0,
          steps: [{ id: "check", text: "Check", photo: false }],
        },
      }),
    );
  const records = [];
  for (const [owner, si] of [
    [0, 0],
    [1, 0],
    [3, 1],
  ])
    records.push(
      await db.record.create({
        data: {
          kind: "run",
          userId: users[owner].id,
          standardId: standards[si].id,
          data: {
            snapshot: { ...standards[si], equipment: eq[si] },
            equipmentId: eq[si].id,
            responses: [
              {
                stepId: "check",
                answer: true,
                photo: null,
                comment: "Fixture",
              },
            ],
            durationSeconds: 5,
            followUp: false,
          },
        },
      }),
    );
  for (const user of users.slice(0, 3)) {
    const ids = await equipmentIds(user);
    assert.deepEqual(ids, [eq[0].id]);
    const visible = await db.record.findMany({ where: recordScope(ids) });
    assert(visible.some((r) => r.id === records[0].id));
    assert(visible.some((r) => r.id === records[1].id));
    assert(!visible.some((r) => r.id === records[2].id));
    assert.equal(
      await db.record.findFirst({
        where: { AND: [recordScope(ids), { id: records[2].id }] },
      }),
      null,
    );
  }
  assert.equal(
    (await db.record.findMany({ where: recordScope([]) })).length,
    0,
  );
  const policy = await db.policy.create({
    data: {
      role: "Read history " + tag,
      baseRole: "Operator",
      grants: ["history"],
    },
  });
  users.push(
    await db.user.create({
      data: {
        username: "reader-" + tag,
        name: "Read-only area reviewer",
        role: "Operator",
        customRole: policy.role,
        password: hash,
        mustChange: false,
        workspaceAccess: users[0].workspaceAccess,
      },
    }),
  );
  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const c = await browser.newContext({ serviceWorkers: "block" });
  const login = await c.request.post(origin + "/api/account", {
    headers: { Origin: origin },
    data: {
      action: "login",
      username: users[0].username,
      password,
      remember: false,
    },
  });
  assert.equal(login.status(), 200);
  const current = await (
    await c.request.get(origin + "/api/platform?view=work")
  ).json();
  assert(current.records.some((r) => r.id === records[0].id));
  assert(!current.records.some((r) => r.id === records[2].id));
  const denied = await c.request.post(origin + "/api/platform", {
    headers: { Origin: origin },
    data: {
      action: "standard",
      equipmentId: eq[0].id,
      title: "Forbidden edit",
      target: 10,
      tolerance: 0,
      steps: [{ id: "x", text: "x", photo: false }],
    },
  });
  assert.equal(denied.status(), 403);
  const sharp = require("sharp");
  const pixels = await sharp({
    create: { width: 2, height: 2, channels: 3, background: "#ff6600" },
  })
    .png()
    .toBuffer();
  async function contextFor(index) {
    const ctx = await browser.newContext({ serviceWorkers: "block" });
    const r = await ctx.request.post(origin + "/api/account", {
      headers: { Origin: origin },
      data: {
        action: "login",
        username: users[index].username,
        password,
        remember: false,
      },
    });
    assert.equal(r.status(), 200);
    return ctx;
  }
  const readerContext = await contextFor(4);
  const peer = await contextFor(1),
    outside = await contextFor(3);
  async function photo(ctx) {
    const r = await ctx.request.post(origin + "/api/photos", {
      headers: { Origin: origin },
      data: { image: "data:image/png;base64," + pixels.toString("base64") },
    });
    assert.equal(r.status(), 200);
    return (await r.json()).id;
  }
  const peerPhoto = await photo(peer),
    foreignPhoto = await photo(outside),
    privateDraft = await photo(peer);
  for (const [index, photoId] of [
    [1, peerPhoto],
    [2, foreignPhoto],
  ]) {
    const r = await db.record.findUniqueOrThrow({
      where: { id: records[index].id },
    });
    const d = r.data;
    d.responses[0].photo = photoId;
    await db.record.update({ where: { id: r.id }, data: { data: d } });
  }
  assert.equal(
    (await c.request.get(origin + "/api/photos/" + foreignPhoto)).status(),
    403,
  );
  assert.equal(
    (await c.request.get(origin + "/api/photos/" + privateDraft)).status(),
    403,
  );
  const anon = await browser.newContext();
  assert.equal(
    (await anon.request.get(origin + "/api/photos/" + peerPhoto)).status(),
    401,
  );
  // Candidate area policy: only an attached file in an authorized record is shareable.
  const {
    readableSubmissionWhere,
  } = require("../lib/submission-history-policy.ts");
  const { grants } = require("../lib/capabilities.ts");
  const g = await grants(users[4]);
  const authorized = readableSubmissionWhere(
    await equipmentIds(users[4]),
    g,
    users[4].id,
  );
  assert(
    await db.record.findFirst({
      where: {
        AND: [
          authorized,
          {
            data: {
              path: ["responses"],
              array_contains: [{ photo: peerPhoto }],
            },
          },
        ],
      },
    }),
  );
  assert.equal(
    await db.record.findFirst({
      where: {
        AND: [
          authorized,
          {
            data: {
              path: ["responses"],
              array_contains: [{ photo: foreignPhoto }],
            },
          },
        ],
      },
    }),
    null,
  );
  assert.equal(
    await db.record.findFirst({
      where: {
        AND: [
          authorized,
          {
            data: {
              path: ["responses"],
              array_contains: [{ photo: privateDraft }],
            },
          },
        ],
      },
    }),
    null,
  );
  // The new read-only endpoint reuses the verified equipment predicate.
  const shared = await (
    await readerContext.request.get(origin + "/api/submissions")
  ).json();
  assert(shared.items.some((r) => r.id === records[1].id));
  assert(!shared.items.some((r) => r.id === records[2].id));
  const directPeer = await readerContext.request.get(
    origin + "/api/submissions?source=record&id=" + records[1].id,
  );
  assert.equal(directPeer.status(), 200);
  const directOther = await readerContext.request.get(
    origin + "/api/submissions?source=record&id=" + records[2].id,
  );
  assert.equal(directOther.status(), 404);
  const mine = await (
    await readerContext.request.get(origin + "/api/submissions?scope=mine")
  ).json();
  assert.equal(mine.items.length, 0);
  assert.equal(
    (
      await readerContext.request.get(origin + "/api/photos/" + peerPhoto)
    ).status(),
    200,
  );
  assert.equal(
    (
      await readerContext.request.get(origin + "/api/photos/" + foreignPhoto)
    ).status(),
    403,
  );
  assert.equal(
    (
      await readerContext.request.get(origin + "/api/photos/" + privateDraft)
    ).status(),
    403,
  );
  const forbiddenRun = await readerContext.request.post(
    origin + "/api/platform",
    {
      headers: { Origin: origin },
      data: { action: "run", standardId: standards[0].id },
    },
  );
  assert.equal(forbiddenRun.status(), 403);
  assert.equal(
    (
      await readerContext.request.post(origin + "/api/submissions", {
        headers: { Origin: origin },
        data: { id: records[1].id },
      })
    ).status(),
    405,
  );
  const locations = [];
  for (const e of eq)
    locations.push(
      await db.location.create({
        data: {
          plant: e.plant,
          department: e.department,
          area: e.area,
          line: "",
        },
      }),
    );
  const audits = [];
  for (const [si, userIndex] of [
    [0, 1],
    [1, 3],
  ]) {
    const plan = await db.fiveSPlan.create({
      data: {
        locationId: locations[si].id,
        title: "5S scope check",
        questions: [],
        assigneeIds: [],
        createdBy: users[userIndex].id,
        history: [],
      },
    });
    audits.push(
      await db.fiveSAudit.create({
        data: {
          planId: plan.id,
          locationId: locations[si].id,
          userId: users[userIndex].id,
          snapshot: {
            title: "5S scope check",
            questions: [{ id: "q", text: "Clear aisle" }],
          },
          responses: [{ questionId: "q", score: 2 }],
          media: [],
          score: 2,
          maximum: 2,
        },
      }),
    );
  }
  assert.equal(
    (
      await readerContext.request.get(
        origin + "/api/submissions?source=fiveS&id=" + audits[0].id,
      )
    ).status(),
    200,
  );
  assert.equal(
    (
      await readerContext.request.get(
        origin + "/api/submissions?source=fiveS&id=" + audits[1].id,
      )
    ).status(),
    404,
  );
  await db.location.update({
    where: { id: locations[0].id },
    data: { active: false },
  });
  assert.equal(
    (
      await readerContext.request.get(
        origin + "/api/submissions?source=fiveS&id=" + audits[0].id,
      )
    ).status(),
    200,
  );
  for (const kind of ["pm", "cil", "centerline"]) {
    const saved = await db.record.create({
      data: {
        kind,
        userId: users[1].id,
        data: {
          equipmentId: eq[0].id,
          planSnapshot: { title: kind + " saved plan", steps: [] },
          responses: [],
          media: [{ id: peerPhoto, kind: "photo" }],
        },
      },
    });
    const response = await readerContext.request.get(
      origin + "/api/submissions?type=" + kind,
    );
    assert.equal(response.status(), 200);
    assert((await response.json()).items.some((item) => item.id === saved.id));
    assert.equal(
      (
        await readerContext.request.get(
          origin + "/api/submissions?source=record&id=" + saved.id,
        )
      ).status(),
      200,
    );
  }
  const fiveSearch = await readerContext.request.get(
    origin +
      "/api/submissions?" +
      new URLSearchParams({ type: "fiveS", search: users[1].name }),
  );
  assert.equal((await fiveSearch.json()).items.length, 1);
  // More than the old 100-entry cap, including identical timestamps.
  await db.record.createMany({
    data: Array.from({ length: 105 }, () => ({
      id: randomUUID(),
      kind: "run",
      userId: users[1].id,
      standardId: standards[0].id,
      created: new Date("2026-11-18T12:00:00Z"),
      data: {
        equipmentId: eq[0].id,
        snapshot: { title: "Archived checklist" },
        responses: [],
      },
    })),
  });
  const seen = new Set();
  let cursor = "";
  do {
    const res = await readerContext.request.get(
      origin + "/api/submissions?" + new URLSearchParams({ cursor }),
    );
    assert.equal(res.status(), 200);
    const page = await res.json();
    for (const item of page.items) {
      assert(!seen.has(item.id));
      seen.add(item.id);
    }
    cursor = page.hasMore ? page.cursor : "";
  } while (cursor);
  assert.equal(seen.size, 111);
  const page = await readerContext.newPage();
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto(origin);
  await page.getByRole("button", { name: /Submission history/ }).click();
  await page.getByRole("heading", { name: "Find submitted work" }).waitFor();
  await page
    .getByRole("button", { name: "View submitted details" })
    .first()
    .click();
  await page
    .getByText("Read-only saved submission", { exact: true })
    .first()
    .waitFor();
  const fs = require("node:fs");
  fs.mkdirSync("docs/screenshots/submission-history", { recursive: true });
  await page.screenshot({
    path: "docs/screenshots/submission-history/tablet.png",
    fullPage: false,
  });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await db.user.update({
    where: { id: users[4].id },
    data: {
      workspaceAccess: { mode: "restricted", locations: [], equipmentIds: [] },
    },
  });
  assert.equal(
    (
      await readerContext.request.get(
        origin + "/api/submissions?source=record&id=" + records[1].id,
      )
    ).status(),
    404,
  );
  assert.equal(
    (
      await readerContext.request.get(origin + "/api/photos/" + peerPhoto)
    ).status(),
    403,
  );
  console.log(
    "PASS scope evidence: existing equipment/record predicates return same-area submissions by both operators, deny direct cross-area IDs and empty assignments; existing API retains cross-area denial and Operator publishing is forbidden. Explicit read-only role shares attached same-area evidence, denies drafts, foreign scope and writes; pagination and tablet detail view pass.",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    await db.$disconnect();
  });
