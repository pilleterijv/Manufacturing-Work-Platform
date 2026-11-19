# Viewing submitted work

Use **Submission history** in the sidebar for completed Operator tasks, DL/TL Standard Work, Process verification, changeovers, time studies, PMs, CILs, centerline audits and 5S audits. Choose **Everyone in my assigned scope** or **Only my submissions**, select a type, search, and open **View submitted details**. Refresh retrieves the latest saved records. **Load older submissions** continues beyond the first 50 entries; the view has no 100-record history cutoff.

Problem solving, improvement ideas, defects, downtime, production results, training and troubleshooting retain their dedicated sections. Shortcuts in Submission history open those sections with their existing permissions. These are live reports or published resources rather than checklist executions. Draft uploads and private account information are not public submissions.

## Set up area sharing

An Admin must enable **Area submission history — read only** in the role permissions for the roles that should review colleagues’ completed checklists. Existing role policies are deliberately preserved; deploying this code does not silently add permissions. Keep the role’s normal completion permissions if operators should also perform tasks.

Assign each account its departments, areas and/or individual equipment. A department-wide assignment includes that department’s areas; an area assignment stays within that area. A Manager or Supervisor title alone does not expand a restricted assignment. Assign the relevant departments to managers who need department-wide review. Avoid unrestricted workspace access for ordinary floor accounts.

| Person | Recommended use |
| --- | --- |
| Operator | Perform assigned machine/area tasks; review submitted work in that scope with the read-only history permission. |
| DL/TL or supervisor | Use DL/TL Standard Work for shift responsibilities; review area completions and follow up in the original report section. |
| Maintenance | Review PM/CIL completions and defects for assigned equipment; retain separate maintenance completion permissions. |
| Manager | Review department history and dashboards; use separate management privileges for changes. |
| Admin | Configure roles and assignments. Grant history separately from editing, exporting or managing accounts. |

## How the code enforces it

1. A successful submission is saved to PostgreSQL. Generic completed work uses `Record`; 5S uses `FiveSAudit`; reports use their respective tables. Saved execution snapshots preserve the questions/revision that were used at submission time.
2. `/api/submissions` authenticates the current account and reloads its permissions and assignments. `lib/submission-history-policy.ts` combines allowed record kinds, account identity and the existing equipment scope predicate. Location-based 5S history uses the assigned-area predicate.
3. The list returns limited metadata in pages of 50. Opening a detail requests the saved record by ID and repeats the same authorization. Guessing an ID does not bypass the scope check. Retired locations remain readable history where the current assignment still permits access.
4. Photos/videos load through protected media APIs. `lib/evidence.ts` independently verifies an attachment reference on an authorized submitted record. A colleague cannot view unattached draft uploads. Removing scope takes effect on subsequent requests; previously downloaded information cannot be recalled.
5. This endpoint implements GET only. It cannot create, edit or delete records. Existing completion, management and export routes still require their own permissions. History sharing does not grant exports by itself.

Without the new history permission, existing module rules remain: some modules already share area history; generic task/study records retain their previous own-record or analytics rules. The UI explains this rather than suggesting that an empty list means nobody has submitted anything.

## Usability changes

There is one place to find completed work, with names that distinguish Operator tasks, DL/TL Standard Work and Process verification. Saved details show the original checklist responses and evidence rather than an editable current template. Search is explicitly for submitted work; it does not create a draft-warning prompt. Opening a record scrolls to its detail. Older observations inside large records load in batches to keep tablets responsive. Failed refreshes show an error instead of leaving an old result set under newly selected filters.

## Verification and limitations

Regression checks use a randomly named disposable PostgreSQL database, synthetic accounts and synthetic photos. They cover same-area sharing, direct foreign-ID denial, private draft denial, separate write permissions, scope revocation, stable pagination and tablet rendering. Production build, TypeScript and unit checks are also required before publishing.

This is a targeted permissions and workflow review. It is not a guarantee that every possible production configuration or external integration is error-free. Configure role permissions and assignments in a pilot, then have one representative from each role try their actual shift tasks before plant-wide rollout.

Verified on November 19, 2026: production build and TypeScript passed; all 83 unit tests passed; isolated custom-role, core browser, floor-usability and security-readiness suites passed. The history regression also exercises 5S, PM, CIL and centerline detail access, 111 authorized records across multiple pages, same-timestamp ordering and revocation. No company database was changed by these tests.
