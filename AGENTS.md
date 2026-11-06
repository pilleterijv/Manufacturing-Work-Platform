# Manufacturing Work Platform

## Project Principles

This application is intended for manufacturing-floor use.

Prioritize:

- Simple interfaces
- Large touch-friendly controls
- Tablet compatibility
- Mobile compatibility
- Minimal operator typing
- Fast workflows
- Clear Yes/No selections
- Photo capture from device cameras

## Architecture

Frontend:
Next.js with React and TypeScript

Database:
PostgreSQL

ORM:
Prisma

Authentication:
Microsoft Entra ID

File Storage:
Azure Blob Storage

Exports:
XLSX format

## Database Rules

- Never use Excel as the primary database.
- Store raw observations rather than only calculated values.
- Preserve historical standard-work revisions.
- Never delete historical executions when a standard changes.
- Use clear relationships between equipment, standards, runs, responses, time studies, and observations.

## Main Modules

- Equipment
- Standard Work
- Time Studies
- Analytics
- Users
- Troubleshooting

## Rebuild preservation and verification

Commit each meaningful checkpoint and push the task branch when repository access is available. Do not leave the only copy of working source in an ephemeral environment. Never claim an internal workspace link is a tested user download. Keep README download instructions pointed at the actual pushed branch.

Run production build, type checking, unit tests, and the browser workflow suite after relevant changes. Use random temporary test accounts and remove fixtures. Capture UI screenshots under docs/screenshots. Never add passwords, .env files, private photos, sessions, or dependency folders to commits.

This rebuild currently provides local account authentication and optional Azure Blob storage. Entra SSO is a documented implementation gap; do not imply it is available. Preserve immutable standards and historical executions. Do not edit an applied migration; add a new one.
