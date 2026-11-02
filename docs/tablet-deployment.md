# Install Floorwork on tablets

Floorwork is an installable web app (PWA). One shared server stores the database
and photos; tablets need a current browser, not Node, PostgreSQL, or Docker.
Modern iPadOS/iOS Safari, Android Chrome/Edge, and Windows Edge/Chrome can add it
to the home screen and open it in its own window. Old tablets and managed-device
policies may not support installation; the same app remains available in a browser.
It is not an App Store/Play Store binary and does not bundle a database per tablet.

## Tablet installation

1. Your administrator deploys the app at one trusted **HTTPS** address reachable
   from the tablet's workplace network or VPN. A certificate trusted by the device
   is required. `localhost` on a tablet refers to the tablet, not the server.
2. Open that address and sign in with an individual account.
3. On iPad/iPhone, use **Safari → Share → Add to Home Screen** (Open as Web App
   when offered). On Android use **Chrome → menu → Install app / Add to Home Screen**.
   The app also displays installation help; Chromium can offer an Install app button.
4. Open the home-screen icon. Use the device camera from a photo field as before.

The service worker caches **only `/offline.html`**, a public reconnect notice.
It does not cache login pages, authenticated HTML, APIs, records, session tokens,
photos, or exports. An internet/workplace-server connection is required to read
or save work. Closing a disconnected tablet can lose unsaved form input; an
unsaved form is not a completed execution. Existing server-side downtime timers
continue while a tablet disconnects. Reconnect before completing work.

The installation does not authorize the device: every API request still checks
its account/session and relevant permissions. Sign out on shared tablets and do
not select remembered sign-in there. Device lock, OS updates, MDM and remote wipe
remain the organization's responsibility. Android and iOS installation/camera UI
must be accepted on representative physical devices before rollout.

## Low-overhead shared server

Recommended starting design: **native Node 24 LTS + native PostgreSQL 17 + Caddy**
on one maintained Linux server. This avoids Docker Desktop's VM. Build once;
serve `.floorwork/runtime/server.js` in production. Do not run `next dev` as the
workplace server. Capacity depends on photo uploads, users and data: measure the
actual workload instead of treating the source/runtime disk size as RAM usage.

The files in `deploy/` are templates, not an executed deployment or firewall change:

- `floorwork.service`: unprivileged Linux service with read-only application files,
  private temporary storage, restricted home access and a writable uploads path.
  Change `/usr/bin/node` if Node was installed elsewhere.
- `floorwork.env.example`: copy to `/etc/floorwork.env` as private configuration
  owned by root and readable only by the service group (mode 0640).
- `Caddyfile`: HTTPS reverse proxy with request-size and network-read limits.
  Set `FLOORWORK_HOST` in Caddy's own service environment to your DNS name.
  Caddy's automatic public certificates require DNS and challenge reachability.
  For private names use your organization's trusted certificate/key configuration;
  do not disable TLS validation or teach users to ignore certificate warnings.

Provision the `floorwork` service user, `/opt/floorwork` (application readable,
not writable by that user) and `/var/lib/floorwork/uploads` (owned by the service
user, mode 0700). Set `HOSTNAME=127.0.0.1`, `PORT=3000`,
`UPLOADS_DIR=/var/lib/floorwork/uploads` and the exact public `APP_ORIGIN`, e.g.
`https://floorwork.example.com`. The application rejects alternate Host headers;
Caddy must preserve the public Host (its default behavior). Readiness probes must
supply that Host too. Do not trust a client-provided forwarded Host as authority.

Build on the deployment OS/CPU architecture. The prepared runtime includes native
modules and is not portable between Linux and Windows. Keep source/migrations
alongside it for maintenance; provision dependencies for the build, not every launch.
Use a controlled maintenance step to run `npm run db:generate`, `npm run db:setup`
and `npm run build` as appropriate, then restart the application service. The
existing Windows double-click launcher is for a local computer and intentionally
remains loopback-only; do not use it to expose a workplace service.

## Firewall and data boundaries

For workplace-only access, use your existing VPN or trusted internal network.
Do not add a public router port-forward for PostgreSQL or the Node server.
Have the network administrator apply rules suited to the actual host/subnets:

| Direction            | Allow                                                                    | Restrict                 |
| -------------------- | ------------------------------------------------------------------------ | ------------------------ |
| Tablet → server      | TCP 443 from approved workplace/VPN ranges                               | Other client sources     |
| Reverse proxy → app  | Loopback TCP 3000                                                        | External access to 3000  |
| App → database       | Loopback TCP 5432, or a private DB network with TLS                      | Public database access   |
| Administrator → host | Managed admin/VPN access                                                 | General Internet SSH/RDP |
| Server outbound      | Required DNS/time/certificate services; HTTPS updates during maintenance | Unneeded destinations    |

If public ACME HTTP validation is used, port 80 must be reachable for that
challenge/HTTPS redirection. Otherwise use your approved internal certificate or
DNS validation process. This template does not silently change firewall rules,
SSH access, corporate proxy policies or VPN settings.

Azure Blob Storage is optional: use a private container, HTTPS and credentials
limited to the needed container. External YouTube/Vimeo playback needs the
organization's approved provider destinations; omit external videos where outbound
Internet access is prohibited. Entra SSO is **not implemented**; no Microsoft login
firewall exceptions are necessary for local account authentication.

Keep PostgreSQL listening on loopback with SCRAM password authentication and a
non-default private password. The development Compose credentials are for a
local test database only. Runtime credentials should have SELECT/INSERT/UPDATE/
DELETE on application tables, not superuser, CREATE DATABASE, or schema ownership.
Run migrations as a separate maintenance identity using `DATABASE_SETUP_URL`
for the migration connection, then remove that variable from the service's
configuration. The runtime `DATABASE_URL` identity also needs the normal table
permissions for setup seeds/cleanup. Do not put the maintenance credential in
Git or chat. For an existing database, preserve its volume/data when changing hosts.

Back up **both PostgreSQL and uploads** (or private Blob objects) with encryption,
retention and restore tests. Take a backup before migration 004. Do not delete
historical records to reduce memory usage. Reports and libraries respect retained
snapshots, and applied migrations retain their checksums.

## Permissions and reporting

Migration 004 adds a `dashboard` aggregate-report grant to existing valid role
policies; new installations include it for all four default roles. Review custom
role policies after upgrade. Accounts and raw histories remain protected by their
existing permissions. Admin/Manager leadership access allows the overall view;
the separate department dashboard returns a selected department's aggregates and
requires its own grant. It defaults to the first equipment department when a
non-leadership user has not selected one. Revoke `dashboard` to remove department
report access, and `leadership` to remove the overall dashboard.

Department filters are **reporting scope, not departmental tenant isolation**.
Authorized dashboard users may select any department in the workspace. There is
no user-to-department access assignment in this application. If departments must
be prevented from seeing one another's aggregates or records, implement and test
an explicit membership policy before rollout. The dashboard returns aggregates;
it does not expose employee passwords, sessions, raw responses or photo contents.

Work/studies/audits/downtime and new ideas use the reporting date range. Equipment,
current standards, libraries and the idea pipeline show their current state.
Training/guide figures are library counts, not training completions/certifications.
No scheduled-work completion percentage is claimed without a scheduling module.
