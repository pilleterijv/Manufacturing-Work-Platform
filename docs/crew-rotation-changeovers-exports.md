# Rotating crews, changeovers and readable exports

## Confirmed plant roster

Day shift is 05:30–17:30. Night shift is 17:30–05:30, recorded against the date it starts. Shifts 4 (day) and 7 (night) are paired; shifts 5 (day) and 6 (night) are paired. The schedule repeats over 14 days. Its reference Monday is November 16, 2026:

| Days          | Day crew | Night crew |
| ------------- | -------- | ---------- |
| Mon 16–Tue 17 | 4        | 7          |
| Wed 18–Thu 19 | 5        | 6          |
| Fri 20–Sun 22 | 4        | 7          |
| Mon 23–Tue 24 | 5        | 6          |
| Wed 25–Thu 26 | 4        | 7          |
| Fri 27–Sun 29 | 5        | 6          |

This is the clarified 2-2-3 roster, rather than a ten-day interpretation of the earlier shorthand. Dates use the configured plant time zone. Local clock boundaries are preserved across daylight-saving changes; the actual elapsed duration on a DST transition can differ from twelve hours.

## Set it up once

Update the app and apply migration **019** through the existing migration runner, preserving private settings, database and uploaded evidence. In the normal Codespaces branch, stop the app, update source, run `npm run codespaces:setup`, then `npm run codespaces:start`. Stop if database setup fails; do not treat a successful build as a successful migration.

As built-in Admin, open **Shift requirements → Configure rotating crews and 12-hour shift times**. Choose **Use plant roster: crews 4/7 and 5/6 · 5:30 starts**, check the time zone and preview, then save. This explicit step changes the shared plant shift configuration; it does not silently rewrite existing requirements, downtime snapshots or completions.

## Assign a requirement to people

1. Choose a published checklist, normally **DL/TL Standard Work**.
2. Keep **Rotating crew** selected and choose one crew, for example **Shift 5**.
3. Select the people responsible for that crew. Each selected person must complete the checklist during its working shift. Their department/area/machine permissions still apply.
4. Choose manager/supervisor alert recipients and in-app/email channels. Email requires recipient addresses and private SMTP setup.
5. Create the requirement. Monitoring starts at the next full eligible working shift. Create another requirement for the same checklist if a different crew/person must perform it.

If no people are selected, one shared completion for the machine satisfies that crew's requirement. The schedule's crew is a duty roster, not a new permission: assigning a crew never grants area access. The queue and background monitor use the same rotation rules, so off days do not become missing work. Night work is due at the following morning's shift end.

Existing weekday requirements are retained and labelled **Fixed weekday requirement**. Review and pause those when replacing them with crew requirements, otherwise both remain active. Existing requirements keep their original rotation/time-zone snapshot. To change their roster going forward, pause the old requirement and create a replacement; past evidence remains intact.

## Clearer sections

- **DL/TL Standard Work** is prominent for leaders and managers.
- **Operator tasks** is the former Standard work section.
- **Process verification** is the former timed Standard work audits section, available among secondary tools.
- **Changeover standards** holds minor/major/other changeover checklists. Create them in Manage using the Changeover standard task type, choose the correct equipment and publish. Completions capture previous product/format, next product/format, changeover type, notes, checklist answers and required evidence. Each completion retains its original revision.

Saved section preferences and historical records retain their internal identities; these display names do not delete or reclassify old work.

## Locations

The redundant **Load departments and known areas from the supplied forms** dropdown is removed. Existing locations now appear in **Find an existing location**, a searchable dropdown, instead of a long page list. The Tableting checklist/catalog installer remains available to Admin as an explicit setup action.

## Excel

The page's Export Excel link now requests the actual checklist/study section and carries its machine/person/search filters. Existing department and history permissions still apply. DL/TL exports include readable task answers, comments, evidence IDs, shift pass-down notes and one spreadsheet row per room/machine. Changeover exports include products, type and notes. Published checklist definitions are included, even when no completed records match; Export details explains empty results.

The combined execution/downtime/ideas history export remains available on Overview and Analytics with its existing workbook layout. Other operational modules keep their own section exports. Irrelevant combined-export links are removed from account/settings/library pages, and Leadership uses its existing filtered Export dashboard control. Video/photo IDs are references; media remain protected in the app. Exporting a workbook does not make private media public.

## Verification and screenshots

Verified November 18, 2026 using the production runtime, Chromium and synthetic accounts in disposable local PostgreSQL databases: build and TypeScript checks; 83 unit tests; fresh and legacy database upgrades through 019; confirmed two-week crew/date matching; shared queue/monitor duty rules; off-day alert suppression; changeover UI completion and immutable context; readable scoped Excel answers/handoffs and time-study statistics; empty-result definitions; person, machine and product search filters; catalog/role isolation; native search/navigation; existing core execution, account and dashboard workflows.

The application has not been connected to a live company roster database or tested on the plant's physical tablets. The roster preset and migration must be applied in your running installation using the setup steps above. Existing weekday requirements need explicit review/pause when replacing them.

Screenshots use synthetic records: [compact Locations](screenshots/crew-changeover-flow/locations.png), [changeover](screenshots/crew-changeover-flow/changeover.png), [tablet roster](screenshots/crew-changeover-flow/roster-tablet.png).
