# Install the four supplied Tableting leader standard works

This package contains the blank tasks from the four Word documents supplied November 18, 2026. It does not import completed employee records or publish the original Word files.

| Standard work             | Assigned Tableting area | Handoff                                                                                            |
| ------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------- |
| Compressing               | Compressing             | Rooms 1–10, item/lot, target/actual speed, remaining bags/bins, issues and next order              |
| Blending                  | Upstairs Blending       | 125 and 250 Blending, status, next order and materials split                                       |
| Weigh Room & Bin Blending | Weigh Room              | Weigh Rooms A–D, Bin Blending and Inspection; weighs left, clean bins, inspection and DSI yielding |
| Coating                   | Coating                 | CC1, CC2, AC3 and AC4; totes, rounds, solution readiness and recalculation                         |

The source's numbered tasks, subchecks, operational limits and one-hour 2D threshold are included as checklist instructions, not global machine or escalation settings. Repeated source tasks and source numbering are retained. Each app task has a distinct identity. Multi-paragraph instructions such as mixer settings remain together. Leader sign-off is the signed-in account and server-recorded completion time. The appended blank 2D form is represented by the existing Problem solving section, rather than duplicated as leader tasks.

## Update and install

1. Update the source on your existing branch, preserving private environment files, database volume and uploads. Back up your database and uploaded evidence first.
2. Apply migrations through **018** with the normal update procedure, generate the Prisma client and rebuild. In the normal Codespaces branch, stop the app, run `npm run codespaces:setup`, then `npm run codespaces:start`. For other supported installations, follow that branch's README update procedure. Do not edit previously applied migration files.
3. Sign in as the built-in **Admin**, open **Locations**, and expand **Install the four Tableting DL/TL standard works and department catalog**.
4. Choose or enter your actual plant/site name. Select **Install Tableting standard works and locations**.
5. Open **DL/TL Standard Work** to use the four published checklists. They are leader shift work, not timed process audits.
6. Assign DL/TL accounts to the relevant Tableting areas under Accounts. The Weigh Room checklist is anchored to Weigh Room but also covers Bin Blending and Inspection. Blending is anchored to Upstairs Blending and covers mezzanine activities. Give leaders the areas they actually oversee; installation grants no permissions.
7. Under Manage, choose an imported standard to assign specific leaders, link its 5S task to an approved area 5S plan, change evidence requirements, or publish a revision. Under Shift requirements, schedule the appropriate families/shifts if they should appear as due work in the shift queue.

Each checklist uses an area work point named **DL/TL area checklist — [area]**. These are explicit area checklist records, not claims that new physical machines exist. Existing equipment is left intact. You can also load any of the four document templates while creating a new leader standard against an existing appropriate asset in Manage.

## Departments and areas

The installer adds the complete existing reference catalog: 17 departments, 153 area entries and 17 department-level entries. Departments are Business Excellence, Gummies, Packaging, Tableting, Softgel, Warehouse, Maintenance/Facilities, Plant Services, Quality Control, Quality Assurance, Planning, Finance, Tech Ops, Engineering, Training, Site Operations and IT.

Tableting, Packaging, Gummies, Softgel, Warehouse and Maintenance/Facilities use their specific area lists from this conversation. The other departments use your shared Warehouse/Tableting/Gummies/Softgel/Packaging/Quality Control/Quality Assurance/Tech Ops/Office/IT list. Existing Maintenance spelling is retained if already used at the site. “Add option” is treated as form UI text, not a department.

Existing location casing and inactive entries are preserved. Installation refuses an inactive required Tableting department/area. Checklists, catalog and installation markers are created in one transaction. Concurrent/repeated installs do not duplicate checklists. User revisions, retirement and recorded executions are never overwritten. Reinstallation is not a way to restore retired work; use the existing revision/new-standard controls deliberately.

The installer must be run in your app database; updating GitHub source alone does not create records inside a running Codespace. No site name is guessed or installed automatically across all sites.

## Validation

Verification uses synthetic users and randomly named disposable PostgreSQL databases. See the accompanying tests for template completeness, saved handoffs, scope checks, repeat/concurrent installation and revision/history preservation. Company systems and actual production machines are not contacted by those tests. Screenshot: [Coating handoff on a tablet](screenshots/tableting-leader/coating-tablet.png).

This update also pins Next.js to 16.4.6, the security release offered by the earlier Codespaces prompt.
