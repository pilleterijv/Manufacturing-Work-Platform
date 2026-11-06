# Problem solving: 2D, 4D and 8D

This module is based on the supplied **Problem Solving Process.xlsx**, including the embedded methodology selection image and the Physical Forms, Digital Flow and Manager Database Flow sheets.

## Method selection

- **2D:** simple/minor, usually one-time problems with a known cause and solution. Team Leader leads and Department Leader reviews. Workbook guidance: 5–60 minutes downtime; complete in less than 24 hours.
- **4D:** recurring issues, including repeated 2Ds, internal department problems, or unknown cause/solution. Safety issues are at least 4D and must be reported to the manager. Department Leader leads and Operations Manager reviews. Workbook guidance: over 60 through 360 minutes downtime; 24–48 hours to complete.
- **8D:** major/complex issues, customer impact, unsuccessful repeated 4Ds, or emergency containment. Engineering/Reliability leads with Department Manager/Site Director review and BusEx coaching. Workbook guidance: over 360 minutes downtime; seven calendar days.

These are displayed as guidance; the application does not automatically infer severity from machine downtime or notify a safety manager.

## Workbook mapping

| Source                                  | App behavior                                                                                                                                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2D identify/define, root cause, actions | Reported-by/date, equipment location, fact-based statement, cause, correction and corrective action                                                                                            |
| 2D methodology image                    | Team recognition and effectiveness evidence                                                                                                                                                    |
| 4D team/standard check                  | Facilitator, reviewer, team, standard exists / available / trained checks                                                                                                                      |
| 4D problem definition                   | Who / what / when / where / how much and focused statement                                                                                                                                     |
| 4D root cause                           | Five Why fields and root cause summary                                                                                                                                                         |
| 4D actions/checkpoints                  | Assigned containment/correction/corrective/preventive actions plus OPL, SOP/JI, Centerlines, CILs, PMs, Training, Poka-Yoke, Safety and Reapplication checkpoint categories                    |
| 8D D0–D8                                | Emergency containment, team/scope, problem, interim containment, fishbone/5-Why/escape cause, verified corrective action, implementation, recurrence prevention, recognition and effectiveness |
| Record IDs                              | Method/year/random-ID reference plus immutable UUID; no Microsoft Forms ResponseID is invented                                                                                                 |
| Viewer / department / dashboard         | Searchable record list, department/method/status filters, current full-scope aggregate counts and individual record viewer                                                                     |
| Action update portal                    | Open actions/checkpoints, owner/due date/status, comments and completion timestamp; completed items leave the queue and remain in history                                                      |
| Escalation                              | Create a linked higher-method record, preserving the previous record rather than overwriting it                                                                                                |

## Permissions and integrity

Migration 006 adds the `problems` capability to existing valid role policies without removing grants. Admin has all capabilities. Review role grants after upgrading. Workspace members with the capability can view and create records; the creator, facilitator, reviewer, Admin or a role with Manage can edit a record. Assigned action owners can update their actions. Only the assigned reviewer or Admin can close or reopen a record.

Open records may be incomplete. Closure requires every methodology evidence field and at least one tracked action; all actions/checkpoints must be completed. Changes record the actor, timestamp, values and prior status. Case row locks serialize closure/action changes; versions reject stale record and action writes. Method, equipment snapshot and previous-record link remain fixed after creation. Escalation uses a new record.

The action portal writes directly to PostgreSQL in the same transaction as its change history. It does not maintain a duplicate Excel portal or run an external scheduled synchronization. Dedicated Excel export includes matching records, methodology answers, actions/checkpoints and change history. The global Export Excel link covers its existing operational records; use **Export problem solving** for this module's full detail. Leadership summaries include current open/closed problem records and open action counts.

## Reference limitations

The two supplied Microsoft Forms `DesignPageV2.aspx` editing URLs were not readable through the available tools. Their exact question wording, order, branching and visual layout have **not** been verified. Supply PDFs/screenshots or an accessible view of the forms to align those details.

This work does not connect to Microsoft Forms, Power Automate, source Excel workbooks or email. It adds native Floorwork workflows using PostgreSQL as the system of record. There is no automatic problem-solving assignment email/message yet; ownership is visible in the record and action queue. Existing improvement-idea pilot notifications continue to work.

## Verification and screenshots

Run `npm run test:problems` against a local production app for permissions, persistence, closure, stale-write conflicts, linked escalation, action queue and Excel integration checks. `npm run screenshots` creates synthetic local fixtures, captures all sections and removes its records/accounts afterwards. Default gallery location: `docs/screenshots/gallery`. Use `GALLERY_OUTPUT` for a different local directory. Do not run screenshot fixture creation against a live workplace database.

Native Windows startup and live workplace deployment need verification on the target machines. Preserve `.env`, uploads and database volumes when upgrading, and back up existing data before applying new migrations.
