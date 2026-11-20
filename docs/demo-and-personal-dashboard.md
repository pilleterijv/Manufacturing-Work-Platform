# A separate, fictional plant demo

The demo uses the same application code with an independent local PostgreSQL database named `floorwork_demo_<workspace-hash>`, independent media under `.floorwork/demo/uploads`, its own private `.env.demo`, an independent login cookie, and port **3001**. The operational app remains on port **3000** using its existing private settings and data. The demo seed has no operational-database mode: it rejects other database names/remote hosts and refuses an unmarked database containing accounts.

## Run it in your existing Codespace

Use the updated `codex/rebuild-floorwork` or `codex/test-before-codespaces` branch. Keep the normal app stopped during dependency installation/build; you can run both ports afterward.

```bash
git switch codex/test-before-codespaces
git pull
npm ci
npm run db:generate
npm run build
npm run demo:setup
npm run demo:start
```

Run one command at a time and stop if one fails. Demo setup requires the existing local pilot PostgreSQL service to be running and the local database account to be allowed to create another database. If needed, use the normal Codespaces setup to start its database first. The demo command does not install Docker Desktop and does not seed the normal database. It deliberately refuses company-hosted PostgreSQL connections; IT can provide a local pilot target if your app uses a remote database.

Demo setup now uses `.env.codespaces` automatically when running inside Codespaces and that file exists, matching the Codespaces launcher. An explicitly supplied `FLOORWORK_ENV_FILE` takes precedence; otherwise local runs use `.env`. No existing private file is rewritten. If setup fails, it reports missing settings, an unreachable service, rejected database login, missing create-database permission, or an in-use demo database without printing the connection string. Fix the reported service/configuration problem before retrying; do not delete database volumes or reset the operational database.

Leave the demo terminal running. In **Ports**, forward **3001** if it is absent, keep it **Private**, and choose **Open in Browser**. Use the current URL printed by `demo:start`; do not reuse port 3000’s address. Local desktop users can open `http://localhost:3001`. A private Codespaces port may first require GitHub sign-in in your regular browser.

In another terminal, read the generated fictional login details:

```bash
cat .floorwork/demo/accounts.txt
```

Demo users are `demo-admin`, `demo-operator`, `demo-leader`, `demo-manager`, and `demo-maintenance`. Setup generates a random demo-only password locally; it is not stored in Git or this guide. Do not reuse it for a real account. Start with `demo-admin` for all sections; then sign out and try each role to experience its actual area/function restrictions.

## What is populated

- Canonical department/area catalog and fictional equipment across multiple departments.
- Role-specific accounts, permissions, dashboard layouts and a pending registration request.
- Operator, DL/TL, process-verification and changeover instructions with historical completions.
- Raw time observations, dashboard charts, shared history and shift requirements.
- PM/CIL plans, completed inspections, 5S plans/audits and centerline readings including an out-of-limit example.
- Open/resolved defects and a fictional work-order reference, without contacting MaintainX.
- Downtime events, improvement ideas in several stages, and 2D/4D/8D cases with individual actions. The 4D includes a second example 5-Why path.
- In-app assignment notifications, synthetic production-result rows and a disconnected integration mapping.
- A generated equipment illustration and a short locally stored training video in guides/training and evidence views.
- The navigation assistant’s local help topics. External AI, company SQL, TrakSYS polling, MaintainX submission and email are disabled in demo mode.

Every page is labeled **DEMO — FICTIONAL SAMPLE DATA**. Browser title/install name also identify the demo. All people, measurements, issues and procedures are invented examples. They are not approved machine instructions, plant performance evidence or real integration confirmations.

The background worker is not launched in demo mode. The examples are seeded relative to setup time, and practice submissions remain usable; continuous import/email/automatic shift monitoring is deliberately off. The displayed example dates will age normally.

## Keep, reset or stop it

Running `demo:setup` again preserves existing practice data. Stop the demo with **Ctrl+C**. To rebuild its examples from scratch, stop the demo process first, then run:

```bash
npm run demo:reset
npm run demo:start
```

Reset checks the demo marker and replaces only the dedicated demo database. It does not remove operational records. It generates a new demo password, so read `accounts.txt` again. If you lose that credentials file, setup can regenerate demo-account passwords without deleting practice records. Old synthetic media files can remain after reset; they are confined to the demo media folder.

You do not need to ask for demo records to be removed from the real app: no demo records are inserted there. Do not copy `.env.demo`, the credentials file or the demo database contents into a production deployment.

# Personal dashboard and the initial sign-in warning

The Overview dashboard now shows **Assigned to me and my station**, including Admin accounts. Its default filter includes open and upcoming work, not just tasks already due. The assignment panels below it are open by default. Explicitly assigned standards appear even without a shift requirement; recurring standards retain shift/crew rules and do not become falsely completed by an old run. Future investigations and PMs remain discoverable. Shared station checks are labeled distinctly from personal ownership. Users who intentionally hid the queue can enable it again in Dashboard settings.

A protected dashboard read can fail after the account response succeeds. Previously the UI could keep the account header and an old “Sign in to continue” warning together. Read errors now retain their HTTP status: a current 401 rechecks the session and safely reloads reads once; an expired session returns to login. Obsolete refresh errors are ignored after a newer navigation/login. Password/login POSTs are not blindly repeated, and permission/origin checks remain in force.

