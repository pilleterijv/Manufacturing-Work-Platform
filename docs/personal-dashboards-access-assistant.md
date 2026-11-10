# Personal dashboards, delegated access and the platform assistant

## Upgrade

Back up PostgreSQL and private uploads, stop the app, replace the reviewed source while preserving `.env`, uploads and the database volume, then start normally. Additive migration **012** creates per-account dashboard preferences, individual additional capabilities, administrative privileges and an account-change audit table. Existing role policies, records, assignments and historical executions are preserved. There are no new default login accounts.

The visible company-specific branding and app icons have been replaced by neutral Manufacturing Work Platform branding. Existing installed app icons may need an OS/MDM refresh or reinstallation. Historical screenshot folders show earlier versions; current captures are in [screenshots/personal-access](screenshots/personal-access).

## Choose your own dashboard

Every signed-in account has **Dashboard settings**:

1. Choose the permitted section to open when you log in or reopen the app.
2. Select which assignment panels to show: improvement ideas, problem investigations/actions, PM/CIL plans, defects and 5S plans. Reorder selected panels with Move up. Selecting none hides assignment panels.
3. Switch workspace shortcuts, performance reporting and recent work/history on or off.
4. Managers/DL/TLs can choose their assigned department as the default assignment view when available; an inaccessible department falls back to personal assignments.
5. Save. The settings belong only to your own account, persist in PostgreSQL and follow you across devices. They never expand department or section permissions.

A saved login destination whose permission is later removed falls back to Overview. API settings requests cannot change another person's preferences by supplying their ID. The separate existing Admin control for assigning a manager's department remains available; users still choose their own panels and login section.

## Manager account management

**Accounts** is now visible to Managers and individually delegated account administrators. Use Search department accounts to find someone by name/username.

Managers can create and manage ordinary Operator/DL/TL accounts **wholly within their own current workspace authority**, including:

- Create an account assigned initially to a permitted area or machine, with a temporary password that must be changed at first sign-in.
- Edit name, work email and permitted role.
- Enable/disable the account.
- Set a temporary password or send an existing password-setup email through configured SMTP.
- Adjust workspace assignments within their own plant/department/area/machine authority.

Scope checks include wildcard/future-area semantics: having today's machines in one area does not justify granting an entire department. The account editor's scoped assignments do not override the existing downtime/workspace intersection rules. Updates invalidate sessions; reset links remain bound to the account version.

**Protected/read-only cases:** Admin accounts, Manager accounts, individually privileged accounts, accounts with capabilities beyond the actor's own, and accounts whose full assignments extend outside the actor's authority require Admin management. A shared/cross-department person can appear in the department list, but changing that person's global account could affect other departments, so the account is read-only to that manager. A manager cannot change their own role, scope or delegated rights through this editor. Use My account for your own password.

Managers cannot create Manager/Admin accounts or promote someone beyond their own authority. Only Admin grants delegation. Root role-policy editing, integration credentials and global administrative functions remain Admin-only. These are deliberate boundaries rather than a hidden Admin role assigned to managers.

## Delegate specific rights to an account

As Admin: **Accounts → select person → Individual permissions and delegated administration**.

Additional section capabilities add to the person's role policy; unchecking an additional capability does not remove a capability already provided by that role. The broad **All operational editors in assigned locations** capability is intentionally broader than the specific privileges below. Use specific privileges when that is the desired scope.

Specific delegated actions currently include:

- Creating ordinary department accounts, editing details, enabling/disabling, resetting passwords/sending setup emails, or assigning permitted locations/machines.
- Maintaining location catalog entries within assigned locations.
- Adding equipment, publishing standard-work revisions, editing troubleshooting resources or training.
- Managing PM/CIL plans, 5S plans or shift schedules.

Managers already receive the department-account actions by their role; the editor labels those as Manager defaults. Non-Managers receive only explicitly assigned account actions. PM/CIL, 5S and training administration also provide the corresponding module access needed to use those editors. Specific equipment/standard/resource privileges do not grant every other Manage action.

