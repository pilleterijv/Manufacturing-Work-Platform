# Codespaces forwarding compatibility

A direct request with the public Host can return 200 while a tunnel request returns the application's 403 if the tunnel forwards a loopback Host. The browser's `:authority` describes the browser-to-tunnel request, not necessarily the tunnel-to-app Host. A service-worker response label alone does not establish caching; this application's worker passes live navigation responses through and caches only an offline notice.

The host policy now permits `localhost:3000`, `127.0.0.1:3000` or `[::1]:3000` only when all runtime conditions hold:

- `CODESPACES=true`;
- the validated Codespace name and forwarding domain construct exactly the configured HTTPS `APP_ORIGIN`;
- any supplied `X-Forwarded-Host` equals that public hostname or the same loopback Host (Next.js supplies the latter when the tunnel omits the header). Multiple or unrelated values are rejected.

Non-Codespaces deployments retain the existing exact public Host check. Cross-site API requests remain blocked. Login still requires an exact browser Origin match, and HTTPS session cookies remain secure. No authentication, database schema, account or data changes are included.

## Updating the earlier-version test branch

Keep your existing `.env` and database. Stop the app with Ctrl+C, then:

```bash
git pull --ff-only origin codex/test-before-codespaces
npm run build
npm start
```

Open port 3000 externally with HTTP as its internal protocol and Private visibility. APP_ORIGIN must still be the exact current HTTPS preview address. Do not recreate the database or rebuild the container for this patch.

Validation covers accepted and rejected forwarding variants, non-Codespaces isolation, cross-site API guards and the production runtime. This simulates the forwarding behavior locally; the affected live user Codespace is separate and still needs verification. An upstream GitHub tunnel 401 is a separate failure from this application 403.
