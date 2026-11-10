# Company-owned rollout: a step-by-step handover

This is a plan for your IT, security and legal teams to execute. Editing the code does not transfer the GitHub repository, provision company servers, connect live business systems or grant IP ownership. Those actions have not been performed. Company secrets should be entered privately by IT, not sent in chat.

## 1. Choose what employees will install

| Choice | Employee's Windows PC / iPad | Where the app runs | What remains to implement |
| --- | --- | --- | --- |
| **Recommended: company-hosted web app / PWA** | Browser; optional company-deployed app shortcut. No Node, Docker or database installation on employee devices. | One company server or company cloud subscription | IT production deployment and identity work below |
| Windows installer with a bundled runtime | Signed setup wizard installs the app plus its private Node runtime; use a central database | Windows host(s), normally a designated server | Windows-specific release build, installer, code signing, service management, upgrade/uninstall testing |
| Current local pilot | Node.js 24 plus Docker Desktop **or** an existing native PostgreSQL installation | Your pilot PC | Already supported for local preview; not the 100-user production deployment |

**Command Prompt is a launcher, not a substitute for Node.js.** A `.cmd` file tells Windows which programs to start. Node executes this Next.js application. Docker is optional packaging for the database; PostgreSQL is the database the app actually uses. Node can be bundled inside a signed installer so a user need not download it separately, but it still exists inside the product. A rewrite to .NET would use a different runtime and require redevelopment/testing of the app; opening Command Prompt does not convert it to a Windows executable.

A PWA gives a Start-menu/taskbar or iPad Home-screen icon, its own app window, and centralized updates. It still needs the server/network to read and save work; this app does not queue manufacturing records offline. Merely installing a shortcut does not configure sign-in or device restrictions.

**Decision to record:** choose central hosting for the 100-user rollout; decide whether the host is a company Windows Server VM, a Linux VM, or an approved managed Node hosting service. Windows users can use any of these server choices.

## 2. Establish company ownership and control

**Owner: your sponsor + IT/legal. Deliverable: approved ownership and repository plan.**

1. Identify the company legal entity that will own the custom software, its business owner, its technical owner and its support owner. Put at least two named people in recovery/admin roles.
2. Have legal confirm employee/contractor IP assignments and the company's rights to the custom/generated code and corporate branding. Have them approve the proprietary copyright/license wording. A private repository is an access control, not an IP assignment.
3. Create/use a **company-controlled GitHub organization or internal Git server**, under company accounts, billing, MFA and recovery—not an employee's personal account.
4. Transfer or import `pilleterijv/Manufacturing-Work-Platform` into that organization, preserving its Git history. Make the company copy private according to IT policy. Update Git remotes, deployment links and access after the transfer. Decide separately what to do with the existing public repository; previous public downloads cannot be recalled.
5. Give named maintainers the least access they need. Protect the release branch with reviewed changes and required checks. Tag production releases and record who approved them.
6. Retain third-party notices and comply with dependency licenses. See [license inventory](third-party-license-inventory.json). The custom layer may be proprietary; its open-source dependencies retain their licenses. Image-processing components include LGPL obligations that legal must review if distributing binaries.
7. Agree who owns operations: patching, user support, incidents, backups, restore tests, release approval and vendor integrations. Keep the source and deployment documentation accessible to that team so the app can be operated without this chat.

GitHub: [repository transfer](https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository), [repository visibility](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility).

## 3. Inventory the systems before connecting them

**Owner: IT + each system owner. Deliverable: one approved integration list.**

Create a row per source with: owner, hostname, **database name**, source API/view, read/write direction, equipment/person IDs, refresh frequency, permitted fields, retention, credentials location and test environment.

