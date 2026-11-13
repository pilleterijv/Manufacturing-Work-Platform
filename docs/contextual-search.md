# Search by tab

Each operational tab now has one primary search with a specific label, placeholder, native record suggestions and an explanation of its person filter. Search suggestions no longer mix unrelated recent work from another tab. Changing tabs clears the old tab's text/person/department filters; dashboard/detail switching within the same tab retains them. Account and participant pickers retain their own account/name searches. Overview and configuration screens do not show an irrelevant record-search bar.

| Tab                    | Text search                                                                   | Person means                                        |
| ---------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------- |
| Standard work          | Standard title, machine or location                                           | Standard assignee / run recorder                    |
| Time studies           | Saved study/process title, machine or location                                | Study recorder                                      |
| DL/TL Standard Work    | Leader checklist title, machine or location                                   | Leader assignee / recorder                          |
| Standard work audits   | Process audit title, machine or location                                      | Audit assignee / recorder                           |
| Preventive maintenance | PM title, machine or location                                                 | Plan assignee / completion recorder                 |
| TPM / CIL              | CIL title, machine or location                                                | Plan assignee / completion recorder                 |
| Centerlines            | Title, product/setup, machine or location                                     | Auditor; settings have no owner                     |
| 5S audits              | Plan title or area/location, including saved audit titles                     | Assigned auditor / actual auditor                   |
| Defect reporting       | Defect title/description, machine/location, defect or MaintainX work-order ID | Reporter / assignee                                 |
| Production results     | External ID, title/description, machine or location                           | Source-mapped person, not uploader                  |
| Training               | Video title, machine or location                                              | Resource author, not attendance                     |
| Troubleshooting        | Guide title, issue/fix instructions, machine or location                      | Guide author                                        |
| Analytics              | Recorded work, audit or study title/context, machine/location                 | Observation recorder                                |
| Downtime               | Reason, machine or location                                                   | Timer starter / stopper                             |
| Improvement ideas      | Title, current situation, proposal, machine/location                          | Pilot, validator, submitter, creator or participant |
| Problem solving        | 2D/4D/8D reference, title, machine/location                                   | Facilitator, reviewer, creator or action owner      |
| Manage                 | Revision title and equipment list                                             | Assigned user                                       |
| Leadership dashboard   | Operational record text, title, reason or machine/location                    | Relevant recorder / owner / participant             |

Select a person from the searchable dropdown before applying that filter; merely typing a partial name does not silently apply an old selection. A selected name stays visible after applying filters. Clear filters removes both text and person. Suggestions are bounded and use the same department/area/machine access as the data; operator time-study suggestions do not disclose other people's private studies. 5S suggestions are area-based, with no irrelevant machine choices.

PM and CIL suggestions are separated. Problem references, saved study names, product/setup values, imported production IDs and MaintainX IDs have corresponding server-side searches. A suggestion matched through a guide's instructions or an idea's proposal remains selectable even when the query is not in its title. Historical 5S titles and centerline setup values remain searchable after a definition changes. Exports use the same server filters.

Problem solving retains its department/method/status selectors while applying the primary search and uses its own filtered export. Its duplicate search box is removed. Training and Troubleshooting also use the primary server-backed search instead of a second local search over an already filtered list. Report text filters narrow operational metrics; current equipment/library totals remain totals for the selected department. Manage search narrows the revision selector and equipment list while keeping machine options available for creating work.

No new database migration is introduced. Update the branch you use, preserve the private environment/database/uploads, and build the app before testing. If updating from an older version, generate the Prisma client and apply outstanding migrations through 014. Startup checks the configured PostgreSQL database and applied migrations before launching, so a missing database produces an actionable terminal message rather than launching a broken app.

```bash
git pull --ff-only origin codex/test-before-codespaces
npm ci
npm run db:generate
npm run db:setup
npm run build
npm start
```

Use the corresponding branch in the pull command if running `codex/rebuild-floorwork`. Test company network access and private Codespaces preview authorization separately from the app's own account sign-in.

## Verification

Verified November 13, 2026 on the local production build: TypeScript/build, all 66 unit tests, fresh/upgrade migrations, isolated runtime startup, the 18-tab contextual-search workflow, existing section-search/dashboard workflow, core browser, location/task, maintenance/import/reminder, problem-solving, floor expansion, personal access, centerline, security and tablet/PWA workflows, plus the scoped performance test. The contextual workflow recorded no browser exceptions or API 5xx responses. It checks reference/ID searches, original historical setups/titles, body-text matches, PM/CIL separation, permissions, selected-name visibility, method preservation, tab isolation and tablet layout.

The browser test also exposed a suggestion overlay blocking Apply filters; suggestions now reserve space in the form instead of covering controls. A selected author no longer narrows library machine metadata to the author's current assignments. Report machine/location searches now also match ideas, problems and downtime within the existing scope.

Performance remains bounded: the synthetic fixture's summary/live polls were 222/401 bytes, overview was 11,717 bytes, and complete exports retained 160 work records, 100 downtime rows and 100 ideas. These are local checks, not a guarantee about company network availability or physical-device behavior.

Screenshots show synthetic test accounts: [Centerlines search](screenshots/contextual-search/centerline-search.png) and [tablet downtime suggestions](screenshots/contextual-search/tablet-downtime-search.png).
