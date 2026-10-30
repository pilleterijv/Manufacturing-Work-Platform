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
