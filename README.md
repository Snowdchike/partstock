# PartsBox Clone

Open-source self-hosted electronic parts inventory, BOM, and build manager.
Inspired by [PartsBox](https://partsbox.com/) — built for a single workshop or small team that wants full control of their data.

## Status

**MVP Phase 1 — Foundation (done this session):**
- Authentication (register/login/logout/session) with argon2id + secure cookies
- CSRF protection on all mutating requests
- Parts CRUD + search
- Storage Locations (tree, cycle-detected)
- Lots (per-part, unique code)
- Stock adjustments (per part/lot/location) with audit log
- Security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy)
- Rate limiting
- Generic JSON error envelope, no stack-trace leakage
- 9 passing integration tests (auth, parts, locations, lots, stock, CSRF, cycles)
- SQLite for dev (zero install), PostgreSQL for production (same schema)

**Phase 2 — next session:** BOMs + CSV import + pricing; Builds (single/multi-stage with attrition); Purchase Orders; Labels (QR + barcode).

**Phase 3 — frontend:** React + Vite + TanStack Router + Tailwind UI.

**Phase 4 — polish:** i18n (vi/en), Playwright E2E, perf pass, security audit.

Full plan: `docs/superpowers/plans/2026-07-10-partsbox-clone.md`

## Quick start (development)

```bash
# Clone & install
git clone <this-repo> partsbox-clone
cd partsbox-clone
npm install

# Generate Prisma client + create SQLite DB
cd backend
npx prisma generate
DATABASE_URL="file:./prisma/dev.db" npx prisma db push

# Generate a session secret
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"

# Run dev server
SESSION_SECRET=<paste> DATABASE_URL="file:./prisma/dev.db" \
  npx tsx src/server.ts
# → http://127.0.0.1:3001/api/health
```

## Environment variables

See `.env.example`. Required:

- `SESSION_SECRET` — 32+ bytes, base64url-safe. Generate as above.
- `DATABASE_URL` — `file:./prisma/dev.db` (SQLite) or `postgresql://...` (production).

Optional with sane defaults: `HOST` (127.0.0.1), `PORT` (3001), `ALLOWED_ORIGINS` (csv), `LOG_LEVEL`, `RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_MAX`, `SESSION_TTL_DAYS`.

## Production (PostgreSQL)

Same schema, switch `DATABASE_URL` and run migrations:

```bash
cd backend
DATABASE_URL=postgresql://user:pass@host/db npx prisma migrate deploy
DATABASE_URL=... SESSION_SECRET=... npm start
```

## API

All `/api/*` (except `/api/health`, `/api/auth/register`, `/api/auth/login`) require an active session cookie.
Mutating endpoints additionally require the `x-csrf-token` header (echo of `pbx_csrf` cookie).

| Method | Path                              | Notes                            |
|--------|-----------------------------------|----------------------------------|
| GET    | `/api/health`                     | public                           |
| POST   | `/api/auth/register`              | public; first user becomes admin |
| POST   | `/api/auth/login`                 | public; sets cookies             |
| POST   | `/api/auth/logout`                | auth+CSRF                        |
| GET    | `/api/auth/me`                    | auth                             |
| GET    | `/api/parts?q=&limit=&offset=`    | auth; paginated                  |
| GET    | `/api/parts/:id`                  | auth                             |
| POST   | `/api/parts`                      | auth+CSRF                        |
| PATCH  | `/api/parts/:id`                  | auth+CSRF                        |
| DELETE | `/api/parts/:id`                  | auth+CSRF                        |
| GET    | `/api/locations`                  | auth                             |
| POST   | `/api/locations`                  | auth+CSRF                        |
| PATCH  | `/api/locations/:id`              | auth+CSRF; rejects cycles        |
| DELETE | `/api/locations/:id`              | auth+CSRF                        |
| GET    | `/api/lots?partId=`               | auth                             |
| POST   | `/api/lots`                       | auth+CSRF                        |
| DELETE | `/api/lots/:id`                   | auth+CSRF                        |
| POST   | `/api/stock/adjust`               | auth+CSRF; writes audit log      |
| GET    | `/api/stock/summary/:partId`      | auth                             |
| GET    | `/api/stock?threshold=`           | auth; low-stock report           |

## Tests

```bash
cd backend
npm test
# → 9 tests pass
```

## Security baseline

- Passwords: argon2id, 19 MiB memory cost
- Sessions: httpOnly, sameSite=strict, signed via HMAC
- CSRF: double-submit cookie, constant-time compare
- Rate limit: 100 req/15min general, 5/15min on auth (overridable)
- Body size limit: 256 KiB
- All input validated at boundary with Zod
- All DB queries parameterized via Prisma
- Errors return generic JSON; no stack traces
- Security headers via helmet

## License

MIT. Built for Sir's dad, and anyone else who wants to run their own parts inventory.
