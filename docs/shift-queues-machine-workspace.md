# Shift queues and machine workspace

The home screen now puts current work before optional dashboard panels. Operators see their shift work; maintenance roles can start with PMs, CILs and defects; supervisors and managers can review department exceptions and validation work.

## Configure the home screen

1. An administrator opens Permissions and edits the role.
2. Select the role's Home view: Operator, Department/team leader, Supervisor, Maintenance or Manager. Auto retains the built-in role default.
3. Save the role. This changes presentation only. Assign the required permissions and department/area/machine access separately.
4. Users can keep their saved dashboard layout under **Assignment panels and saved dashboard layout**. Dashboard settings can hide the shift queue if needed.

Custom maintenance and supervisor roles should explicitly select their home view. An account still has one role; its location assignments can cover multiple areas.

## Configure shift requirements

Use Shift requirements to assign published standard-work families, shifts and responsible people or a shared station. Requirements become effective for a full shift after their effective date. The queue compares the expected revision at shift start with recorded completions in that shift. A newer revision published during a shift does not invalidate its completed work.

The queue distinguishes current due work, completed work, previous missed work and items needing setup. It checks overnight shifts and configured time zones. Previous misses remain visible for the recent shift window; completing a current task does not erase a previous missed shift. If no requirements are configured, the screen says so rather than claiming everything is complete.

**My work** includes personal assignments and shared checks the user may perform. **Department work** requires the existing supervisor/manager review permissions and respects the account's location scope. Home-view selection never grants access.

The queue combines shift checks, PM/CIL plans, open defects, problem-solving actions, investigations and improvement validations. Due-today maintenance is labelled separately from future work. Urgent defects and overdue work appear first. Refresh reloads the queue; it is not a live machine feed. Large result sets display a limit notice and should be narrowed by area or machine.

## Find and work on the correct machine

Machine choices show name, line, area, department, plant and the unique equipment ID. This distinguishes identical machine names across lines. Avoid creating duplicate equipment records for the same physical asset.

The header is a **machine reminder**. Changing it does not switch a task that is already open. Recording forms show the actual machine immediately before submission. Check that label before saving.

Open **Machines**, choose an authorized asset, then select Instructions, Checks, Maintenance, Issues, Centerlines or History. Only sections allowed by the account's permissions appear. The workspace loads a limited first page for the selected section; open the full section for the complete history, evidence and editing controls.

## Navigation and shared devices

Frequently used tools stay visible. **More tools and history** opens the remaining permitted sections; **Find a section** searches section names. Queue and machine links open the relevant section with a machine or record filter. Planning and retirement controls are grouped separately from performing a maintenance check.

Use **Sign out / Change operator** when handing a shared tablet to another person. A browser's installed app still uses the same individual account and server permissions.

## Update an existing installation

Back up PostgreSQL and uploaded files using the company's normal process. Preserve the installation's private environment settings and uploaded files when updating source. Install dependencies and generate the Prisma client using the repository's normal update procedure, then apply the database setup/migrations before starting the updated runtime.

This release adds migration **017**, which stores the role home-view preference. Apply it through the repository migration runner; do not manually change or rerun older migration files. Existing permissions, assignments and recorded history are preserved. Use the repository's Codespaces startup procedure in Codespaces; do not replace its private environment file with an example.

The verification used disposable local PostgreSQL databases and synthetic accounts. It did not connect to company SQL, TrakSYS, MaintainX or email servers. Those connections and a pilot on the company's actual tablets, shift schedules and network still need IT validation. Entra SSO remains a separate implementation task.

## Screenshots

- [Maintenance home](screenshots/shift-queues-assets/maintenance-home.png)
- [Machine workspace](screenshots/shift-queues-assets/machine-workspace.png)
- [Recording target](screenshots/shift-queues-assets/recording-target.png)
- [Tablet recording](screenshots/shift-queues-assets/tablet-recording.png)