The fix covers reproducible transient/stale-response cases. If a warning persists even after Refresh section, investigate the failing request, current host/session and server configuration rather than disabling security checks.

Verification includes 88 unit checks, production build/type checking, simulated transient/stale authentication reads, actual expired-session behavior, Admin/personal assignment visibility, shift/crew and role regressions, isolated seeding/repeatability, 21 demo section APIs, browser navigation through eight populated sections, protected demo image/video access, and all five demo-role logins. The actual `demo:setup` / `demo:start` commands were also smoke-tested on port 3001. Generated credentials, `.env.demo`, database files and `.floorwork/demo/uploads` remain outside Git/source downloads. The small fictional starter image/video in `scripts/demo-assets` are intentionally included.

## Shared demo records, readable history and attachments

Run `demo:setup` again after pulling the latest code; no reset is needed. The upgrade repairs the original fictional department grants, preserves practice records, adds two more cases for each of 2D and 4D (In progress and Closed), and creates deduplicated in-app overdue notifications using the application's real assignee and scope rules. Closed examples have completed actions and the required fictional closure evidence. Email remains disabled.

`demo-operator` sees Compressing in Tableting. `demo-leader`, `demo-manager` and `demo-maintenance` see Tableting across its areas, subject to their module permissions. `demo-admin` sees the entire demo. Shared history is visible across people within that scope; the personal assignment dashboard still lists personal/station work rather than every departmental task. No access restriction has been removed. The previous department grants accidentally omitted `area:null`, so the server correctly rejected them; the demo upgrade fixes those grants.

Photos open in a viewer with zoom, fit, Close and Open original. Videos keep inline playback and offer a larger viewer with native playback/fullscreen controls where supported. Protected media URLs still require an authorized signed-in session. Closing the larger viewer pauses its video. Guide, evidence and task-history attachments use the same viewer. Unsupported video formats depend on the device; MP4/H.264 is recommended.

The shipped photo is an AI-generated, realistic fictional equipment example, visibly labeled DEMO. It replaces only the original sample illustration in existing demos; user-uploaded practice images are preserved. The short training clip remains synthetic. These are sample navigation aids, not actual plant findings or approved procedures.

History tables now have larger body text, bolder titles/headers and clearer badges, with at least 14px supporting text throughout the interface. Click a history row, or focus it and press Enter/Space, to expand its full record in a full-width panel beneath the row. Task types and completion labels use plain language, and equipment names remain visible alongside each revision. Existing View record controls still work. Photos, videos and other controls inside a row keep their own actions.

Tablet machine reminders scroll with the page so they do not cover task answers or history while reviewing records. This update improves the supported floor workflows; readiness to replace a specific paper process still needs a pilot with the people who use that process.

## Reviewing problem-solving history and editing authority

Problem-solving list rows and their dashboard rows now open a read-only report directly, including keyboard Enter/Space. The report groups the machine/location, dates, people, methodology answers, both enabled 4D root-cause branches, evidence, actions/results and change history. An assigned contributor can choose **Edit record** separately. Linked people are resolved for the report even when their accounts have been disabled, without exposing their emails or other account settings. The view scrolls into sight when opened; a successful read no longer leaves the user looking at an apparently unchanged list lower down the page.

Use **Method filter** (2D/4D/8D), **Record status** and **Machine history**. All statuses includes closed cases. **Find past problems or root causes** searches descriptions, causes and fixes in the methodology answers as well as title/reference/equipment. The list includes the occurrence date and problem description. **History for this machine** returns to its case history. Searches cover only locations the account is authorized to view; similar text is a search result, not proof of a confirmed recurring root cause.

Role alone does not give managers permission to edit a case. Within location/module access, editing is permitted to the creator, explicitly assigned facilitator/reviewer, directory-selected participants, action owners, and Admin. An action-only contributor can update the status/result of their own action; other people's action progress requires membership of the case team. Only the creator, facilitator or Admin can change case-team assignments. Directory-selected participants also receive case assignment notifications and see the case in their personal work views. Typed team notes are descriptive and do not grant access. Older typed names are preserved, but must be selected from the directory by an authorized editor to become explicit account participants.

Only Admin can change required methodology fields, closure rules, or whether an action is required. Non-admin create uses the method defaults. An existing case retains its saved rules unless Admin changes them. These restrictions are validated by the API, not just disabled controls. Existing reviewer/Admin approval and closure-evidence checks remain in force; closed records must be reopened before modification.

This update adds migration **021**, a participant-ID array with an empty default; historical cases, answers, actions, typed teams and audit history are preserved. After pulling: run `npm run db:generate`, then build, then `npm run demo:setup` and `npm run demo:start`. Demo setup applies the migration only to its separate database; no reset is needed. For the normal app, run `db:setup` with the same private settings file that app uses before restarting it. For the managed Codespaces configuration, the command is `node --env-file=.env.codespaces --run db:setup`; for a local `.env` deployment, use `node --env-file=.env --run db:setup`. Keep a normal database backup under your company's existing process before updating its schema.

Verification uses disposable databases: 93 unit checks, production build/type checking, explicit outsider/participant/action-owner authorization tests, API attempts to weaken closure rules, closed-case/root-cause/machine searches, list and dashboard navigation, tablet report rendering, the existing problem-solving workflow, isolated demo roles and repeatability, and migrations including preservation of a pre-021 historical case.
