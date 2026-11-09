# 5S, TPM/CIL, defects, dashboards and account access

## Upgrade and permissions

Back up PostgreSQL and private uploads. Stop the app, replace source while preserving `.env`, uploads and the same database volume, then start normally. Additive migration **011** creates 5S, defect, registration and hash-only password-token tables, a PM/CIL discriminator and optional dashboard preferences. It preserves existing standard revisions, PM plans and completion records. Existing operational policies receive `fiveS` and `defects`; review custom role permissions after upgrading. CIL uses the existing `maintenance` capability. Admin-only account review uses `users`.

All record lists, exports, evidence reads and writes apply current workspace assignments. An individual machine assignment does **not** grant an entire 5S area: assign the auditor a department or area in Accounts. Machine workflows continue to support individual equipment assignments. Disabled accounts immediately fail authentication; edits revoke sessions and invalidate old reset links by incrementing the account version.

## 5S audits and DL/TL work

1. A manager with Manage and 5S permissions creates a 5S plan for a catalog department/area. All five pillars must have a question: Sort, Set in order, Shine, Standardize, Sustain.
2. Questions are editable, can require photo/video evidence, and are scored 0–5. Assign permitted auditors or leave the list empty for any permitted auditor in that area.
3. Audits preserve original questions, location, answers, evidence, score and recorder. Later plan edits do not change completed audits. Plans retain their area; create a new plan for another area.
4. In **Manage → DL/TL Standard Work**, link a step to a 5S plan for the machine's area. Publish a revision as usual. Complete the 5S audit, then select that result in the DL/TL step. The server verifies the same auditor, linked plan, current local calendar day, less than 24 hours old and matching area before accepting the DL/TL record. An audit is not automatically copied into every user's work.

5S history shows the latest 100 matching completions; Excel includes the complete matching history. Audit plans are area-based, including areas without machines when catalog locations and user area assignments exist.

## TPM / CIL

**TPM / CIL** uses separate Clean, Inspect and Lubricate plans and history while sharing PM recurrence and evidence protections. Managers choose the machine, assignee, steps, interval, due date and required photo/video evidence. Only the assignee or Admin completes a due plan. Explicit Yes/No answers preserve abnormalities as follow-up flags; report a defect separately when maintenance work is needed. Completing a CIL advances its due date without changing historical completions. CILs and PMs stay separate in lists and exports; both appear on the assignment dashboard and existing overdue reminders.

## Defect reporting and MaintainX

People with Defects permission report a machine abnormality, priority, description and photo/video evidence. Managers assign it to a permitted person. Reporter, assignee or manager can update local resolution and add comments; history and stale-write checks preserve accountability. A local resolution does not change a MaintainX work order's state.

An explicit **Submit work order to MaintainX** action sends the mapped machine asset ID, title, description, priority text, location and stable `externalData.floorworkDefectId` to the documented `POST https://api.getmaintainx.com/v1/workorders` endpoint. It stores the returned work-order ID. Priority is included in the description rather than assuming a tenant-specific priority mapping. MaintainX attachments are not copied: private evidence remains in Floorwork, and the description states this. No unauthenticated media links are exposed.

IT must:

- Confirm API entitlement (MaintainX currently documents API access for Premium/Enterprise) and provision an approved Bearer key.
- Set `MAINTAINX_API_KEY` privately on the application server, plus `MAINTAINX_ORGANIZATION_ID` for a multi-organization token. Restart the app after changing secrets. Never enter keys into the browser UI or commit them.
- Allow outbound verified HTTPS to `api.getmaintainx.com`.
- As Admin, map Floorwork machines to real numeric MaintainX asset IDs under **Defect reporting → MaintainX asset mapping**.
- Pilot submission against an approved test organization before live use.

Concurrent submissions claim a defect once. A timeout, invalid response or process interruption can mean that the work order was created remotely even though Floorwork could not confirm it. Such rows are **Review required**, or remain **Sending** after an interruption. They are not retried automatically. Admin checks MaintainX for the defect UUID, then records the existing work-order ID or explicitly confirms absence to allow another submission. Sending rows cannot be reconciled for two minutes. This prevents blind duplicate creation; it is not a cross-system exactly-once guarantee. Work-order status synchronization/webhooks and attachment transfer are not implemented.

