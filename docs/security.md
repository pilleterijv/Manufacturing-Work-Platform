# Security controls and boundaries

No application can be guaranteed unhackable. This implementation provides application controls; it does not create an operating-system or network firewall.

## Implemented controls

- Individual accounts; no default credentials, public registration, or role-preview endpoint. First Admin is created using a trusted local CLI with hidden password input. Admin can provision/reset/disable users; temporary passwords require replacement before data access.
- Salted scrypt password hashes (N=32768,r=8,p=1; 64-byte derived key), 12–128-character passwords; simple repeated/common inputs rejected. Constant-time derived-key comparison and dummy hashing for unknown usernames.
- Random 256-bit session tokens, SHA-256 hashes stored in PostgreSQL. HttpOnly SameSite Strict cookies; Secure and __Host prefix when APP_ORIGIN uses HTTPS. Remembered devices expire after 30 days, ordinary sessions after eight hours and browser-session cookie expiry. Password changes and administrative account updates revoke sessions. Password/version checks and serializable transactions protect concurrent session creation/account resets.
- Server-side capability checks, current database policy per request, deny when policy is absent. Admin permissions protected; self-demotion/deactivation blocked, last active Admin protected. Roles are workspace-wide; plant/line restrictions are not present.
- Exact configured Origin required on JSON writes, content-type checks, streamed body caps (256 KiB ordinary requests, 12 MiB photos), and 15-second read deadline. Login account/global limits and per-person/global photo limits stored atomically in PostgreSQL. Incoming forwarding headers are not trusted for identity or bypass.
- Per-request nonce CSP, production strict-dynamic without unsafe-eval, object/base restrictions, trusted video frame hosts, frame-ancestors none, nosniff, no-referrer, restrictive permissions policy, private API caching, HSTS on configured HTTPS. React renders user text without raw HTML injection. Inline styles remain allowed for application styling.
- Uploaded JPEG/PNG/WebP images actually decoded, pixel limit 16MP, original-byte limit 8MiB, resized and reencoded as WebP with metadata removed. Two concurrent image jobs per app process; storage outside public files. Photo owner or an authorized viewer of a linked run/audit can retrieve it. Attaching someone else's photo is prohibited.
- Parameterized PostgreSQL queries and Prisma operations, Zod input validation, restricted trusted video URLs. Excel exports contain text values rather than user-supplied formulas.
- Transactional checksummed migration and immutable standard revisions; records retain their original standard snapshot, target/tolerance, answers, and raw timing data.

## Limitations and deployment requirements

- Local authentication only; Microsoft Entra SSO, MFA, emailed password recovery, and detailed administrative security event logging are not implemented.
- Browser timing records observations honestly but cannot attest operator identity, prevent stopwatch manipulation, or certify work compliance. Supervisors supply operator names/IDs.
- Counters require database availability and have global ceilings; distributed denial of service protection needs an ingress/WAF. Body deadlines and concurrency limits here are not a network firewall. Multiple app instances each have their own two-image concurrency limit.
- Infrastructure must enforce HTTPS, trusted host routing, inbound/outbound firewall policy, request/header/time limits, storage quotas, malware/content policy as required, monitoring, and patching.
- Back up PostgreSQL and photo storage together and test restores. Archive content rather than deleting historical executions. Orphaned uploads need a future retention/cleanup process; do not remove evidence linked to records.
- Azure Blob adapter is provided, but live private-container access is not verified. Default local storage requires a durable disk and appropriate filesystem permissions. YouTube/Vimeo may be blocked by workplace policy; video tests stub external playback.
- The Windows launcher is syntax checked and the source application is built/browser tested on Linux. It must still be exercised on a native Windows computer.

## Security regression checks

The browser suite checks authentication, four role boundaries, immediate policy changes, mandatory password replacement, logout token replay, photo ownership and attachment, invalid image rejection, trusted video URL validation, missing/cross-origin write rejection, oversized body rejection, CSP freshness and headers, and Excel output. Unit tests check statistical formulas, schema constraints, passwords, and unsafe embed URLs. These checks reduce regression risk; they are not an exhaustive penetration test.

## Downtime, leadership, ideas, and notifications

- Only the actual Admin role can change downtime reasons or shift configuration, even if another role has manage/training/permissions grants. Downtime/ideas/leadership module grants are checked server-side. Operators and supervisors can start/stop shared machine timers, including timers started by another team member. A partial unique database index permits only one open event per machine. Conditional stops prevent double writes; browser-provided durations and start/stop timestamps are ignored.
- Downtime events retain the equipment hierarchy, reason name, and shift schedule/time zone in force when they started. Archiving a reason does not prevent stopping an existing timer. Elapsed-time allocation uses actual instants and local shift boundaries, including overnight and daylight-saving changes. No manual backdating/editing/deletion interface is provided.
- Leadership grants intentionally allow aggregated reporting across all operational sections and departments. Filters do not restrict what a role is authorized to view. Dashboard XLSX additionally requires export permission. Global raw export adds downtime/idea sheets only when the caller has the corresponding grants; private notifications are never exported.
- Signed-in users with ideas permission receive only an active-account directory of IDs, names, and usernames to assign people. Accounts must be active when assigned. Idea creation, participant records, and the pilot notification are transactional. Creator identity is recorded independently of the selected submitter. Progress updates require pilot/validator/Admin authorization; completion is limited to validator/Admin. Version checks prevent stale progress overwrites.
- Notifications are private to the assigned recipient; both reads and mark-read writes use the current session identity. This implementation uses in-app delivery only, without sending external email. Login is required to see messages. Ideas themselves are shared across the authorized workspace and may be read by other people with ideas access. Do not place confidential personal information in an idea.
- Notification polling is 20 seconds. Operational lists show the latest 1,000 downtime events/ideas plus every active timer; private message history shows the latest 100 messages. Leadership aggregates and exports query their full scope rather than these UI limits.