| System | First connection | What IT must confirm |
| --- | --- | --- |
| **Microsoft/Azure SQL** (`pharmsql.database.windows.net`, as supplied) | Read-only approved views to a scoped connected-data feed | Actual database name, private networking/firewall, authentication, approved view and SELECT-only identity. “PowerApps” alone does not establish the database name. |
| **TrakSYS 11.1.1.15411** | Down/running events via the existing source-key API or approved read-only SQL projection | Available/licensed APIs/views, machine IDs, timestamps/timezone, downtime state/reason mapping and event ordering |
| **Excel production results** | Values-only production-results template upload | Owner-approved mapping from current workbooks to `ExternalID`, `EquipmentID`, `Date`, `Produced`, `Good`, `Rejects`, optional `PersonID` |
| **MaintainX** | Explicit defect-to-work-order submission | API entitlement/key, organization ID if needed, asset IDs and a test organization. Work-order status sync and attachment transfer are not implemented. |
| **Company email** | TLS SMTP relay | Approved sender/relay, authentication, permitted recipients and company URL for reset links |
| **Employee identity/directory** | Current app accounts and department assignments | Entra tenant/identity policy and the approved HR/employee directory source. Full Entra SSO/MFA and automatic HR sync are not implemented. |

Do not connect every database with a shared administrator password. Approve a specific interface for each connection. Imported source data currently appears in read-only panels; it does not automatically become a native PM plan, user assignment or corrective action. Such write adapters require explicit field and permission rules and separate development/testing.

## 4. Provision staging first

**Owner: IT. Deliverable: a separate staging address with synthetic/pilot data.**

1. Provision a company-controlled host and record its OS, owner, patching schedule and service account. Start with a capacity review for approximately 100 users; concurrent use and video volume matter more than account count. Measure pilot performance before buying larger infrastructure.
2. Provision **PostgreSQL 17** for the app on a private network or use an approved managed PostgreSQL service. The application's primary database is PostgreSQL. Your existing Microsoft SQL server remains an integration source; replacing PostgreSQL with SQL Server would require a migration of the app's database code and testing.
3. Provision durable private photo/video storage: supported private Azure Blob storage or an IT-managed uploads directory with the right ACLs and backup policy. Do not use an ephemeral deployment directory for uploads.
4. Provision an HTTPS address using an **existing company domain/subdomain**, for example `https://manufacturing-staging.company.example`. IT owns DNS and installs a certificate trusted by PCs and iPads. Buying a separate domain is optional, not required.
5. Restrict inbound access to the approved company network/VPN/gateway as appropriate. Keep the app database private. Allow only approved outbound integration destinations; do not expose database ports to employee devices or the public internet.
6. Store secrets in the company's secret manager or tightly ACL-protected service configuration. Keep source, uploads, production data, credentials and backups separate. Do not place `.env` in Git.

For managed Node hosting, use an always-on service plan and supported startup process. A provider can supply Node on the server, so no one downloads it onto employee PCs. IT must still provide PostgreSQL, durable media storage, HTTPS, secrets and continuous background processing. Hosting-provider ownership of infrastructure does not remove company ownership/control of the app's code and data.

## 5. Build and install the server release

**Owner: the maintainer + IT. Deliverable: a reproducible staged release that survives reboot.**

Build on the intended server OS/CPU or in a matching CI environment. A Linux runtime copy may include Linux-specific binaries and is not a tested Windows release. Do not copy `node_modules` from one operating system to another.