Reference: [MaintainX REST API](https://api.getmaintainx.com/v1/docs), [getting started](https://help.getmaintainx.com/build/getting-started).

## Personal and department dashboards

The login Overview now begins with **My assignments**: open ideas where you are submitter/pilot/validator/participant, investigations you own/review or have an open action in, assigned PM/CIL plans, reported/assigned defects and assigned or generally available 5S plans. Due dates mark overdue items. Module permissions and location restrictions still apply. Lists show up to 100 items per module, with complete matching counts and links to the full module.

Managers/DL/TLs with Dashboard permission can enable an assigned **plant + department** view or leave it disabled. Admin can assign it in Accounts. The preference never expands access: only machines and areas currently within that user's assignments appear. Revoking an assignment invalidates an inaccessible saved preference. Department view includes all permitted open items in that department; personal view always remains available. Existing performance analytics remain below the assignment dashboard.

## Registration, disabling and forgotten passwords

The sign-in page has **Request an account** and **Forgot my password**.

Registration collects a requested username, name, email, department and reason, with global/per-username throttling. It creates a pending request and private in-app notices for active Admins, not an immediately usable account. Admin reviews in Accounts. Approval creates an Operator account with **no department/area/machine access** and attempts a password-setup email. Admin must verify the applicant and assign appropriate access. Rejection creates no account. Repeated approval is rejected. No request can grant itself a role or workspace assignment.

SMTP uses the existing private `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM`, optional `SMTP_USER` and `SMTP_PASSWORD`. START-FLOORWORK already launches the worker for operational alerts; password links are sent directly by the app so a separate worker is not required for recovery. TLS certificate validation stays enabled. `APP_ORIGIN` must be the actual company HTTPS origin for links to work from employee devices; localhost is only for local testing.

Password emails go only to the active account's stored address, never to an address supplied as a destination by the caller. Use username when several accounts share one address. Responses are generic to avoid exposing whether an account exists. Tokens are cryptographically random, stored only as SHA-256 digests, expire after 30 minutes, are single-use and bound to the account version. Setting a password invalidates sessions and all existing tokens for that account. Disabled accounts cannot recover access. Links use URL fragments, so tokens are not sent in initial page URLs; the form removes the fragment after success. Expired links are cleaned by the worker. Missing/failed SMTP does not create a recovery bypass; Admin can resend a password email or set a temporary password through the existing account editor. Email delivery is attempted once per request; users can request another link if it fails.

Disable accounts with **Accounts → select person → uncheck Account active → Update account**. Self-deactivation/role changes and removal of the last active Admin remain blocked. Approval and password recovery are not Microsoft Entra SSO/MFA; that remains a separate implementation gap.

## Searchable people directory

Person pickers for idea submitter/pilot/validator, participants, problem facilitator/reviewer/action owner/team, PM/CIL assignees and 5S auditors search the permitted account directory by name/username and store IDs for formal assignments. Existing selections remain visible when the query changes. Problem team names can be appended from the directory; the existing team description remains free text. Section person filters also use the scoped account directory. This is the app's account directory; it does not automatically read every company employee from Entra/HR. A separate employee/HR sync needs an approved data source and identity mapping.

## Validation and limits

Checks include production build/type checking, 35 unit tests, fresh/legacy migration upgrades through 011, the floor-expansion browser/API suite, and existing browser workflow regressions. Synthetic MaintainX and SMTP transports test concurrency, ambiguous submissions, email token contents, reuse and disabled-account rejection. Tests never send a live work order or company email. Screenshots use temporary synthetic records in [screenshots/five-s-tpm](screenshots/five-s-tpm).

Not validated against a live MaintainX organization, company SMTP, native Windows, or an independent penetration test. Live IT configuration and pilot validation remain necessary. No production records, secrets, real photos or live emails are included in the screenshots or source download.
