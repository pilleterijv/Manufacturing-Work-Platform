# Rebuild validation

Validated on October 30, 2026 in the managed Linux environment using Node 24.19.0, Next.js 16.4.3, PostgreSQL 17, Prisma 6.19.3 with the JS/pg adapter, and headless Chromium.

- Production build and TypeScript checking pass.
- Twelve unit tests pass: statistical formulas, trusted video URLs, immutable-step schema constraints, salted password hashing, and actual streamed body limits/origin checks.
- Browser workflow suite passes against the production server: individual login and remembered HttpOnly cookies; Yes/No standard execution with a real uploaded image; recorded stopwatch cycles; supervisor findings/photos/timing and target follow-ups; frozen revision snapshots after edits; training library and a stubbed approved provider iframe; nine-sheet XLSX parsing; Admin/Manager/DL-TL/Operator permission boundaries; immediate role policy enforcement; photo read/attachment denial for another user; missing/cross-origin write denial; oversized-body and fake-image rejection; individual user creation; mandatory temporary-password replacement; logout-token replay rejection; account deactivation/session revocation; login throttling; self-demotion protection; mobile overflow checks; fresh CSP nonces; blocking a parser-inserted script without a nonce; image WebP decoding and metadata stripping.
- npm audit reports zero known vulnerabilities at validation time. This is not an exhaustive vulnerability assessment.
- Screenshots were captured from actual rendered UI, including a Manager entering a supervisor audit. Sample accounts and observations used for screenshots/tests are removed after verification.

Not verified on native Windows, against live Entra/Azure services, or against real external video playback. Entra sign-in is not implemented in this rebuild. The Windows launcher is syntax checked. Source application tests run on Linux. Review docs/security.md before deployment.

A fresh clone of the pushed branch independently passed npm ci, client generation, repeatable database setup, production build, type checking, and all original five unit tests. The final browser run also covers guide archiving with training permission removed, denial of video archiving under that policy, and rejection of an unchanged temporary password.

## Downtime, ideas, and leadership extension

Eleven unit tests cover the existing statistical/security checks plus split-shift intervals, overnight shift dates, 7-hour spring-forward and 9-hour fall-back night shifts, zero/invalid intervals, shift configuration validation, real due dates, required assignments, and participant deduplication.

The operations browser suite passes for Admin-only reason/shift settings; Operator timer start/stop and persistence after reload; shared Supervisor stops; archived reasons and historical snapshots; two concurrent starts yielding one success/one conflict; double-stop conflicts; idea submission with all assignments and participants; private pilot messages and mark-read ownership; progress/completion restrictions and stale versions; inactive-person/date validation; exact department totals for work/studies/audits/downtime/ideas/resources; cross-shift allocation; overall and department dashboards; nine-sheet raw exports; four-sheet filtered leadership exports; immediate leadership permission revocation; and mobile overflow checks. Screenshots of the actual flows are stored in docs/screenshots. Native Windows validation remains outstanding.

Fresh-install and upgrade verification runs migrations in two isolated, randomly named local databases, including an existing 001 schema with customized Manager/Operator grants. Both migrations can be rerun without checksum changes or duplicate seeds, custom grants remain intact with the intended new capabilities appended, and no application users are created. Temporary test databases are removed afterward. Final production build, type checking, both browser suites, and eleven unit tests pass; dependency audit reports zero known advisories.

## Performance update

The production application is verified from a copied standalone runtime outside the source checkout, so server/module resolution cannot silently fall back to the development node_modules. Both browser suites pass there, including real photo storage against the preserved uploads directory and nine-sheet streamed XLSX parsing. The runtime's private account-creation CLI is exercised with a random temporary password, checking that it is not echoed and that the resulting account requires a password change. Database migration tools run without development dependencies.

A fixture benchmark with 160 standard-work records, 100 stopped downtime events, and 100 ideas verifies bounded history pages, exact overview totals, complete cross-page exports, and small summary/live polling payloads. The source archive and login JavaScript are measured separately. Full figures and limitations are in docs/performance.md. Build-cache tests verify source invalidation, ignored documentation changes, and missing-runtime rejection. Fresh/upgrade migration verification now includes migration 003.

## Tablet / private workplace deployment update (November 2, 2026)

Verified on Node 24.19.0, PostgreSQL 17 and headless Chromium in Linux:

- Production build and TypeScript checks pass.
- All 16 unit tests pass, including exact-origin/host policy, cursor validation,
  multi-sheet exports, slow consumption, cancellation and temporary-file cleanup.
- Fresh install and upgrades from 001 and 003 pass through migration 005;
  repeated setup keeps checksums and existing policy grants intact. The 003 upgrade fixture verifies retained account credentials, raw record JSON, photo links and idea content.
- Both existing browser workflow suites pass against a prepared runtime copied
  outside the source checkout: photos, immutable standards, account/session
  controls, permissions/revocation, CSP/CSRF, downtime, ideas and Excel exports.
- The new tablet suite passes: 768×1024 layout, install-banner/navigation spacing,
  PWA metadata, service-worker registration/control, offline reconnect fallback,
  cache containing only the public offline page, SQL aggregate statistics,
  department scope, latest-only standards and revision paging, 205 ideas with
  tied timestamps and a deleted page boundary, 105 downtime events, and role
  separation between department and overall dashboards.
- Performance fixtures pass with complete exports of 160 work records, 100
  downtime events and 100 ideas. Summary polling remains 222 bytes and empty
  active-timer polling 234 bytes in this fixture. Login script gzip transfer is
  181,195 bytes. These figures depend on fixture content and are not RAM claims.
- The prepared runtime contains 77,076,369 bytes across 3,085 files, excluding
  Node/PostgreSQL, caches, source and user data. The isolated bundled account tool
  passes its private-prompt/WASM/configuration-exclusion verification.
- npm audit reports zero vulnerabilities, including development dependencies,
  with the committed lockfile and patched ExcelJS minimatch override.
- Caddy 2 validates the private-HTTPS configuration with redirects disabled.

Representative screenshots are in docs/screenshots/tablet-department-dashboard.png
and tablet-offline.png; the existing desktop/mobile workflow gallery was refreshed.
Test accounts and their work records/photos are removed by the suites.

No workplace host, firewall, VPN or live site was modified. Deployment requires
an internal DNS name, trusted HTTPS certificate/CA distribution and network rules
for the actual workplace/VPN ranges. Native Windows execution and installation,
camera prompts and lifecycle behavior on physical iPad/Android devices have not
been executed here. Department filters organize aggregate reporting and do not
implement department membership/tenant isolation. Follow docs/tablet-deployment.md.
