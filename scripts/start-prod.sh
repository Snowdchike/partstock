#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"

if [[ -z "${SESSION_SECRET:-}" ]]; then
  echo "ERROR: set SESSION_SECRET first, e.g.:"
  echo '  export SESSION_SECRET="$(node -e "console.log(require('\''crypto'\'').randomBytes(32).toString('\''base64url'\''))")"'
  exit 1
fi

export NODE_ENV="${NODE_ENV:-production}"
export HOST="${HOST:-127.0.0.1}"
export PORT="${PORT:-3001}"
export DATABASE_URL="${DATABASE_URL:-file:./dev.db}"
export ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-http://127.0.0.1:3001,http://localhost:3001}"
export LOG_LEVEL="${LOG_LEVEL:-info}"

if [[ ! -f prisma/dev.db ]] && [[ "$DATABASE_URL" == file:* ]]; then
  echo "No SQLite DB yet — running prisma db push..."
  npx prisma db push
fi

echo "PartStock listening on http://${HOST}:${PORT}"
exec npx tsx src/server.ts
