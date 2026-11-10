import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  coversWorkspace,
  sharesWorkspace,
  protectedAccount,
  effectivePrivileges,
  effectiveGrants,
  delegationSchema,
} from "../lib/delegation-rules";
import {
  dashboardPreferences,
  dashboardPreferencesSchema,
} from "../lib/dashboard-preferences";
import { canOpenSection } from "../lib/navigation";
import { permittedHelp, guideAnswer } from "../lib/help-catalog";
import { answerNavigationQuestion } from "../lib/navigation-ai";
const access = (locations: any[] = [], equipmentIds: string[] = []) => ({
    mode: "restricted",
    locations,
    equipmentIds,
  }),
  a = { plant: "Plant", department: "Packing", area: null },
  machine = {
    id: randomUUID(),
    plant: "Plant",
    department: "Packing",
    area: "A",
  };
test("department delegation covers future machines but cannot grant future areas from today's machine list", () => {
  const manager = { role: "Manager", workspaceAccess: access([a]) };
  assert(
    coversWorkspace(manager, access([{ ...a, area: "new area" }]), [machine]),
  );
  assert(
    !coversWorkspace(manager, access([{ ...a, plant: "Other plant" }]), [
      machine,
    ]),
  );
  assert(
    !coversWorkspace(
      manager,
      { mode: "all", locations: [], equipmentIds: [] },
      [machine],
    ),
  );
  const oneArea = {
    role: "Manager",
    workspaceAccess: access([{ ...a, area: "A" }]),
  };
  assert(!coversWorkspace(oneArea, access([a]), [machine]));
  assert(coversWorkspace(oneArea, access([], [machine.id]), [machine]));
  assert(!coversWorkspace(oneArea, access([], [randomUUID()]), [machine]));
});
test("cross-department accounts may be visible while their global mutations remain forbidden", () => {
  const actor = { role: "Manager", workspaceAccess: access([a]) },
    target = {
      role: "Operator",
      workspaceAccess: access([
        a,
        { plant: "Plant", department: "Other", area: null },
      ]),
    };
  assert(sharesWorkspace(actor, target, [machine]));
  assert(!coversWorkspace(actor, target.workspaceAccess, [machine]));
  assert(
    !sharesWorkspace(
      actor,
      {
        role: "Operator",
        workspaceAccess: access([{ ...a, plant: "Another" }]),
      },
      [machine],
    ),
  );
});
test("individual delegation does not permit global role/policy administration or silently create Admin", () => {
  assert(
    !delegationSchema.safeParse({
      extraGrants: ["permissions"],
      adminPrivileges: [],
    }).success,
  );
  assert(
    !delegationSchema.safeParse({ extraGrants: ["users"], adminPrivileges: [] })
      .success,
  );
  assert(
    !delegationSchema.safeParse({ extraGrants: [], adminPrivileges: ["all"] })
      .success,
  );
  assert(
    !effectiveGrants(
      "Operator",
      ["work"],
      ["permissions"],
      ["equipment.manage"],
    ).includes("manage"),
  );
  assert(
    effectiveGrants("Operator", [], [], ["maintenance.manage"]).includes(
      "maintenance",
    ),
  );
  assert(
    !effectivePrivileges("Operator", ["equipment.manage"]).includes(
      "accounts.edit",
    ),
  );
  assert(effectivePrivileges("Manager", []).includes("accounts.reset"));
  assert(
    protectedAccount({ role: "Operator", adminPrivileges: ["accounts.edit"] }),
  );
  assert(protectedAccount({ role: "Manager" }));
});
test("dashboard preferences allow hiding/reordering panels but reject duplicate panels and arbitrary login destinations", () => {
  assert.equal(dashboardPreferences({}).home, "Overview");
  assert.equal(
    dashboardPreferences({ home: "http://attacker.example" }).home,
    "Overview",
  );
  assert(
    !dashboardPreferencesSchema.safeParse({ widgets: ["ideas", "ideas"] })
      .success,
  );
  const p = dashboardPreferencesSchema.parse({
    widgets: [],
    showLaunchpad: false,
    home: "TPM / CIL",
  });
  assert.equal(p.widgets.length, 0);
  assert(!p.showLaunchpad);
});
test("login sections and assistant topics follow current authority rather than a saved preference", () => {
  const u = {
    role: "Operator",
    grants: ["work"] as const,
    adminPrivileges: [],
  };
  assert(!canOpenSection({ ...u, grants: [...u.grants] }, "Accounts"));
  assert(!canOpenSection({ ...u, grants: [...u.grants] }, "Permissions"));
  assert(canOpenSection({ ...u, grants: [...u.grants] }, "Assistant"));
  const topics = permittedHelp({ ...u, grants: [...u.grants] });
  assert(!topics.some((t) => t.section === "Problem solving"));
  const cilTopics = permittedHelp({
    role: "Operator",
    grants: ["maintenance", "work"],
  });
  assert.equal(
    guideAnswer("How do I perform a CIL?", cilTopics).links[0],
    "TPM / CIL",
  );
  assert.equal(guideAnswer("PM", cilTopics).links[0], "Preventive maintenance");
  assert(
    !guideAnswer("how can I reset another account", topics).links.includes(
      "Accounts",
    ),
  );
});
test("AI adapter sends only the typed question and permitted help, with no tools or response storage", async () => {
  let calls = 0;
  const topics = permittedHelp({ role: "Operator", grants: ["work"] });
  const answer = await answerNavigationQuestion(
    "How do I record work?",
    topics,
    { model: "test-model", apiKey: "unit-test-key" },
    async (url, init) => {
      calls++;
      assert.equal(url, "https://api.openai.com/v1/responses");
      assert.equal(init?.redirect, "error");
      const body = JSON.parse(String(init?.body));
      assert.equal(body.store, false);
      assert.equal(body.max_output_tokens, 700);
      assert.equal(body.tools, undefined);
      assert.equal(body.input, "How do I record work?");
      assert(!body.instructions.includes("unit-test-key"));
      assert(!body.instructions.includes('"section":"Accounts"'));
      return new Response(
        JSON.stringify({
          output: [
            { type: "reasoning", summary: [] },
            {
              type: "message",
              content: [{ type: "output_text", text: "Choose Standard work." }],
            },
          ],
        }),
      );
    },
  );
  assert.equal(calls, 1);
  assert.equal(answer, "Choose Standard work.");
});
test("AI failures and malformed output never become successful empty answers", async () => {
  await assert.rejects(() =>
    answerNavigationQuestion(
      "Help",
      [],
      { model: "test", apiKey: "unit-test-key" },
      async () => new Response("No", { status: 503 }),
    ),
  );
  await assert.rejects(() =>
    answerNavigationQuestion(
      "Help",
      [],
      { model: "test", apiKey: "unit-test-key" },
      async () => new Response(JSON.stringify({ output: [] })),
    ),
  );
});
