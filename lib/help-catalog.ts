import { canOpenSection, type NavigationUser } from "./navigation";
export type HelpTopic = {
  section: string;
  keywords: string;
  text: string;
  steps: string[];
};
export const helpTopics: HelpTopic[] = [
  {
    section: "Overview",
    keywords: "dashboard home personal assignments overdue login",
    text: "Your overview brings together your permitted assignments and work.",
    steps: [
      "Open Overview to see assigned ideas, investigations, PMs/CILs, defects and 5S plans.",
      "Choose Personal assignments or an enabled department dashboard.",
      "Use Dashboard settings to choose panels and your next-login section.",
    ],
  },
  {
    section: "Dashboard settings",
    keywords:
      "customize personalise personalize dashboard widgets hide show login default home",
    text: "Dashboard choices are saved independently for your account.",
    steps: [
      "Choose the section to open when you log in.",
      "Select assignment panels, move them into your preferred order and switch shortcuts, performance or history on/off.",
      "Save my dashboard. Your selected login section applies next sign-in or reopening.",
    ],
  },
  {
    section: "Standard work",
    keywords:
      "standard work task complete photo picture evidence steps verification",
    text: "Complete the approved standard and save its evidence.",
    steps: [
      "Select Standard work and choose the process/machine.",
      "Answer every step explicitly Yes or No; add required photos/videos.",
      "Finish the task to save a permanent completion record. Do not use a changed procedure until a manager publishes its revision.",
    ],
  },
  {
    section: "DL/TL Standard Work",
    keywords: "dl tl leader supervisor audit linked 5s shift",
    text: "DL/TL tasks may require an assigned auditor and a linked 5S result.",
    steps: [
      "Select the assigned DL/TL process.",
      "If a step links 5S, complete that plan for the same area today, then select your completed audit in the step.",
      "Answer the remaining steps, stop any running timer and save the work.",
    ],
  },
  {
    section: "Preventive maintenance",
    keywords: "preventive maintenance pm schedule machine required evidence",
    text: "PM plans specify an assignee, due date, steps and evidence.",
    steps: [
      "Choose a due plan assigned to you and select Perform PM.",
      "Answer each step and attach required photos/videos.",
      "Complete the PM; its next due date advances and the original completion is preserved.",
    ],
  },
  {
    section: "TPM / CIL",
    keywords:
      "tpm cil clean cleaning inspect inspection lubricate lubrication machine",
    text: "CIL checks are separate machine cleaning, inspection and lubrication plans.",
    steps: [
      "Open TPM / CIL and select a due plan assigned to you.",
      "Follow the machine's approved instructions, record Yes/No and attach required evidence.",
      "Save the CIL. Report abnormalities separately in Defect reporting when maintenance follow-up is needed.",
    ],
  },
  {
    section: "5S audits",
    keywords: "5s sort shine sustain standardize area audit score",
    text: "5S audits evaluate an area against all five pillars.",
    steps: [
      "Choose an active area plan assigned to you or open to permitted auditors.",
      "Score every item from 0 to 5 and attach required photo/video evidence.",
      "Save the audit. The recorded score, questions and evidence remain in history.",
    ],
  },
  {
    section: "Defect reporting",
    keywords: "defect abnormality broken maintainx work order repair",
    text: "Defects capture machine issues and may be submitted to MaintainX.",
    steps: [
      "Choose the correct machine, describe the defect, set priority and attach evidence.",
      "Report the defect. Authorized people can assign it, comment and update local resolution.",
      "If IT configured MaintainX and mapped the asset, use Submit work order to MaintainX. An uncertain submission needs Admin reconciliation before retrying.",
    ],
  },
  {
    section: "Downtime",
    keywords:
      "downtime stoppage stop start reason trak traksys running department area machine",
    text: "Record downtime against the exact department, area and machine.",
    steps: [
      "Choose department, then area, then machine from the permitted dropdowns.",
      "Select the approved reason and start or stop the event as appropriate.",
      "Source-managed machine events may be controlled by an integration. Ask a manager about a conflict instead of creating a duplicate.",
    ],
  },
  {
    section: "Improvement ideas",
    keywords: "idea improvement pilot validator participant proposal action",
    text: "Ideas record an improvement, its pilot, validator and supporting people.",
    steps: [
      "Choose equipment and describe current state and proposed improvement.",
      "Search account names to select submitter, pilot, validator and participants; enter a due date.",
      "Save the idea. Follow progress and validation through its permitted update controls.",
    ],
  },
  {
    section: "Problem solving",
    keywords:
      "problem solving 2d 4d 8d facilitator reviewer corrective containment preventive action",
    text: "Problem solving tracks structured investigations and assigned actions.",
    steps: [
      "Choose the appropriate 2D, 4D or 8D methodology and equipment.",
      "Search for facilitator/reviewer names, enter evidence and assign containment/corrective/preventive actions with owners and due dates.",
      "Complete required fields/actions and effectiveness checks before closure. Your dashboard shows investigations or actions assigned to you.",
    ],
  },
  {
    section: "Production results",
    keywords: "excel production results xlsx import good rejects produced",
    text: "Production imports use a values-only Excel template and stable equipment IDs.",
    steps: [
      "Select a configured production-results feed and download its template.",
      "Use stable ExternalID, EquipmentID, Date, Produced, Good and Rejects; Good plus Rejects must equal Produced.",
      "Upload the workbook. Invalid or forbidden rows reject the batch; identical imports do not duplicate records.",
    ],
  },
  {
    section: "Time studies",
    keywords: "time study timer cycles variation",
    text: "Time studies retain raw cycle observations.",
    steps: [
      "Choose the equipment/process and define the observed element.",
      "Start and stop the timer for each observation and review the raw values.",
      "Stop any running timer before saving. Use permitted analytics/export controls for review.",
    ],
  },
  {
    section: "Training",
    keywords: "training video upload device learning",
    text: "Training provides permitted videos and resources.",
    steps: [
      "Search for the equipment or topic.",
      "Open the resource and play its attached video or supported external video.",
      "People with training administration can upload device videos and update content.",
    ],
  },
  {
    section: "Troubleshooting",
    keywords: "troubleshooting guide instructions picture video fix",
    text: "Guides show approved issue/fix instructions and visual evidence.",
    steps: [
      "Search the issue or choose the equipment.",
      "Read the current guide and view its photos/videos.",
      "Authorized guide editors can add device media and annotate photos. Use approved machine procedures rather than AI-generated repair instructions.",
    ],
  },
  {
    section: "Manage",
    keywords: "manage publish revision equipment standard guide editor",
    text: "Management controls follow your role and individually delegated privileges.",
    steps: [
      "Use the permitted editor to add equipment or publish a standard revision.",
      "Choose catalog locations and people to keep naming consistent.",
      "Publishing creates a new revision; historical work keeps its original procedure.",
    ],
  },
  {
    section: "Accounts",
    keywords:
      "account user employee disable password reset role department access delegation permission",
    text: "Account administration is limited by department and privilege authority.",
    steps: [
      "Search Accounts for a person's name or username.",
      "Managers manage ordinary accounts wholly within their assignments; protected or broader-access accounts require Admin.",
      "Admin can grant specific additional section permissions and administrative actions. You cannot grant yourself Admin or expand your own scope.",
    ],
  },
  {
    section: "Locations",
    keywords: "location catalog plant department area line",
    text: "The location catalog standardizes departments, areas and lines.",
    steps: [
      "Choose the existing parent plant and department.",
      "Add the permitted area/line without creating spelling variants.",
      "An account's location-administration privilege never expands its workspace assignments.",
    ],
  },
  {
    section: "Shift requirements",
    keywords: "shift schedule missed incomplete alert manager standard",
    text: "Shift requirements define expected work and alert recipients.",
    steps: [
      "Choose the standard-work family and equipment.",
      "Set permitted assignees, managers, shifts and weekdays.",
      "Enable in-app/email channels as needed; the background worker checks missed work after shift deadlines.",
    ],
  },
  {
    section: "Notifications",
    keywords: "notification email message overdue reminder",
    text: "Notifications bring personal assignments and overdue alerts together.",
    steps: [
      "Open your messages and follow the relevant work link.",
      "Use your personal in-app/email switches to choose reminder channels.",
      "Company email requires IT's SMTP configuration; marking a notice read does not complete the assigned work.",
    ],
  },
  {
    section: "My account",
    keywords: "my password sign out session change profile",
    text: "My account controls your password and signed-in sessions.",
    steps: [
      "Enter your current password and choose a new password of 12–128 characters.",
      "Changing it signs out existing sessions.",
      "From sign-in, Forgot my password sends a single-use link to your account's stored email when email is configured.",
    ],
  },
  {
    section: "Analytics",
    keywords: "analytics export filter search report statistics",
    text: "Analytics summarizes permitted records and raw measurements.",
    steps: [
      "Choose person and text filters within your workspace permissions.",
      "Review results and follow-up indicators.",
      "Use Excel export if your account has export permission; exports retain the same scope filters.",
    ],
  },
  {
    section: "Leadership dashboard",
    keywords: "leadership performance department manager statistics",
    text: "Leadership views summarize the operational scope you are allowed to see.",
    steps: [
      "Choose the department and date range.",
      "Review downtime, completed work, improvement pipeline and problem actions.",
      "A saved department dashboard preference does not grant access to another department.",
    ],
  },
  {
    section: "Integrations",
    keywords: "integration database sql source api key mapping",
    text: "Admin configures source identities and machine mappings; IT holds private credentials.",
    steps: [
      "Create the approved integration source and map exact machine IDs.",
      "Have IT configure approved APIs or read-only views on the server.",
      "Pilot with test data and reconcile results before live use. Never paste passwords or API keys into this assistant.",
    ],
  },
];
export const permittedHelp = (u: NavigationUser) =>
  helpTopics.filter((t) => canOpenSection(u, t.section));
export function guideAnswer(question: string, topics: HelpTopic[]) {
  const words =
    question
      .toLowerCase()
      .match(/[a-z0-9]+/g)
      ?.filter((w) => w.length > 2) ?? [];
  const scored = topics
    .map((t) => ({
      t,
      score: words.reduce(
        (n, w) => n + (t.keywords.toLowerCase().includes(w) ? 1 : 0),
        0,
      ),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  const found = scored.slice(0, 3).map((x) => x.t);
  return {
    answer: found.length
      ? found
          .map(
            (t) =>
              `${t.section}\n${t.text}\n${t.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
          )
          .join("\n\n")
      : "I can help you find and use the sections available to your account. Choose a topic below or ask about a task. If a section is missing, ask Admin to review your access.",
    links: found.map((t) => t.section),
  };
}
