# Architecture

## Layers

```
┌─────────────────────────────────────────────────────┐
│  frontend (Phase 3) — React + Vite                 │
│  Talks JSON to backend, holds session+CSRF cookies  │
└──────────────────┬──────────────────────────────────┘
                   │ HTTP (same-origin via vite proxy in dev)
┌──────────────────▼──────────────────────────────────┐
│  Fastify server  (src/server.ts)                    │
│  ┌────────────────────────────────────────────────┐ │
│  │ helmet (CSP, HSTS, X-Frame-Options, …)         │ │
│  │ cors (allow-list, credentials)                 │ │
│  │ cookie                                         │ │
│  │ rate-limit                                     │ │
│  └────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────┐ │
│  │ error-handler  → maps errors to JSON envelope  │ │
│  │ auth           → hydrates req.user, decorators │ │
│  │ csrf           → double-submit on POST/PATCH…  │ │
│  └────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────┐ │
│  │ routes  → auth, parts, locations, lots, stock  │ │
│  │   parses Zod schema, calls service, returns    │ │
│  └────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────┐ │
│  │ services  → business logic, transactions,      │ │
│  │             audit log                          │ │
│  └────────────────────────────────────────────────┘ │
└──────────────────┬──────────────────────────────────┘
                   │ Prisma client
┌──────────────────▼──────────────────────────────────┐
│  Database  (SQLite dev / PostgreSQL prod)           │
│  Schema in backend/prisma/schema.prisma             │
└─────────────────────────────────────────────────────┘
```

## Key invariants

1. **Single source of truth for IDs** — ULID everywhere (`lib/ids.ts`).
2. **All inputs validated** — every route handler runs `Schema.parse(req.body)` and throws `ZodError`, which the error handler maps to 422.
3. **No raw SQL** — Prisma only. No `$queryRawUnsafe` with user input anywhere.
4. **Auth-gated by default** — every route under `/api/*` except `/health`, `/auth/register`, `/auth/login` has `preHandler: [app.requireAuth]`.
5. **CSRF-gated on mutating verbs** — `preHandler` chain enforces the double-submit token.
6. **All money/quantity math goes through transactions** — `db.$transaction(async (tx) => …)` for any multi-write flow (e.g. stock.adjust + audit log).
7. **Audit log is append-only** — every state change writes an entry.

## Schema highlights

- `Part` is unique on `(manufacturer, partNumber)` — natural key for inventory lookups.
- `Lot` is unique on `(partId, code)` — reels/barcodes belong to one part.
- `StockItem` is unique on the triple `(partId, lotId, locationId)` — find or create pattern in `stock.adjust`.
- `StorageLocation.parentId` is self-referencing — tree with cycle detection at write time.
- `User.role` is a string (`admin` | `user` | `readonly`) — no enum type so we can add roles without migration.
- Every foreign key has an index. Every search column has an index.
