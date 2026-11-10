# Suggested searches, section views and refreshing history

Operational sidebar entries now expand to **Dashboard** and **In detail**. The section toolbar offers the same switch. Detailed forms remain mounted while viewing the dashboard, so returning to a form does not discard its draft. Existing role and department/area permissions still determine which sections and records are available. Dashboard cards distinguish full matching totals from counts on the loaded page; status charts and sample lists describe the loaded records, not an invented whole-company total.

Search this section suggests permitted equipment, departments, areas, lines and section task titles. Find a person suggests accounts from the scoped employee/account directory and updates the person filter when selected. Type, click a suggestion, or use Arrow keys and Enter; Escape closes suggestions. Use Apply filters to load matching records. Free text remains available for descriptions. Choosing a machine or area now also matches standard lists, 5S plans and investigations. Older equipment-linked study records without a snapshot can still match their permitted equipment.

**Refresh section** reloads the current section and its independently loaded lists. **Refresh history** is also available next to standard-work/time-study/DL-TL histories, PM/CIL completions, 5S history, defects, problem records and downtime/idea lists. Refreshing history resets pagination to the newest matching page, retains filters, and does not reset an unfinished form. Newer list requests take priority over an older in-flight page load where supported. Applying different filters still starts a new filtered view.

## PostgreSQL and background services

The reported empty `docker compose ps` output showed the expected pilot database was not running. The subsequent OCI/runc “container ID already exists” error occurred before PostgreSQL could start. It is a Docker runtime failure, not a password-reset or shift-rule failure.

Startup now checks database connectivity and applied migrations before launching the app and worker. In the original/default Codespaces pilot only (Codespaces=true, local port 5432, work user, work_rebuild database, matching root Compose file), startup ensures the db container is running and allows time for it to become ready. Other database targets are checked without attempting to manage their services. No migration, account creation or data reset happens automatically.

The Compose database now has a health check and a restart policy. Database-related request and background errors include a fixed error code and a useful diagnosis rather than raw SQL, connection strings or credentials. The UI no longer claims “Database connected” based only on a signed-in account.

If Docker reports stale runtime state, preserve the named database volume and recreate only the container:

```bash
docker compose rm --stop --force db
docker compose up -d db
docker compose ps
```

Do not add `-v`, use `down --volumes`, or prune volumes. If the runtime error persists, retain its message for GitHub/Codespaces support. Deleting the Codespace can destroy its data.

For a missing-schema message, run `npm run db:setup` against the same configured database, then start the app. Applied migrations are preserved and checksummed. Never edit historical migrations. Runtime accounts need read access to migration metadata for the startup verification.

## Update an existing Codespace

Stop the app with Ctrl+C, then run in its terminal:

```bash
git pull --ff-only origin codex/test-before-codespaces
npm run build
npm start
```

If using the newer devcontainer setup on codex/rebuild-floorwork, pull that branch and use the existing codespaces setup/start commands instead. Keep the existing private environment file, accounts and named database volume. Refresh the browser after rebuilding. No new database migration is required for this update.
