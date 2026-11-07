# Department assignments, DL/TL work and visual troubleshooting

## Updating an existing Windows installation

Stop the app, back up PostgreSQL **and** uploads, and download the updated `codex/rebuild-floorwork` ZIP. Replace source while preserving `.env`, uploads, and the database volume. Run START-FLOORWORK.cmd. Migration 009 is additive and automatic; source changes trigger a rebuild. Windows execution still needs verification on Windows.

## Set up official locations first

As Admin, open **Accounts → Departments, areas and lines**. Add a department with its plant, then areas under that department and optional lines under each area. Existing equipment locations are imported into the catalog. Adding a department or area does not require creating a machine first. Case-insensitive duplicate catalog names are rejected; existing equipment and historical snapshots are not silently renamed or merged. Correct any historical spelling inconsistencies deliberately with IT rather than deleting history.

In **Manage → Add equipment**, choose plant, department, area and line from dropdowns. The server rejects locations outside the catalog and duplicate equipment names within the same location. Equipment and standard selectors show the full location to distinguish machines with identical names. Standard work, DL/TL and time-observation Excel sheets include separate plant, department, area, line and equipment-name columns alongside the stable equipment ID for sorting. Downtime reasons remain an Admin-managed dropdown catalog, with case-insensitive duplicate prevention. Action categories and checkpoint categories are controlled lists. Narrative problem descriptions and instructions remain free text.

## Assign people, managers and supervisors

In Accounts, select a person and save **Department and area assignments**. Assign entire departments, multiple areas, individual machines, or combinations. The same editor applies to Operators, DL/TLs and Managers. Whole-location assignments include future equipment; explicit machine assignments follow that machine. Roles still determine available functions. Only Admin can change accounts, policies or location assignments. Admin retains full access; Admin may deliberately grant another person all locations.

**Upgrade behavior:** non-Admin accounts with restricted downtime assignments inherit those as their initial workspace scope. Other non-Admin accounts start restricted with no assigned locations. Configure them before they resume work. New accounts also start without assignments. Saving workspace assignments increments the account version and invalidates existing sessions; the person signs in again.

Assignment scope applies to equipment, standards, current/revision/history reads, DL/TL execution, studies, problem cases/actions, ideas, guides, linked photos/videos, schedules, dashboards, notifications and exports. Downtime-specific assignments can narrow workspace access further; they cannot expand it. Reports and exports use the assigned equipment set even when a request directly names another department. Historical snapshots are retained, while current equipment assignments determine access. Global resources without equipment are company-shared, readable to signed-in users; only Admin can create/edit/archive those resources.

## DL/TL Standard Work

The former Supervisor audits navigation is now **DL/TL Standard Work**. In Manage, publish a standard with task type DL/TL Standard Work, choose equipment in its department/area, enter checklist steps and optional required photos, and optionally assign specific DL/TLs or managers. Without individual assignees, permitted users with the DL/TL capability in that location can execute it. With assignees, only those people (and Admin) can execute it. Multiple area assignments show tasks from all assigned areas.

The task type and equipment remain fixed within a standard family. Changes create a new revision. Old supervisor audit records are preserved; create the new dedicated DL/TL tasks in Manage. Operator name/context and cycle timing are optional for these checklists. Standard work steps still require Yes/No responses and required photos. Shift requirements can monitor either task type, independently for selected assignees or once per station, with the existing in-app/email switches.

## Problem-solving assignments and requirements

2D, 4D and 8D all support individually assigned Containment, Correction, Corrective and Preventive actions; 4D/8D also support controlled checkpoints. Each action has an owner, due date, status, evidence comment and required-for-closure flag. Edit descriptions, types, assignments, dates and requirements without deleting the audit history. Leaders/managers edit action details; assigned action owners can update progress/evidence. Assigned people must be active and have access to that equipment.

Each case has editable required methodology fields, a switch for requiring at least one tracked action, and optional requirements for completed actions of specified categories. These are saved per case and retained in change history. Closure requires the configured fields/categories and every required action to be complete. Optional unfinished actions remain visible in follow-up queues. Closure/reopening remains restricted to the assigned reviewer or Admin. The server checks requirements even when the UI is bypassed.

## Photos and videos in guides

In Troubleshooting, create or edit an equipment-specific guide. Upload device photos (JPEG/PNG/WebP, up to 8 MB) or videos (MP4/WebM/MOV, up to 32 MB), up to 20 attachments, with issue/fix captions. The photo editor supports freehand markup, text, rotation, drag-to-crop and undo. Saving an edit uploads a new reencoded image; an existing execution's photographic evidence is not overwritten.

Videos support authenticated byte-range playback. MP4/H.264 is recommended for iPads; MOV/WebM codec support depends on the browser. Video containers are signature-checked, not transcoded or malware-certified; video editing is not included. No additional FFmpeg installation is needed to run the app (the automated video test uses FFmpeg to generate a synthetic clip). Uploaded media stays in private local/Azure storage and is not cached offline. Keep storage quotas, backups and organizational media controls in place. Limits apply per process; configure equivalent ingress limits for the 46 MiB video JSON request limit. Current delivery reads at most one capped video file into memory per request, so size hosting for concurrent playback.

## Verification

`npm run test:locations` runs real API/browser checks using temporary accounts and synthetic records: catalog validation, unassigned defaults, cross-department denial, multi-area DL/TL assignments, task assignment bypass attempts, configurable closure and editable actions, private images/video ranges, actual canvas photo editing, scoped dashboards/Excel exports and assignment revocation. Fixtures are removed afterward. Screenshots are under `docs/screenshots/location-tasks`.