1. Check out the reviewed release in a company build workspace.
2. Install the approved **Node.js 24 LTS** runtime/build tooling on the build machine. A company Windows Server can run Node natively; Docker is not required. PostgreSQL may also be installed natively or hosted separately.
3. Install locked dependencies with `npm ci`.
4. Supply private staging configuration using the approved secret mechanism. Set `DATABASE_URL` to PostgreSQL and `APP_ORIGIN` to the staging HTTPS origin. If using `DATABASE_SETUP_URL` for migration privileges, it must name the **same host, port and database** as `DATABASE_URL`. Use the separate runtime identity with the DML privileges required by the app and worker; keep schema administration restricted.
5. Run `npm run db:generate`, then `npm run db:setup`. Setup applies checksummed migrations. **Back up before upgrading an existing database.** Do not modify applied migration files to force an upgrade.
6. Create the first named Admin using `npm run user:create`. Set its temporary password privately and change it on first sign-in. There are no seeded production login credentials.
7. Run the appropriate checks, then `npm run build`. It prepares `.floorwork/runtime` with the server and worker tools.
8. Configure an automatically supervised process that launches `node scripts/start-runtime.cjs` from the release directory, with the private environment available. This launcher starts the web server **and background worker** by default. Do not rely on leaving an interactive Command Prompt window open.
9. For **Windows Server**, IT should use its approved service host/wrapper, set the working directory and restricted service account, configure automatic start/restart, and verify both child processes stop/restart correctly. Raw `node.exe` is not itself a Windows Service implementation; `sc create` alone does not turn arbitrary console code into a proper service. A signed MSI/service package is not included today.
10. For **Linux/systemd**, the sample `deploy/floorwork.service` starts only the web server. Install the matching [worker service template](../deploy/floorwork-worker.service) for a separately supervised worker (`node /opt/floorwork/.floorwork/runtime/tools/background-worker.cjs`) with the same private database/storage/integration configuration, or adapt supervision to use `scripts/start-runtime.cjs` and supervise its worker. Do not omit the worker. For managed hosting, ensure the worker runs continuously and does not get idled with the web app.
11. Configure the reverse proxy/load balancer for the company HTTPS address, preserving the expected Host, with request-size limits suitable for supported photo/video uploads. The sample [Caddy configuration](../deploy/Caddyfile) is a starting point. Its internal CA requires company-managed trust; use IT's trusted certificates for a rollout. The current app binds to loopback behind the proxy.
12. Reboot the host and verify login, record saving, media retrieval and worker health. Close all browser windows and confirm that overdue checks and queued mail still run.

**Do not use the local `START-FLOORWORK.cmd` for the company production URL.** It intentionally checks for `http://localhost:3000` and the local pilot database. Use the service deployment above for shared hosting.

## 6. Configure access and identity

**Owner: IT/security + department managers. Deliverable: an approved access matrix.**

1. Create a second named Admin for recovery. Create only approved pilot accounts or review registration requests. Approval starts accounts without department access.
2. Enter the official plant/department/area/equipment catalog. Use the same equipment IDs as your mapping register; do not create a new spelling for each integration.
3. Assign managers, DL/TLs and operators to the departments/areas/machines they need. Area 5S auditors need area/department access; machine-only access does not grant the whole area.
4. Review role capabilities, default department dashboards, required task evidence, task assignments, due dates and shift timezone. Test an operator from another department and a disabled account.
5. Configure SMTP and test registration invitations, password-reset links, shift alerts and overdue reminders using approved pilot recipients. Reset links require the real company HTTPS `APP_ORIGIN`.
6. **Before broad deployment**, implement and validate the company's required Entra SSO/MFA/session lifecycle and joiner/mover/leaver process. Existing local accounts plus an access gateway are not native Entra SSO. If security approves a restricted local-account pilot while that work is pending, record that exception explicitly.
7. Assign the app URL or PWA/web clip to company devices through Intune/MDM or another approved deployment tool. Company network access, identity groups and device policy—not merely the icon—make it company-exclusive.

## 7. Connect the systems one at a time

**Owner: the system owner + integration maintainer. Deliverable: a signed-off mapping and replay test for each source.**

