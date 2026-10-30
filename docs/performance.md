# Performance and download verification

Measured October 30, 2026 on Node 24.19.0 / Linux / headless Chromium against the previous committed application (`dd1e235`). These are measured artifact and transfer sizes, not a claim about total Windows computer memory or universal speedups.

| Measurement                                           |                         Previous |                      Optimized |                           Change |
| ----------------------------------------------------- | -------------------------------: | -----------------------------: | -------------------------------: |
| Compressed source archive                             |                  1,816,051 bytes |            about 159,000 bytes |                about 91% smaller |
| Login JavaScript, raw                                 |                    870,564 bytes |                  584,582 bytes |                      33% smaller |
| Login JavaScript, gzip                                |                    259,541 bytes |                  179,786 bytes |                      31% smaller |
| Dependency/build files vs prepared production runtime | 958,506,301 bytes / 28,338 files | 76,859,501 bytes / 3,065 files | 92% fewer bytes; 89% fewer files |
| Background operations response, fixture below         |                    272,326 bytes |                      222 bytes |               over 99.9% smaller |
| Initial platform data response, fixture below         |                    204,292 bytes |                   10,626 bytes |                      95% smaller |

The source archive measurement uses git archive with the committed .gitattributes; the screenshot gallery stays in GitHub but is excluded from downloads. Archive size varies slightly as documentation and tests change. GitHub may add a different enclosing folder name. Source ZIPs contain neither development dependencies nor a platform-specific executable.

The runtime comparison excludes the Node installation, PostgreSQL/Docker, npm download cache, application data/photos, and the source tree. First installation still needs temporary space for the development tools and an internet connection to download dependencies. The Windows launcher builds once, moves the necessary files into .floorwork/runtime, and removes node_modules and .next in normal mode. Subsequent starts reuse that runtime. Updates rebuild only when relevant source/configuration/dependencies/Node platform change. Build tools may be kept explicitly for development.

The isolated prepared runtime was copied outside the source checkout and used to run both complete browser suites. This prevents accidental fallback to the source checkout's dependency folders. Its bundled database setup and private first-administrator tools were also executed successfully, including non-echoed password input and required first-login password replacement. The package explicitly contains Prisma's query compiler WASM and excludes .env files and uploads. Storage remains at the original uploads directory, supplied by the launcher.

## Data and export fixture

The performance regression script creates one temporary account/equipment/standard, 160 standard-work records, 100 stopped downtime events, and 100 improvement ideas in a local development database. It then verifies:

- Initial overview: eight recent records, exact 160-run total, and no full account/policy/content history payload.
- History: first page of 100 plus second page of 60, with no duplicates or missing records. Chromium clicks Load more history and verifies all 160 table rows, then advances the browser clock to verify that the scheduled poll requests the small summary endpoint.
- Summary polling: 222 bytes with no history, people directory, or ideas. Live polling: 234 bytes when no timers are active. Private message content, active timers, and custom shift names affect real response sizes.
- Excel: all 160 standard-work records, 100 downtime events, and 100 ideas survive streamed export across database batch boundaries. No history pagination limit truncates the export.
- Background polling uses lightweight views only while the tab is visible; full operational data loads on section entry. Active timer clocks update once per second and stopped history rows are memoized.

Fixtures are removed afterward. Tests are local-only; do not run them against a workplace production database. The previous server used the same fixture data and Node version for response comparison. HTTP payload sizes are uncompressed unless explicitly marked gzip. The JavaScript comparison measures script assets referenced by the initial login document; feature bundles load later as needed.

## Remaining practical limits

The application still needs Node and PostgreSQL. Docker Desktop can consume substantially more memory than the application itself; the optional native PostgreSQL mode skips Docker but does not install or migrate the database automatically. Native Windows startup has not been executed in this Linux environment. The standalone runtime contains native platform dependencies and must be built on the target operating system/architecture; do not copy this Linux runtime to Windows.

Leadership reports still calculate across the selected date range; large datasets can require more database work than an operator's paged history. Streaming exports substantially reduce retained worksheet/record memory, but do not guarantee a fixed RAM ceiling or a transactionally frozen view of concurrent changes. Security controls and statistical definitions are retained. No cryptographic parameters were weakened to reduce memory.

## Reproduce

With the optimized production app running locally:

```sh
npm test
npm run test:browser
npm run test:operations
npm run test:migrations
npm run test:performance
RUNTIME_DIR=/path/to/isolated/runtime npm run test:runtime
npm run package:source
```

Set BASELINE_URL to a separately running local previous version to repeat response comparisons. The performance script saves non-secret measurements under ignored .measurements/. Screenshots are kept under docs/screenshots and remain available through GitHub.
