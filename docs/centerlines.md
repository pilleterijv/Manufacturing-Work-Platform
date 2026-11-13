# Machine centerlines

Open **Centerlines** in the workspace. It has Dashboard and In detail views, machine/area/person search suggestions, history refresh and a section Excel export. Centerlines can also be selected as the account's next-login section in Dashboard settings.

## Define settings

Managers with Manage permission, Admin, or accounts with the delegated **Manage machine centerline settings** privilege can add settings within their department/area/machine access. Select a machine from the canonical equipment dropdown, enter a title and optional product/SKU/setup, and add parameters:

- Numeric settings require a target and inclusive lower/upper limits, with optional units.
- Text/position settings require an expected value. Matching ignores letter case and surrounding whitespace.
- Each setting can include check instructions and require a photo or video.

Separate products or setup recipes can have separate centerlines for the same machine. Names within one centerline must be unique. Editing publishes a new version; changing its machine requires creating a separate centerline. Retire removes obsolete settings from active use, preserving the revision log and completed audits. Retired centerlines cannot be edited or audited.

## Audit settings

Any account with Centerlines permission and access to the machine can select **Audit centerline**. Record each actual reading, optionally identify the shift/batch/order, and attach required media. Out-of-limit readings require an abnormality/action comment. The server calculates results from saved limits, regardless of client values. Out-of-limit audits are saved as **Follow up**, rather than preventing a record of the abnormality. A follow-up result remains the historical result; this section does not create maintenance work orders or automated notifications.

Audits store the original machine identity, centerline revision, limits, raw readings, parsed numeric values, comments, recorder/time and evidence. Later edits or retirement do not rewrite these records. An audit opened against an old revision must be restarted after refreshing. Submission retries are deduplicated. History refresh keeps an open draft; changing global search filters changes the working list and resets its form, as in other sections.

Person filters apply to audit recorder/history, not settings (centerlines have no assigned owner). Machine/area/title search applies to settings and history. Exports include all matching settings and audit readings across pages. History has a Load older audits control; settings have Load more centerlines. Dashboard counts cover all matching records, while its record/status list shows the current page.

Photos/videos use the existing protected evidence storage. Managers/viewers with Centerlines permission can view audit evidence only for machines in their permitted scope. Centerline settings do not send commands to machines, replace approved operating instructions or connect directly to a PLC.

## Upgrade

Stop the app, keep the existing private environment file and database, then run in the Codespaces terminal:

```bash
git pull --ff-only origin codex/test-before-codespaces
npm run db:generate
npm run db:setup
npm run build
npm start
```

Use `codex/rebuild-floorwork` in the pull command if that is the branch you run. Migration **014** adds the centerline table and an audit history index. It enables the new section for existing role policies that already allow machine work; customized roles without Work remain unchanged. Admin can adjust Centerlines access in Permissions or grant individual access and editing privileges in Accounts. Location restrictions continue to apply.

No company centerline values are preloaded. Enter approved limits for the intended machine and setup.
