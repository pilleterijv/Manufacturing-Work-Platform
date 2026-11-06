// Run against a local production app. Creates synthetic fixtures and removes them afterwards.
require("tsx/cjs");
require("dotenv").config({ quiet: true });
const { randomUUID } = require("node:crypto"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  path = require("node:path");
const { chromium } = require("playwright"),
  { db } = require("../lib/db.ts"),
  { hashPassword } = require("../lib/security.ts"),
  { methodology } = require("../lib/problem-rules.ts");
const origin = process.env.APP_URL || "http://localhost:3000",
  out = path.resolve(process.env.GALLERY_OUTPUT || "docs/screenshots/gallery");
const users = [],
  equipment = [],
  standards = [],
  content = [],
  reasons = [],
  problemIds = [],
  shotList = [];
let browser;
const suffix = randomUUID().slice(0, 8),
  password = `Gallery ${randomUUID()}!`;
async function post(context, url, data) {
  const r = await context.request.post(origin + url, {
    headers: { Origin: origin },
    data,
  });
  assert.equal(r.status(), 200, await r.text());
  return r.json();
}
async function screenshot(page, id, title, description) {
  await page.evaluate(() => {
    let b = document.getElementById("demo-data-label");
    if (!b) {
      b = document.createElement("div");
      b.id = "demo-data-label";
      b.textContent = "SAMPLE DATA · PRODUCT WALKTHROUGH";
      b.style.cssText =
        "position:fixed;bottom:12px;right:16px;z-index:9999;padding:7px 12px;background:#173c3d;color:white;border:1px solid #91a9a1;border-radius:6px;font:10px Arial;letter-spacing:1px;pointer-events:none";
      document.body.appendChild(b);
    }
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(out, id + ".png"), fullPage: true });
  if (["18-problem-2d", "19-problem-4d", "20-problem-8d"].includes(id))
    await page.locator(".problem-editor").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(out, id + "-preview.png") });
  shotList.push({ id, title, description });
  console.log("Captured " + id);
}
async function main() {
  assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
  assert(
    !process.env.AZURE_STORAGE_CONNECTION_STRING,
    "Gallery must use isolated local storage",
  );
  await fs.mkdir(out, { recursive: true });
  const hash = await hashPassword(password);
  for (const [role, name] of [
    ["Admin", "Jordan Demo"],
    ["Manager", "Avery Leader"],
    ["DL/TL", "Taylor Supervisor"],
    ["Operator", "Alex Operator"],
  ])
    users.push(
      await db.user.create({
        data: {
          username: `demo-${users.length}-${suffix}`,
          name,
          role,
          password: hash,
          mustChange: false,
        },
      }),
    );
  for (const [name, department, line] of [
    ["Packing station 02", "Assembly", "Line A"],
    ["CNC machining cell 01", "Machining", "Line B"],
    ["Final inspection bench", "Quality", "Line C"],
  ])
    equipment.push(
      await db.equipment.create({
        data: {
          name,
          department,
          line,
          plant: "Main plant",
          area: "Production",
        },
      }),
    );
  const steps = [
    {
      id: "guard",
      text: "Verify guards and emergency stop are ready",
      photo: false,
    },
    {
      id: "labels",
      text: "Confirm label position against the approved sample",
      photo: true,
    },
    {
      id: "piece",
      text: "Inspect and approve the first packed unit",
      photo: false,
    },
  ];
  for (let i = 0; i < 2; i++)
    standards.push(
      await db.standard.create({
        data: {
          family: randomUUID(),
          revision: 1,
          title: i
            ? "Machining first-piece verification"
            : "Packing quality verification",
          equipmentId: equipment[i].id,
          target: 45,
          tolerance: 10,
          steps,
        },
      }),
    );
  for (const [kind, title, body, ei] of [
    [
      "video",
      "Standard work: first-piece inspection",
      "https://player.vimeo.com/video/76979871",
      0,
    ],
    [
      "video",
      "Machine setup and changeover basics",
      "https://player.vimeo.com/video/76979871",
      1,
    ],
    [
      "guide",
      "Label alignment: checks before restart",
      "1. Stop the station and follow the approved isolation procedure.\n2. Inspect the label roll, guides and sensor against the approved setup.\n3. Ask the team leader to verify alignment.\n4. Inspect the first piece before restarting.",
      0,
    ],
    [
      "guide",
      "Dimensional variation: first checks",
      "1. Follow the approved safe stop procedure.\n2. Confirm the drawing revision and measuring instrument.\n3. Check tool condition and the approved centerline settings.\n4. Escalate repeated variation to the department leader.",
      1,
    ],
  ])
    content.push(
      await db.content.create({
        data: { kind, title, body, equipmentId: equipment[ei].id },
      }),
    );
  const now = new Date(),
    ago = (days, minutes = 0) =>
      new Date(+now - days * 86400000 - minutes * 60000);
  for (let i = 0; i < 24; i++) {
    const s = standards[i % 2],
      eq = equipment[i % 2],
      kind = i % 4 === 0 ? "study" : i % 4 === 1 ? "audit" : "run",
      at = ago(i % 12, 20 + i),
      cycles = [
        {
          element: "Position label",
          seconds: 12 + (i % 4),
          at: at.toISOString(),
        },
        {
          element: "Inspect and pack",
          seconds: 26 + (i % 6),
          at: at.toISOString(),
        },
      ];
    await db.record.create({
      data: {
        kind,
        userId: users[2].id,
        standardId: kind === "study" ? null : s.id,
        created: at,
        data: {
          title: kind === "study" ? "Label application baseline" : s.title,
          equipmentId: eq.id,
          equipmentSnapshot: eq,
          ...(kind === "study"
            ? {}
            : {
                snapshot: { ...s, equipment: eq },
                responses: steps.map((step, j) => ({
                  stepId: step.id,
                  answer: !(i % 7 === 0 && j === 1),
                  comment:
                    i % 7 === 0 && j === 1
                      ? "Label guide adjusted before restart"
                      : "",
                  photo: null,
                })),
                durationSeconds: 40 + (i % 12),
                operator: "Alex Operator",
                followUp: i % 7 === 0,
              }),
          ...(kind !== "run" ? { cycles } : {}),
        },
      },
    });
  }
  for (const name of [
    "Material shortage",
    "Tool adjustment",
    "Label alignment",
  ])
    reasons.push(
      await db.downtimeReason.upsert({
        where: { name },
        create: { name },
        update: {},
      }),
    );
  const config = (
    await db.setting.findUniqueOrThrow({ where: { key: "shifts" } })
  ).value;
  for (let i = 0; i < 6; i++)
    await db.downtime.create({
      data: {
        equipmentId: equipment[i % 2].id,
        equipmentSnapshot: equipment[i % 2],
        reasonId: reasons[i % 3].id,
        reasonName: reasons[i % 3].name,
        shiftConfig: config,
        startedAt: ago(i + 1, 45),
        endedAt: ago(i + 1, 10 + i),
        startedBy: users[3].id,
        stoppedBy: users[2].id,
      },
    });
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1050 },
      timezoneId: "America/Chicago",
      serviceWorkers: "block",
    }),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin);
  await page
    .getByRole("heading", { name: "Welcome back", exact: true })
    .waitFor();
  await screenshot(
    page,
    "01-sign-in",
    "Individual sign-in",
    "Local individual accounts, remembered sessions and password recovery through an administrator.",
  );
  await post(context, "/api/account", {
    action: "login",
    username: users[0].username,
    password,
    remember: false,
  });
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const due = new Date(+now + 7 * 86400000).toISOString().slice(0, 10);
  await post(context, "/api/operations", {
    action: "idea",
    title: "Add a visual guide for label changeovers",
    equipmentId: equipment[0].id,
    currentState:
      "Operators reposition the label guide by eye. First-piece rejects occur after changeover.",
    proposal:
      "Pilot a marked guide and approved setup photo on Line A. Compare first-piece rejects over two weeks.",
    process: "Label changeover",
    dueDate: due,
    submitterId: users[3].id,
    pilotId: users[0].id,
    validatorId: users[1].id,
    participantIds: [users[2].id],
  });
  for (const method of ["2D", "4D", "8D"]) {
    const answers = Object.fromEntries(
      methodology[method].sections.flatMap((s) =>
        s.fields.map(([key]) => [
          key,
          {
            problem:
              "Labels drift after changeover; 5 of 30 first pieces need rework.",
            rootCause:
              "The guide stop is worn and its setup reference is unclear.",
            why1: "The guide moves during label application.",
            why2: "The stop no longer holds its reference position.",
            why3: "Wear was not identified during routine checks.",
            why4: "The check does not specify a wear limit.",
            why5: "The maintenance standard lacks a measurable acceptance criterion.",
            standardExists: "Yes",
            standardClear: "No",
            trained: "Yes",
            effectiveness:
              "Verify 30 consecutive first pieces and review recurrence after 7 days.",
            corrective:
              "Replace the guide stop and add a measurable setup reference.",
            preventive:
              "Update maintenance criteria and reapply to similar packing stations.",
            recognition:
              "Recognize the operator and maintenance team at the shift meeting.",
            correction:
              "Inspect first pieces and hold affected material for Quality review.",
            emergency:
              "Isolate affected material and protect the downstream process.",
            customer:
              "Internal assembly customer; no external shipment released.",
            product: "Packing station 02 / labeled assembly",
            scope: "Line A changeovers; 30 first pieces inspected.",
            fishbone:
              "Machine: worn stop. Method: unclear setup reference. Measurement: no wear acceptance limit.",
            escape:
              "The first-piece check did not include a measured guide position.",
            implementation:
              "Fit the new stop; verify the setup reference with Production and Quality.",
            who: "Packing operators and final inspection",
            what: "Misaligned labels after changeover",
            when: "First production run after label changeover",
            where: "Main plant / Assembly / Line A",
            howMuch: "5 of 30 first pieces required rework",
          }[key] || "Production, Quality and Maintenance review documented.",
        ]),
      ),
    );
    const p = await post(context, "/api/problems", {
      action: "create",
      title:
        method === "2D"
          ? "Restore label guide alignment"
          : method === "4D"
            ? "Prevent recurring label drift"
            : "Eliminate repeat changeover defects",
      method,
      equipmentId: equipment[0].id,
      occurredOn: day,
      reportedBy: users[3].name,
      ownerId: users[0].id,
      reviewerId: users[1].id,
      team: "Jordan Demo · Production; Avery Leader · Quality; Taylor Supervisor · Maintenance",
      dueDate: due,
      previousId: problemIds.at(-1) || null,
      answers,
    });
    problemIds.push(p.id);
    let d = await (
      await context.request.get(origin + "/api/problems?id=" + p.id)
    ).json();
    await post(context, "/api/problems", {
      action: "addAction",
      id: p.id,
      version: d.version,
      type: "Corrective",
      title: "Replace guide stop and verify 30 first pieces",
      ownerId: users[0].id,
      dueDate: due,
    });
    if (method !== "2D") {
      d = await (
        await context.request.get(origin + "/api/problems?id=" + p.id)
      ).json();
      await post(context, "/api/problems", {
        action: "addAction",
        id: p.id,
        version: d.version,
        type: "Checkpoint",
        checkpoint: "SOP/JI",
        title: "Update setup instruction with measured guide position",
        ownerId: users[2].id,
        dueDate: due,
      });
    }
  }
  await page.reload();
  await page
    .getByRole("heading", { name: "Welcome, Jordan.", exact: true })
    .waitFor();
  await page
    .getByRole("heading", { name: "Whole-floor performance", exact: true })
    .waitFor();
  await screenshot(
    page,
    "02-dashboard",
    "Workspace dashboard",
    "Role-aware launchpad for all sections, overall/department reporting, record totals and recent activity.",
  );
  async function go(tab, heading) {
    await page
      .locator("nav")
      .getByRole("button", { name: tab, exact: false })
      .click();
    if (heading)
      await page.getByRole("heading", { name: heading, exact: true }).waitFor();
    await page.waitForTimeout(350);
  }
  await go("Standard work", "Start a verification");
  await page
    .getByLabel("Standard work", { exact: true })
    .selectOption(standards[0].id);
  await page
    .getByRole("button", { name: "✓ Yes", exact: true })
    .first()
    .click();
  await page
    .getByLabel("Comment", { exact: true })
    .first()
    .fill("Guard and emergency stop verified before start-up.");
  await screenshot(
    page,
    "03-standard-work",
    "Standard work: checklist and evidence",
    "Revision-specific Yes/No checks, camera/file evidence, comments and completed verification history.",
  );
  await page.getByText("View record", { exact: true }).first().click();
  await screenshot(
    page,
    "04-work-history",
    "Saved verification details",
    "Expand a saved record to inspect the original revision, answers, comments and evidence references.",
  );
  await go("Time studies", "New time study");
  await page
    .getByLabel("Study name", { exact: true })
    .fill("Label application: changeover baseline");
  await page
    .getByLabel("Equipment", { exact: true })
    .selectOption(equipment[0].id);
  await page.getByLabel("Work element", { exact: true }).fill("Position label");
  await page.getByRole("button", { name: "Start cycle", exact: true }).click();
  await page.waitForTimeout(1200);
  await page
    .getByRole("button", { name: "Stop & record cycle", exact: true })
    .click();
  await screenshot(
    page,
    "05-time-study",
    "Time studies: stopwatch and observations",
    "Name work elements, record repeated stopwatch observations, review statistics and save raw timings. The visible short observation is a demonstration.",
  );
  await go("Supervisor audits", "New standard work audit");
  await page
    .getByLabel("Standard work", { exact: true })
    .selectOption(standards[0].id);
  await page.getByLabel("Operator being audited").fill("Alex Operator");
  await page
    .getByRole("button", { name: "✓ Yes", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Start cycle", exact: true }).click();
  await page.waitForTimeout(1100);
  await page
    .getByRole("button", { name: "Stop & record cycle", exact: true })
    .click();
  await screenshot(
    page,
    "06-supervisor-audit",
    "Supervisor audits: checks and cycle timing",
    "Identify the operator, verify the standard, collect evidence and compare actual cycles against target and tolerance.",
  );
  await go("Training", "Add training video");
  await screenshot(
    page,
    "07-training",
    "Training library and video editor",
    "Search equipment-linked training, open linked YouTube/Vimeo playback and add resources. Live provider playback is not demonstrated.",
  );
  await go("Troubleshooting", "Add troubleshooting guide");
  await screenshot(
    page,
    "08-troubleshooting",
    "Troubleshooting library",
    "Search readable equipment-specific instructions and add or archive guides.",
  );
  await go("Analytics", "Time study statistics");
  await screenshot(
    page,
    "09-analytics",
    "Analytics and detailed statistics",
    "Verification totals, No-answer rates, completion times, audit follow-ups, timing variation and detailed records.",
  );
  await go("Downtime", "Track a stoppage");
  await require("../tests/helpers/downtime.cjs").selectDowntimeMachine(
    page,
    equipment[0],
  );
  await page
    .getByLabel("Downtime reason", { exact: true })
    .selectOption(reasons[2].id);
  await screenshot(
    page,
    "10-downtime-ready",
    "Downtime: ready to start",
    "Choose the machine and reason. Admins also manage reasons, timer availability and shift schedules.",
  );
  await page
    .getByRole("button", { name: "Start downtime", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Stop downtime", exact: true })
    .waitFor();
  await screenshot(
    page,
    "11-downtime-running",
    "Downtime: shared timer running",
    "An actual started event is persisted by the server and survives reload. Stop the timer when production resumes.",
  );
  await page
    .getByRole("button", { name: "Stop downtime", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start downtime", exact: true })
    .waitFor();
  await screenshot(
    page,
    "12-downtime-history",
    "Downtime: stopped event and shift history",
    "Stopped records retain their duration, reason, equipment, shift schedule and starter/stopper identities.",
  );
  await go("Leadership dashboard", "Whole-floor performance");
  await screenshot(
    page,
    "13-leadership-overall",
    "Leadership: overall performance",
    "Complete date-filtered reporting across work, audits, studies, downtime, ideas, problem solving and current resource libraries.",
  );
  await page.getByLabel("Leadership department").selectOption("Assembly");
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Assembly — section dashboard", exact: true })
    .waitFor();
  await screenshot(
    page,
    "14-leadership-department",
    "Leadership: department performance",
    "The same dashboard scoped to Assembly, with department totals, downtime reasons, shift losses and an Excel export.",
  );
  await go("Improvement ideas", "Submit an improvement idea");
  await page
    .getByLabel("Idea title", { exact: true })
    .fill("Pilot a first-piece photo reference");
  await page
    .getByLabel("Equipment", { exact: true })
    .selectOption(equipment[0].id);
  await page
    .getByLabel("Current state", { exact: true })
    .fill("Operators compare the first piece from memory.");
  await page
    .getByLabel("Proposed improvement", { exact: true })
    .fill(
      "Add an approved photo reference at the station and compare rework before and after the pilot.",
    );
  await page.getByLabel("Pilot", { exact: true }).selectOption(users[0].id);
  await page.getByLabel("Validator", { exact: true }).selectOption(users[1].id);
  await page.getByLabel("Due date", { exact: true }).fill(due);
  await page
    .getByRole("checkbox", {
      name: "Participant Taylor Supervisor",
      exact: true,
    })
    .check();
  await screenshot(
    page,
    "15-improvement-ideas",
    "Improvement ideas: submit and follow progress",
    "Assign submitter, pilot, validator and participants; describe current/proposed states, location and due date. Existing ideas appear in the pipeline below.",
  );
  await go("Notifications", "Your messages");
  await screenshot(
    page,
    "16-notifications",
    "Pilot notifications",
    "A real in-app assignment generated when the sample idea was created. Open the idea or mark the private message as read.",
  );
  await go("Problem solving", "Problem-solving records");
  await screenshot(
    page,
    "17-problem-solving",
    "Problem solving: methodology and record dashboard",
    "Workbook-based 2D / 4D / 8D selection guidance, department filters, open/closed counts, action totals, overdue follow-ups and the record viewer. Exact Microsoft Forms layouts await accessible references.",
  );
  for (let i = 0; i < 3; i++) {
    const method = ["2D", "4D", "8D"][i];
    const detail = await (
      await context.request.get(origin + "/api/problems?id=" + problemIds[i])
    ).json();
    await page
      .getByRole("row")
      .filter({ hasText: detail.reference })
      .getByRole("button", { name: "View / update", exact: true })
      .click();
    await page
      .getByRole("heading", { name: detail.reference, exact: true })
      .waitFor();
    await screenshot(
      page,
      `${18 + i}-problem-${method.toLowerCase()}`,
      `${method} problem-solving record`,
      `${methodology[method].description}. Method-specific evidence fields, assigned facilitator/reviewer, due date, tracked actions and change history.`,
    );
  }
  await page
    .getByRole("button", { name: "Action update portal", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Open actions & checkpoints", exact: true })
    .waitFor();
  await page
    .getByText("Replace guide stop and verify 30 first pieces", { exact: true })
    .first()
    .waitFor();
  await screenshot(
    page,
    "21-action-portal",
    "Problem solving: action update portal",
    "One follow-up queue for open corrective actions and checkpoints. Authorized owners/managers submit status and evidence comments; completed items remain in record history.",
  );
  await go("Manage", "Standard work editor");
  await page.locator(".page select").first().selectOption(standards[0].id);
  await page
    .getByRole("button", { name: "View revision history", exact: true })
    .click();
  await page.locator(".revision-history details").first().waitFor();
  await screenshot(
    page,
    "22-manage",
    "Equipment and standard management",
    "Create equipment hierarchies, author Yes/No steps, require photos, set targets/tolerance and publish immutable standard revisions.",
  );
  await go("Accounts", "Create individual account");
  await screenshot(
    page,
    "23-accounts",
    "Account administration",
    "Create or update individual users, assign a role, reset access and deactivate accounts. No sample credentials are included in this gallery.",
  );
  await go("Permissions");
  await page.getByText("problems", { exact: true }).first().waitFor();
  await screenshot(
    page,
    "24-permissions",
    "Role permissions",
    "Configure server-enforced grants for each role, including the new Problem Solving section.",
  );
  await go("My account");
  await page
    .getByRole("button", { name: /password/i })
    .first()
    .waitFor();
  await screenshot(
    page,
    "25-my-account",
    "My account and session controls",
    "Change your password and revoke other remembered sessions.",
  );
  await go("Overview", "Welcome, Jordan.");
  await page
    .getByRole("heading", { name: "Whole-floor performance", exact: true })
    .waitFor();
  await page.setViewportSize({ width: 768, height: 1024 });
  await screenshot(
    page,
    "26-tablet-dashboard",
    "Tablet dashboard",
    "The actual overview at a 768-pixel tablet width, with touch controls and responsive section cards.",
  );
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot(
    page,
    "27-mobile-dashboard",
    "Mobile dashboard",
    "Single-column section cards and horizontally scrolling navigation on a phone-sized viewport.",
  );
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.deepEqual(
    errors,
    [],
    "No client-side exceptions during gallery capture",
  );
  await fs.writeFile(
    path.join(out, "manifest.json"),
    JSON.stringify(shotList, null, 2),
  );
  await fs.writeFile(path.join(out, "index.html"), await gallery(false));
  await fs.writeFile(
    path.join(out, "Floorwork-walkthrough.html"),
    await gallery(true),
  );
  const sharp = require("sharp");
  const thumbs = [];
  for (const s of shotList) {
    const b = await sharp(path.join(out, s.id + "-preview.png"))
      .resize({ width: 420, height: 307, fit: "cover", position: "top" })
      .toBuffer();
    thumbs.push(b);
  }
  const tiles = [];
  for (let i = 0; i < thumbs.length; i++) {
    const x = (i % 3) * 460 + 20,
      y = Math.floor(i / 3) * 365 + 70;
    tiles.push({ input: thumbs[i], left: x, top: y });
    const label = Buffer.from(
      `<svg width="430" height="40"><text x="0" y="23" font-family="Arial" font-size="15" fill="#173c3d">${shotList[i].title.replace(/&/g, "&amp;")}</text></svg>`,
    );
    tiles.push({ input: label, left: x, top: y + 310 });
  }
  const top = Buffer.from(
    '<svg width="1380" height="60"><text x="20" y="36" font-family="Arial" font-size="25" fill="#173c3d">Floorwork · all sections · sample data walkthrough</text></svg>',
  );
  await sharp({
    create: {
      width: 1380,
      height: Math.ceil(thumbs.length / 3) * 365 + 80,
      channels: 3,
      background: "#f5f6f2",
    },
  })
    .composite([{ input: top, left: 0, top: 0 }, ...tiles])
    .png()
    .toFile(path.join(out, "Floorwork-all-sections.png"));
  console.log(`Gallery complete: ${shotList.length} screenshots; ${out}`);
}
async function gallery(embed) {
  let cards = "";
  for (const [i, s] of shotList.entries()) {
    const src = embed
      ? "data:image/png;base64," +
        (await fs.readFile(path.join(out, s.id + ".png"))).toString("base64")
      : s.id + ".png";
    cards += `<article id="${s.id}"><header><span>${String(i + 1).padStart(2, "0")}</span><div><h2>${s.title}</h2><p>${s.description}</p></div></header><a href="${src}" target="_blank"><img loading="lazy" src="${src}" alt="${s.title}"></a></article>`;
  }
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Floorwork — product walkthrough</title><style>*{box-sizing:border-box}body{margin:0;background:#f5f6f2;color:#173c3d;font:16px/1.6 Arial}main{max-width:1250px;margin:auto;padding:36px 24px}.intro{background:#173c3d;color:#eef2de;border-radius:16px;padding:40px;margin-bottom:24px}.intro h1{font-size:42px;line-height:1.1;margin:12px 0}.intro p{max-width:850px;color:#d4e0d8}nav{display:flex;flex-wrap:wrap;gap:8px;margin:20px 0}nav a{color:#173c3d;background:white;border:1px solid #dbe3d9;padding:7px 12px;border-radius:6px;text-decoration:none;font-size:13px}article{background:white;border:1px solid #dbe3d9;border-radius:12px;margin:32px 0;overflow:hidden;scroll-margin-top:12px}article header{display:flex;gap:20px;padding:25px}header>span{color:#a96b42;font-size:27px}h2{margin:0;font-size:23px}header p{margin:6px 0;color:#627570}img{display:block;width:100%;height:auto;border-top:1px solid #dbe3d9}footer{padding:30px;color:#627570}.eyebrow{letter-spacing:3px;font-size:12px}</style><main><section class="intro"><span class="eyebrow">MANUFACTURING WORK PLATFORM</span><h1>Your floor, in focus.</h1><p>A walkthrough of the running Floorwork application: dashboard, operations, improvement and problem solving, reporting and administration.</p><p><strong>All data is synthetic.</strong> These are browser screenshots, not design mockups. The 2D/4D/8D section follows your workbook; the private Microsoft Forms design pages could not be read, so their exact layout is pending. Video playback depends on the linked provider. No Microsoft Forms, Power Automate, email or Entra SSO integration is configured by this work.</p></section><nav>${shotList.map((s) => `<a href="#${s.id}">${s.title}</a>`).join("")}</nav>${cards}<footer>Captured from the local production build on ${new Date().toISOString().slice(0, 10)}. Full-page screenshots include forms and histories below the first screen. Sample fixture records and accounts are removed after capture.</footer></main></html>`;
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    const ids = users.map((u) => u.id),
      eqids = equipment.map((e) => e.id);
    await db.problemAction.deleteMany({
      where: { problemId: { in: problemIds } },
    });
    await db.problem.updateMany({
      where: { id: { in: problemIds } },
      data: { previousId: null },
    });
    await db.problem.deleteMany({ where: { id: { in: problemIds } } });
    await db.notification.deleteMany({ where: { userId: { in: ids } } });
    await db.ideaParticipant.deleteMany({
      where: { idea: { createdBy: { in: ids } } },
    });
    await db.idea.deleteMany({ where: { createdBy: { in: ids } } });
    await db.downtime.deleteMany({ where: { equipmentId: { in: eqids } } });
    await db.record.deleteMany({ where: { userId: { in: ids } } });
    await db.standard.deleteMany({
      where: { id: { in: standards.map((s) => s.id) } },
    });
    await db.content.deleteMany({
      where: { id: { in: content.map((c) => c.id) } },
    });
    await db.equipment.deleteMany({ where: { id: { in: eqids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });
