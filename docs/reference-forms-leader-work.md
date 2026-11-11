# Reference forms, leader work and obsolete content

The supplied 2D/4D workbooks and seven-slide 8D template were reviewed for their field structure. Completed investigations, names, original forms links and workbook files are not included in the repository or imported as cases.

## Department and area catalog

In **Locations**, expand **Load departments and known areas from the supplied forms**, enter/select the plant/site name, and choose **Add reference department / area catalog**. This adds the 17 workbook departments and the area mapping supplied in the conversation: Tableting, Packaging, Softgel, Gummies, Warehouse and Maintenance have their specific lists; the remaining departments use the shared Warehouse/Tableting/Gummies/Softgel/Packaging/QC/QA/Tech Ops/Office/IT area list. Tableting uses **Coating**, not separate AC/CC areas. The workbook's **Maintenance/Facilities** name is retained unless the selected site already uses Maintenance. Existing spelling/casing, inactive entries and permissions are preserved; loading twice does not create duplicates or reactivate retired locations.

There are 153 area entries plus one department-level row for each department. No plant name is guessed, and loading the catalog does not grant anyone access to another area. Assign users and equipment through the existing scoped location controls.

## Problem solving

- 2D keeps problem/cause, standard/training checks and separately tracked correction/containment and corrective actions. Preventive work and recognition remain available but are optional by default for newly created 2Ds, matching the supplied form. Existing per-record closure requirements are not changed.
- 4D includes facilitator department, standard checks, focused problem definition, independent 5-Why sequences and root summaries, action ownership/dates/status/evidence and checkpoints. Enable **Use a second 5-Why root cause path** when needed. The second summary is required by default when enabled; individual required fields remain editable.
- 8D adds the supplied administrative fields (NCCAPA, SKU, sponsor, severity/occurrence and internal/external impact), full problem-definition prompts, six fishbone categories, optional sixth/seventh Whys, an optional second path, department-level prevention choices and D8 recognition/supporting evidence. Open/target/actual close dates, machine/department metadata, people assignments and action completion dates use the existing stored record fields.

The 8D fields are a web implementation of the supplied form, not a claim of pixel-identical PowerPoint rendering. Uploaded evidence and answer history remain protected by the existing account/location permissions. Company escalation rules take precedence over generic time thresholds; the UI no longer presents conflicting fixed downtime thresholds as site policy.

## DL/TL leader work versus process audits

**DL/TL Standard Work** now opens a leader shift checklist, not the timed operator-audit workflow. **Standard work audits** retains the original timed process checks and their history. Existing standards and snapshots remain process audits unless a new revision is deliberately published as leader work. In Manage, select the new leader task type, or change **Checklist purpose for new revision** on an audit family. Assignment and department/area checks still apply.

The editable compressing starter follows the supplied leader-work structure: startup/handoff, checks throughout the shift, compliance, sustainment/visual management and preventive checks. Review tasks against the approved local document before publishing. Operational parameter limits are not hard-coded. Leaders can capture a shift, pass-down notes, and per-room/machine item/lot, target/actual speed, remaining material, issues and next-order readiness. A ten-room handoff shortcut is available. Checklists can link to the area's 5S plan. Completed records retain task sections/timings and the original handoff data. Leader dashboard cards count and link to leader work; legacy timed audits remain separately accessible.

## Navigation and deletion

Working-list searches remain. Redundant global search bars are removed from Overview, dashboard settings, Assistant, profile, account/permission/location administration, integrations and shift setup. Entering those screens clears hidden global filters. Dashboard total cards are keyboard-accessible shortcuts to the appropriate permitted section or detail view.

**Delete / retire** removes standards and their tasks, PM/CIL plans, 5S plans and troubleshooting resources from active use. It does not erase completed records, evidence or historical standard revisions. Retiring a standard family also disables its future shift requirements and records the actor/time. A retired family cannot be revived by submitting another revision. PM/CIL and 5S retirement retain their change histories and use version checks. A 5S plan linked from a current checklist must first be removed from that checklist or its checklist retired. Managers/delegates can only retire content within their authority and location scope. Retired/inactive plans can be shown explicitly for administration; standard step removal is published as a new revision.

## Updating

Migration **013** adds standard-purpose and retirement metadata without editing any earlier migration or historical snapshot. Stop the app, then run these in the terminal:

```bash
git pull --ff-only origin codex/test-before-codespaces
npm run db:generate
npm run db:setup
npm run build
npm start
```

Use the corresponding branch when running codex/rebuild-floorwork. Keep the private environment file and database volume. After rebuilding, refresh the browser. Load the reference catalog for the intended site through Locations; no user accounts, roles or assignments are created automatically.