1. **Excel first:** create an integration source and Excel production-results feed, download the template, map the equipment IDs and import a small known sample. Reconcile produced/good/reject counts against the source workbook. Re-import it and verify that stable IDs do not duplicate results. See [production imports](company-ownership-deployment.md#excel-production-results).
2. **TrakSYS:** create a dedicated source and map one pilot machine and reason. Use the installed version's approved API/gateway or read-only SQL view. Test down → running transitions, duplicate events, events out of order, network outages and conflicting manual downtime. Compare timestamps and durations with TrakSYS. See [factory integrations](factory-integrations.md).
3. **Company SQL:** IT creates a SELECT-only view and server-held credentials. The generic feed contract uses committed ordered `EventSequence` and JSON `Payload`, with explicit equipment/person mappings. Configure `EXTERNAL_DATA_FEEDS_JSON` privately, test failures/retries and compare results with SQL. Never paste unrestricted SQL or DB administrator credentials into the browser. See [database feeds](company-ownership-deployment.md#separate-database-feeds-for-operational-sections).
4. **MaintainX:** provision the API key privately, map equipment to asset IDs as Admin and submit a single approved test defect. Verify the returned work-order ID and content. Simulate an uncertain response and rehearse Admin reconciliation before any retry. See [MaintainX setup and limitations](five-s-tpm-access.md#defect-reporting-and-maintainx).
5. **Additional business systems:** repeat the approved-source inventory, mapping, least-privileged interface, staging validation and reconciliation. Prefer supported vendor APIs or approved views/outboxes over writing directly into vendor tables. Define which system owns each field and which direction it may flow. “Connected to the business” is a set of governed connections, not unrestricted access to every database.

## 8. Prove backup, security and operations

**Owner: IT/security + business owner. Deliverable: pilot acceptance evidence.**

1. Configure encrypted database and media backups, retention and ownership. Restore both into a separate test environment and demonstrate that historical records still display their photos/videos. Set recovery-time and data-loss targets with the business.
2. Review server, source repository, secret store, database and media permissions. Patch dependencies and the OS. Obtain an independent security review/penetration test appropriate to the deployment; passing development tests is not a certification against hackers.
3. Define log access/retention and alerting for web/worker failures, failed integrations, exhausted email retries, backup failures and storage usage. Do not log passwords, reset tokens or API keys.
4. Run a representative concurrency/load test and upload/storage test on production-like infrastructure. Include actual iPad models and slow workplace Wi-Fi.
5. Document release/rollback steps. Back up before schema upgrades; switching code back does not reverse a migration. Restore to a compatible version if a rollback needs older schema/data. Rehearse this in staging.

## 9. Pilot and roll out

**Owner: department sponsor + IT. Deliverable: explicit go-live approval.**

1. Pilot one department and a small group of operators, DL/TLs and managers. Include a full shift, missed work, a 5S-linked DL/TL run, a CIL, a defect, an idea and a problem action.
2. Compare recorded results and integrations against the existing source systems. Confirm that unauthorized departments, disabled accounts and inaccessible evidence remain blocked.
3. Collect issues and train users. Assign who responds to defects, overdue reminders, registration requests and integration failures.
4. Record business, security and IT sign-off. Create a separate production address/configuration, then publish the tested company release through the approved deployment process.
5. Expand department by department, monitor usage and keep a named support channel. Employees open the company URL or managed app icon; they do **not** install Node, Docker or PostgreSQL.

## 10. If a Windows setup wizard is still required

This is a separate packaging/release task, not something Command Prompt provides. Build the production runtime for Windows, bundle an approved Node runtime and required native libraries, connect to a central company PostgreSQL database, install a proper supervised service, store config/data outside the program directory with correct ACLs, and open the browser/PWA. Create a signed MSI/MSIX/EXE installer with your approved toolchain, preserve data on upgrades/uninstall, ship required third-party notices, and test on clean supported Windows machines without globally installed Node/Docker. Code-sign using the company's certificate and distribute through IT/Intune. Keep developer build tools out of the employee package.

An installer that bundles a local database on every employee PC would create separate copies of company data and is not the recommended shared 100-user architecture. Use a central database/server even when distributing a desktop shell or app shortcut.

## What is built versus pending

Built: the app's local-account/department permissions, device evidence, standard work, 5S, PM/CIL, problems/ideas, personal/department dashboards, Excel imports, scoped API/SQL feed framework, TrakSYS event handling, MaintainX submission adapter and SMTP notification/recovery support.

Pending company action/development: legal ownership/license approval, company repository transfer/privacy, real server/cloud provisioning, trusted DNS/HTTPS, live credentials/mappings and vendor entitlement, native Entra SSO/MFA/directory sync, independent security/load/restore review and a signed Windows installer if requested. No live company systems have been connected by writing this document.
