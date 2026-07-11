# PartStock

Self-hosted **private** electronic parts inventory for a workshop or small team.

- Each user only sees **their own** parts / locations / stock (ownership isolation).
- No SaaS billing, no distributor pricing lock-in.
- Single Node process serves API + SPA (SQLite by default).

UI language: **Vietnamese (default)** + English.

## Features

- Auth (argon2id, session cookies, CSRF)
- Parts CRUD + search
- Storage locations (tree)
- Lots + stock adjust / summary
- BOM + KiCad-style CSV import
- Builds (pick list, reserve / complete / cancel)
- Labels (QR + Code128 SVG, browser print)
- Audit log, rate limits, CSP, Zod validation

## Requirements

- Node.js **20+**
- npm 9+

## Quick start (production — one port)

```bash
git clone https://github.com/Snowdchike/partstock.git
cd partstock
npm install

cd backend
DATABASE_URL="file:./dev.db" npx prisma db push

export NODE_ENV=production
export HOST=127.0.0.1
export PORT=3001
export DATABASE_URL="file:./dev.db"
export SESSION_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")"
export ALLOWED_ORIGINS="http://127.0.0.1:3001,http://localhost:3001"

npx tsx src/server.ts
# → http://127.0.0.1:3001
```

`frontend/dist` is committed so production works without a separate build step. Rebuild UI when needed:

```bash
cd frontend && npm run build
```

## Development

```bash
# terminal 1 — API
cd backend
DATABASE_URL="file:./dev.db" npx prisma db push
SESSION_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")" \
  DATABASE_URL="file:./dev.db" npx tsx watch src/server.ts

# terminal 2 — Vite (proxies /api → :3001)
cd frontend && npm run dev
# → http://127.0.0.1:5173
```

Copy `.env.example` → `backend/.env` if you prefer files over exports.

## Docs for end users (Vietnamese)

See **[docs/HUONG-DAN-BA.md](docs/HUONG-DAN-BA.md)** — install, run, backup, update.

## Tests

```bash
cd backend && npm test
# 20 tests: auth, parts, locations, lots, stock, boms, builds, labels, ownership, CSRF
```

## API (summary)

Session cookie required except `/api/health`, `/api/auth/register`, `/api/auth/login`.  
Mutating requests need header `x-csrf-token` = cookie `pbx_csrf`.

| Area | Prefix |
|------|--------|
| Auth | `/api/auth/*` |
| Parts | `/api/parts` |
| Locations | `/api/locations` |
| Lots / stock | `/api/lots`, `/api/stock/*` |
| BOMs | `/api/boms` |
| Builds | `/api/builds` |
| Labels | `/api/labels` |

## Security notes

- `SESSION_SECRET` ≥ 32 base64url chars (required)
- Per-user `ownerId` on inventory entities
- CSRF double-submit on POST/PATCH/DELETE
- CSP includes `connect-src 'self'` (SPA fetch)
- HSTS off by default so plain HTTP LAN works; put TLS at reverse proxy if exposed

## Stack

| Layer | Tech |
|-------|------|
| API | Node, Fastify, Prisma, Zod, argon2 |
| UI | React 18, Vite, TanStack Router/Query, Tailwind, i18next |
| DB | SQLite (default) or PostgreSQL via `DATABASE_URL` |

## License

MIT — see [LICENSE](LICENSE).
