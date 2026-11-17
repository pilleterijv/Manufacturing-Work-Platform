export type SectionSearch = {
  label: string;
  placeholder: string;
  kind: string;
  help: string;
  personLabel?: string;
  personHelp?: string;
  equipment?: boolean;
  areas?: boolean;
};
export const sectionSearch: Record<string, SectionSearch> = {
  "Standard work": {
    label: "Search standard work",
    placeholder: "Standard title, machine, department or area",
    kind: "Operator standard",
    help: "Search available standards and completed work. Machine choices stay within your access.",
    personLabel: "Standard assignee / recorder",
    personHelp:
      "Filters standards by assignment and completed runs by recorder.",
    equipment: true,
  },
  "Time studies": {
    label: "Search time studies",
    placeholder: "Study/process title, machine or area",
    kind: "Time study",
    help: "Search saved study titles and their machines or locations.",
    personLabel: "Study recorder",
    personHelp: "Shows studies recorded by the selected person.",
    equipment: true,
  },
  "DL/TL Standard Work": {
    label: "Search leader work",
    placeholder: "Leader checklist title, machine or area",
    kind: "Leader checklist",
    help: "Search DL/TL leader checklists and their completion history.",
    personLabel: "Leader assignee / recorder",
    personHelp:
      "Filters assigned leader checklists and the person who recorded a completion.",
    equipment: true,
  },
  "Standard work audits": {
    label: "Search process audits",
    placeholder: "Process audit title, machine or area",
    kind: "Process audit checklist",
    help: "Search timed process-audit checklists and their completed records.",
    personLabel: "Audit assignee / recorder",
    personHelp: "Filters checklist assignments and audit recorders.",
    equipment: true,
  },
  "Preventive maintenance": {
    label: "Search PMs",
    placeholder: "PM plan title, machine, department or area",
    kind: "PM plan",
    help: "Find preventive-maintenance plans and completed PM history.",
    personLabel: "PM assignee / recorder",
    personHelp: "Plans match their assignee; completed PMs match the recorder.",
    equipment: true,
  },
  "TPM / CIL": {
    label: "Search CILs",
    placeholder: "CIL plan title, machine, department or area",
    kind: "CIL plan",
    help: "Find clean, inspect and lubricate plans and their completion history.",
    personLabel: "CIL assignee / recorder",
    personHelp: "Plans match their assignee; completions match the recorder.",
    equipment: true,
  },
  Centerlines: {
    label: "Search centerlines",
    placeholder: "Centerline title, product/setup, machine or area",
    kind: "Centerline setup",
    help: "Search machine centerline settings and the original setup saved with each audit.",
    personLabel: "Centerline auditor",
    personHelp:
      "Filters audit history by recorder. Centerline settings have no assigned owner.",
    equipment: true,
  },
  "5S audits": {
    label: "Search 5S audits",
    placeholder: "5S plan title, department, area or line",
    kind: "5S area plan",
    help: "Search area audit plans and the original titles/locations in audit history.",
    personLabel: "5S assignee / auditor",
    personHelp:
      "Plans match their assigned auditor; history matches the person who performed the audit.",
    areas: true,
  },
  "Defect reporting": {
    label: "Search defects",
    placeholder: "Defect title, description, machine or work order ID",
    kind: "Defect report",
    help: "Search defects and MaintainX work-order identifiers, within your machine access.",
    personLabel: "Defect reporter / assignee",
    personHelp:
      "Matches either the person who reported the defect or its assignee.",
    equipment: true,
  },
  "Production results": {
    label: "Search production results",
    placeholder: "External record ID, result title, machine or area",
    kind: "Production record",
    help: "Search imported production record identifiers, titles, descriptions and locations.",
    personLabel: "Production record person",
    personHelp:
      "Matches the person mapped by the source system, rather than the person who uploaded Excel.",
    equipment: true,
  },
  Training: {
    label: "Search training",
    placeholder: "Training video title, machine or area",
    kind: "Training video",
    help: "Find training videos for a permitted machine or shared training resources.",
    personLabel: "Training author",
    personHelp:
      "Shows resources created by this account, not training attendance.",
    equipment: true,
  },
  Troubleshooting: {
    label: "Search troubleshooting",
    placeholder: "Guide title, issue/fix text, machine or area",
    kind: "Troubleshooting guide",
    help: "Search guide titles, written issue/fix instructions and machine locations.",
    personLabel: "Guide author",
    personHelp: "Shows guides created by this account.",
    equipment: true,
  },
  Analytics: {
    label: "Search analysis records",
    placeholder: "Work/audit/study title, machine or area",
    kind: "Analysis record",
    help: "Narrow recorded work, process audits and time-study observations for analysis.",
    personLabel: "Analysis recorder",
    personHelp: "Filters completed observations by recorder.",
    equipment: true,
  },
  Downtime: {
    label: "Search downtime",
    placeholder: "Downtime reason, machine, department or area",
    kind: "Downtime reason",
    help: "Search downtime histories by reason or machine location.",
    personLabel: "Timer starter / stopper",
    personHelp: "Matches the person who started or stopped the downtime timer.",
    equipment: true,
  },
  "Improvement ideas": {
    label: "Search improvement ideas",
    placeholder: "Idea title, current situation, proposal or machine",
    kind: "Improvement idea",
    help: "Search idea titles, current situations, proposals and machine locations.",
    personLabel: "Idea pilot / validator / participant",
    personHelp:
      "Matches the pilot, validator, submitter, creator or an assigned participant.",
    equipment: true,
  },
  "Problem solving": {
    label: "Search problem solving",
    placeholder: "2D/4D/8D reference, problem title, machine or area",
    kind: "Problem-solving record",
    help: "Search investigation references and titles. Use method/status/department selectors below to refine the records.",
    personLabel: "Facilitator / reviewer / action owner",
    personHelp:
      "Matches facilitator, reviewer, creator or action owner. The action queue matches its action owner.",
    equipment: true,
  },
  Manage: {
    label: "Find standards or equipment to edit",
    placeholder: "Standard title, machine, department or area",
    kind: "Standard revision",
    help: "Filters the revision selector and equipment list. Creation forms retain all permitted machine choices.",
    personLabel: "Assigned user",
    personHelp:
      "Narrows equipment to the person's assignments and standards to their checklist assignments.",
    equipment: true,
  },
  "Leadership dashboard": {
    label: "Search report records",
    placeholder: "Recorded title/text, downtime reason or machine",
    kind: "Report location",
    help: "Filters recorded work, ideas, problems and downtime. Current equipment/library totals still describe the selected department.",
    personLabel: "Report recorder / owner",
    personHelp:
      "Matches the recorder or relevant owner/participant for each operational metric.",
    equipment: true,
  },
};
export const searchSettings = (name: string) =>
  Object.hasOwn(sectionSearch, name) ? sectionSearch[name] : undefined;
