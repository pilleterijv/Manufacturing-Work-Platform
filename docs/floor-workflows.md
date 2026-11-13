# Floor workflow update

Each role has a focused Start here panel on Overview. Operators start with floor
tasks, downtime, defects and instructions; DL/TLs start with leader work and shift
follow-up; Managers start with department review; Admin starts with setup. Sidebar
shortcuts move the role's primary tools first. Other permitted tools remain
available. Existing personal dashboard choices and login preferences are retained.

The machine/shift context panel stays above the section. Selecting a machine in
a form updates the machine reminder. Always confirm the machine and shift on the
actual form before saving: the context panel is a reminder, not a way to silently
change a task's equipment or saved timestamps. The instructions shortcut opens
guides using the exact equipment ID, avoiding ambiguity from repeated names.

Machine labels can contain the same app origin and `/?machine=EQUIPMENT_UUID`,
or the equipment UUID by itself. Camera scanning uses the browser's BarcodeDetector
when available. Unsupported browsers offer manual entry; an iPad's normal camera
can open a QR containing the HTTPS machine URL. Labels for unassigned machines
are rejected. Camera access stops when scanning closes. No third-party scanner
receives camera frames. Actual camera support requires testing on your devices.
Use your stable company HTTPS address for printed QR links; Codespaces preview
addresses can change when a Codespace is replaced.

Dashboard assignment cards carry open-status and personal/department scope into
the destination, with a visible filter and Clear dashboard filter button. PM and
CIL cards have separate counts and destinations. Individual assignment links
open a list narrowed to that record. Server predicates intersect existing
department/area permissions; URL filters cannot widen access.

Form changes trigger a warning before changing sections, signing out, closing
the page or cancelling an editor. Choosing another standard or investigation
also checks for unsaved entries. Timer/button work inside forms is included.
Drafts stay in page memory; they are not an offline queue and are not shared
between accounts. A browser crash cannot guarantee draft recovery.

The save indicator distinguishes saving, server-confirmed saves and failed or
unconfirmed requests. If a record saves but the subsequent list refresh fails,
the task remains saved and the interface asks for a refresh, rather than asking
for another submission.

New defect/problem forms suggest existing open issues on the selected machine.
Suggestions are permission checked and limited to 10 records of each kind. They
are advisory: separate genuine conditions may need separate reports. Follow-up
problem solving can still use its existing escalation link.

The two report forms send a unique submission key. Migration **016** stores a
compact receipt in the same transaction as creation, so concurrent requests or
network retries with the same key return the original ID/reference. Reusing a
key with changed entries returns 409. Receipts store a payload hash and record
reference, not a second copy of the form or uploaded media. Existing integration
clients without a key retain their prior behavior; integrations should supply a
UUID `requestKey` to opt into retry protection. Existing task-specific completion
and version guards remain in place.

## Updating

Back up the database and uploads, stop the old app, update the source branch and
preserve your private `.env`. In the repository terminal run:

```sh
npm ci
npm run db:generate
npm run db:setup
npm run build
npm start
```

Setup applies migrations 015 and 016 when missing. Do this before starting the
new runtime. No company SQL, TrakSYS, MaintainX or email settings are changed by
this update.

Pilot with one operator, a DL/TL and a Manager through a complete shift. Check
wrong-machine entry prevention, unsaved-work warnings, retry behavior, gloves,
weak Wi-Fi, camera permissions and handoff. Existing immutable work history is
preserved. This update does not introduce regulated document approval or training
certification, or different roles per department for the same account.
