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