Save individual privileges to apply changes and revoke that account's existing sessions. Privileged accounts are protected from management by department managers. All new account-management/delegation mutations are recorded in `AccountAudit` with actor, target, action, timestamp and non-secret changed values. Passwords, password hashes and reset tokens are not written to that audit data. The existing Admin account editor and root administration controls remain protected.

## Assistant: built-in help and optional AI

**Assistant** is available after sign-in. Built-in guide mode works immediately without an API key or paid AI service. It searches curated instructions for only the sections the current account may open and offers validated in-app navigation buttons. It covers dashboard settings, standard work, DL/TL/5S links, PM/CIL, defects/MaintainX, ideas, problem actions, imports, accounts, notifications and other permitted modules.

The assistant is **read-only navigation help**. It cannot submit work, edit accounts, change permissions, issue work orders, control machines, or read operational records, employee directory data, attachments, passwords or integration credentials. Responses render as escaped text; navigation buttons use permitted local section names rather than model-generated URLs. It is not a source of machine repair, safety or quality decisions; use approved procedures and authorized personnel.

Optional AI configuration:

1. IT approves the provider/data handling and provisions a limited server-side OpenAI API key with appropriate account/billing controls. A ChatGPT subscription does not automatically configure this app's API access.
2. Set private `OPENAI_API_KEY` and `OPENAI_ASSISTANT_MODEL` environment variables on the application server. Choose a model supported by your API project and the Responses API. No model name or secret is accepted from the browser. Restart the application after changing environment configuration.
3. Permit verified outbound HTTPS to the fixed endpoint `https://api.openai.com/v1/responses`.
4. As Admin, open Assistant and enable optional external AI answers for the company. This setting alone cannot supply missing credentials.
5. A user checks **Use external AI for this question** when asking. Only the typed question and permitted static help topics are sent. No automatic work records, names, directory, media or credentials are included. The UI warns users not to type passwords, personal information or confidential production details.

The adapter uses the Responses API with `store:false`, no tools, no conversation IDs, a 700-token output bound, a 20-second timeout and no redirects. `store:false` is not a claim of zero provider retention or a substitute for reviewing the provider's actual data handling terms. The app does not persist assistant conversations. Provider failures fall back to built-in help. Requests are throttled per account and globally (10 questions/account/minute, 100 questions/app/minute). Configure provider-side budgets as well; these throttles are not an expenditure guarantee.

AI enablement and credential status are shown without exposing keys. Built-in help remains available when AI is disabled, unconfigured or unavailable. Live provider credentials and production connectivity have **not** been tested; automated tests use injected fake responses.

API reference: [OpenAI Responses create](https://developers.openai.com/api/reference/typescript/resources/responses/methods/create), [response/conversation storage](https://developers.openai.com/api/docs/guides/conversation-state).

## Validation

For automated browser runs, start the local test server with `FLOORWORK_WORKER_MODE=external npm start` to prevent asynchronous workers from mutating temporary fixtures; worker-specific tests invoke the jobs explicitly, and the isolated runtime smoke test checks actual worker startup. Run `npm run build`, `npm test`, `npm run test:migrations`, `npm run test:personal-access` and relevant existing browser suites on the local test environment. Unit tests cover location wildcard boundaries, cross-department visibility versus management, protected privilege escalation, personal settings validation, authority-filtered help and fake AI request/output handling. The browser suite exercises dashboard persistence/login routing, manager accounts, temporary passwords, session revocation, granular equipment rights, rejected cross-scope actions, delegation revocation, audit secrecy, branding and assistant navigation. Test accounts and fixtures are temporary/synthetic.

Existing company deployment, live integrations, Entra SSO/MFA and the signed Windows installer remain separate setup/development tasks; this update does not configure or imply those capabilities.
