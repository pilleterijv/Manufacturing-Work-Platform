# Rebuild validation

Validated on October 30, 2026 in the managed Linux environment using Node 24.19.0, Next.js 16.4.3, PostgreSQL 17, Prisma 6.19.3 with the JS/pg adapter, and headless Chromium.

- Production build and TypeScript checking pass.
- Five unit tests pass: statistical formulas, trusted video URLs, immutable-step schema constraints, salted password hashing, and actual streamed body limits/origin checks.
- Browser workflow suite passes against the production server: individual login and remembered HttpOnly cookies; Yes/No standard execution with a real uploaded image; recorded stopwatch cycles; supervisor findings/photos/timing and target follow-ups; frozen revision snapshots after edits; training library and a stubbed approved provider iframe; six-sheet XLSX parsing; Admin/Manager/DL-TL/Operator permission boundaries; immediate role policy enforcement; photo read/attachment denial for another user; missing/cross-origin write denial; oversized-body and fake-image rejection; individual user creation; mandatory temporary-password replacement; logout-token replay rejection; account deactivation/session revocation; login throttling; self-demotion protection; mobile overflow checks; fresh CSP nonces; blocking a parser-inserted script without a nonce; image WebP decoding and metadata stripping.
- npm audit reports zero known vulnerabilities at validation time. This is not an exhaustive vulnerability assessment.
- Screenshots were captured from actual rendered UI, including a Manager entering a supervisor audit. Sample accounts and observations used for screenshots/tests are removed after verification.

Not verified on native Windows, against live Entra/Azure services, or against real external video playback. Entra sign-in is not implemented in this rebuild. The Windows launcher is syntax checked. Source application tests run on Linux. Review docs/security.md before deployment.

A fresh clone of the pushed branch independently passed npm ci, client generation, repeatable database setup, production build, type checking, and all five unit tests. The final browser run also covers guide archiving with training permission removed, denial of video archiving under that policy, and rejection of an unchanged temporary password.
