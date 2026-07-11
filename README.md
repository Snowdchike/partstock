# PartsBox Clone

Open-source self-hosted electronic parts inventory, BOM, and build manager.
Inspired by [PartsBox](https://partsbox.com/) — built for a single workshop or small team that wants full control of their data.

## Features (current MVP)

- **Authentication** — argon2id + secure cookies, first registered user is admin
- **Multi-user, isolated data** — each user sees only their own parts/locations/stock/lots
- **Parts inventory** — CRUD, search by name/MPN/manufacturer/description
- **Storage locations** — tree structure with cycle detection
- **Lots** — per-part unique codes (e.g. reel/barcode)
- **Stock** — adjust per part/lot/location, with low-stock report
- **BOMs** — multi-line BOM editor, owner-scoped, KiCad-style CSV import (no distributor pricing)
- **Audit log** — every state change recorded with user + IP
- **i18n** — Vietnamese (default) + English
- **Security** — CSP, HSTS, CSRF double-submit, rate limiting, no stack-trace leakage, body size cap, generic JSON errors
- **Single binary deploy** — Node serves API + built frontend, SQLite for dev, PostgreSQL for prod (same schema)

## Stack

- **Backend:** Node 20, Fastify, Prisma, Zod, argon2
- **Frontend:** React 18, Vite, TanStack Router + Query, Tailwind, i18next
- **DB:** SQLite (dev, zero install) / PostgreSQL (prod, same Prisma schema)
- **Tests:** Vitest

## Quick start (development)

```bash
git clone <repo> partsbox-clone
cd partsbox-clone
npm install

# Backend DB
cd backend
DATABASE_URL="file:./dev.db" npx prisma db push
SESSION_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")" \
  DATABASE_URL="file:./dev.db" npx tsx src/server.ts
# → http://127.0.0.1:3001/api/health
```

In another terminal, run the frontend dev server (proxies /api to backend):

```bash
cd frontend
npm run dev
# → http://127.0.0.1:5173
```

## Quick start (production — single port)

```bash
# Build frontend
cd frontend && npm run build && cd ..

# Run backend in production mode (also serves built frontend)
cd backend
NODE_ENV=production SESSION_SECRET=... DATABASE_URL="file:./dev.db" npx tsx src/server.ts
# → http://127.0.0.1:3001 (UI + API on same port)
```

For PostgreSQL: set `DATABASE_URL=postgresql://...` and run `npx prisma db push`.

## API

All `/api/*` (except `/api/health`, `/api/auth/register`, `/api/auth/login`) require session cookie.
Mutating endpoints require `x-csrf-token` header matching the `pbx_csrf` cookie.

| Method | Path | Auth+CSRF |
|--------|------|-----------|
| GET    | `/api/health` | – |
| POST   | `/api/auth/register` | – |
| POST   | `/api/auth/login` | – |
| POST   | `/api/auth/logout` | ✓ |
| GET    | `/api/auth/me` | auth |
| GET    | `/api/parts?q=&limit=&offset=` | auth |
| GET    | `/api/parts/:id` | auth |
| POST   | `/api/parts` | ✓ |
| PATCH  | `/api/parts/:id` | ✓ |
| DELETE | `/api/parts/:id` | ✓ |
| GET    | `/api/locations` | auth |
| POST   | `/api/locations` | ✓ |
| PATCH  | `/api/locations/:id` | ✓ |
| DELETE | `/api/locations/:id` | ✓ |
| GET    | `/api/lots?partId=` | auth |
| POST   | `/api/lots` | ✓ |
| DELETE | `/api/lots/:id` | ✓ |
| POST   | `/api/stock/adjust` | ✓ |
| GET    | `/api/stock/summary/:partId` | auth |
| GET    | `/api/stock?threshold=` | auth |
| GET    | `/api/boms?q=&limit=&offset=` | auth |
| GET    | `/api/boms/:id` | auth |
| POST   | `/api/boms` | ✓ |
| PATCH  | `/api/boms/:id` | ✓ |
| DELETE | `/api/boms/:id` | ✓ |
| POST   | `/api/boms/:id/lines` | ✓ |
| PATCH  | `/api/boms/:id/lines/:lineId` | ✓ |
| DELETE | `/api/boms/:id/lines/:lineId` | ✓ |
| POST   | `/api/boms/:id/import-csv` | ✓ |

## Security baseline

- argon2id (19 MiB, 2 t-cost), min 12-char password with mixed case + digit
- HttpOnly + sameSite=strict session cookies
- CSRF double-submit, constant-time compare
- CSP `default-src 'none'`, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- Rate limit 100/15min general, 5/15min on auth
- All inputs validated at boundary with Zod; parameterized queries via Prisma
- Errors return generic JSON envelope; stack traces only server-side

## Tests

```bash
cd backend && npm test
# → 15 tests pass (auth, parts, locations, lots, stock, boms, CSV import, CSRF, ownership)
```

## License

MIT. Built for Sir's dad, and anyone else who wants to run their own parts inventory.
