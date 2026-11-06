#!/usr/bin/env bash
set -euo pipefail
cd /workspace/Manufacturing-Work-Platform
if [ ! -f .env ]; then cp .env.example .env; fi
npm ci --cache /tmp/floorwork-npm --no-audit --no-fund
npm run db:generate
docker compose up -d db
for attempt in $(seq 1 30); do
  if docker compose exec -T db pg_isready -U work -d work_rebuild >/dev/null 2>&1; then break; fi
  if [ "$attempt" -eq 30 ]; then echo "PostgreSQL did not become ready" >&2; exit 1; fi
  sleep 1
done
npm run db:setup
