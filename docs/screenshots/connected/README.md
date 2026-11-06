# Shift notifications and factory connections

These screenshots are from the running production build using synthetic users, standards, machine events and shift checks.

- `shift-requirements.png`: shifts, weekdays, optional per-person assignment, recipients, and separate in-app/email switches.
- `manager-alerts.png`: private missed-shift notifications delivered to a manager account.
- `integrations.png`: source/machine mappings and SQL connection status. SQL is intentionally unconfigured; the failed-poll health entry is a synthetic invalid-view test, not a live company connection.

No real company SQL data, employee email, credentials or integration keys are shown. Configure real SQL/TrakSYS and SMTP privately using the [IT setup guide](../../factory-integrations.md). The sample records/accounts are removed after capture.
