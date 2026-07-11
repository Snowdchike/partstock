# PartsBox Clone — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox `- [ ]` syntax.
>
> **Status:** Foundation (Tasks 1–10) executed in this session. Tasks 11+ documented as roadmap for next session.

**Goal:** Open-source self-hosted web app to manage electronic parts inventory, BOMs, builds, purchase orders, lots, storage locations — feature-parity with the public PartsBox product for a single workshop / small team (Sir's dad).

**Architecture:** Monorepo. TypeScript end-to-end. Node 20 + Fastify backend with Prisma ORM. SQLite for dev (zero-config) and PostgreSQL for production (single connection string switch). React 18 + Vite frontend. REST API + session cookies. Server-side rendering not used (SPA + JSON). Search via DB FTS.

**Tech Stack:**
- Runtime: Node 20 LTS (already installed)
- Backend: TypeScript, Fastify, Prisma, Zod, argon2, pino
- DB: SQLite (dev) / PostgreSQL (prod) — same Prisma schema
- Frontend: React 18, Vite, TanStack Router, TanStack Query, Tailwind, shadcn/ui patterns
- Tests: Vitest, Supertest, Playwright (E2E)
- Tooling: Biome (lint+format), pnpm
- i18n: i18next (vi, en)

**Non-goals (out of scope for MVP):** Stripe billing, multi-tenant SaaS, real-time WebSocket collab, barcode-scanner native app, supplier APIs (Mouser/DigiKey) — all are documented extension points but not implemented.

---

## Global Constraints

- **License:** MIT (open source, Sir's dad can use freely; no publish step required for self-hosted)
- **Repo privacy:** Local-only, do NOT push to any remote without explicit instruction
- **Security baseline:** All inputs validated at boundary with Zod; argon2id for passwords; httpOnly+sameSite=strict session cookies; CSRF tokens on all state-changing requests; CSP locked to self; rate limit on auth; parameterized queries via Prisma (never raw SQL with user input); no secrets in code; SSRF-safe on any user-supplied URL fetches
- **Performance:** API p95 < 200ms; page load < 3.5s on 4G; bundle < 250KB gzipped initial; DB indexed on every foreign key and every search column; pagination on every list endpoint
- **i18n:** All user-facing strings in `vi.json` + `en.json` from day one; Vietnamese default
- **TDD:** Write failing test, watch it fail, minimal code to pass, refactor, commit. No production code without a test that failed first.
- **Verification before completion:** No "done" claim without running the verification command and reading output.

---

## File Structure

```
partsbox-clone/
├── package.json                    # pnpm workspace root
├── pnpm-workspace.yaml
├── biome.json
├── tsconfig.base.json
├── README.md
├── .env.example                    # Committed
├── .gitignore
├── docs/
│   ├── superpowers/plans/          # This file
│   ├── ARCHITECTURE.md
│   ├── SECURITY.md
│   └── API.md
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   ├── src/
│   │   ├── server.ts               # Fastify bootstrap
│   │   ├── config.ts               # Env loading + validation
│   │   ├── db.ts                   # Prisma client
│   │   ├── plugins/
│   │   │   ├── auth.ts             # Session plugin
│   │   │   ├── csrf.ts
│   │   │   ├── rate-limit.ts
│   │   │   └── error-handler.ts
│   │   ├── routes/
│   │   │   ├── auth.routes.ts      # login/logout/register
│   │   │   ├── parts.routes.ts
│   │   │   ├── locations.routes.ts
│   │   │   ├── stock.routes.ts
│   │   │   ├── lots.routes.ts
│   │   │   ├── boms.routes.ts
│   │   │   ├── builds.routes.ts
│   │   │   ├── orders.routes.ts
│   │   │   ├── labels.routes.ts
│   │   │   ├── users.routes.ts
│   │   │   └── export.routes.ts
│   │   ├── services/
│   │   │   ├── auth.service.ts
│   │   │   ├── part.service.ts
│   │   │   ├── stock.service.ts
│   │   │   ├── bom.service.ts
│   │   │   └── build.service.ts
│   │   ├── schemas/                # Zod schemas (one file per domain)
│   │   ├── lib/
│   │   │   ├── ids.ts              # ULID generation
│   │   │   ├── labels.ts           # QR/barcode SVG generation
│   │   │   └── csv.ts              # BOM CSV parser
│   │   └── i18n/
│   │       ├── vi.json
│   │       └── en.json
│   └── tests/
│       ├── unit/
│       └── integration/
└── frontend/
    ├── package.json
    ├── vite.config.ts
    ├── tsconfig.json
    ├── tailwind.config.js
    ├── index.html
    └── src/
        ├── main.tsx
        ├── app.tsx                 # Router root
        ├── routes/                 # TanStack Router file-based
        ├── components/
        ├── lib/
        │   ├── api.ts              # Typed fetch client
        │   └── i18n.ts
        ├── i18n/
        │   ├── vi.json
        │   └── en.json
        └── styles/
```

---

## Task Index

### Foundation (executed this session)
- [x] Task 0: Repo init + monorepo skeleton
- [x] Task 1: Backend tooling (tsconfig, biome, scripts)
- [x] Task 2: Prisma schema (core entities)
- [x] Task 3: Server bootstrap with security headers
- [x] Task 4: Auth (register/login/logout) + argon2
- [x] Task 5: Sessions + CSRF plugin
- [x] Task 6: Error handler + rate limit plugins
- [x] Task 7: Parts domain (CRUD + search)
- [x] Task 8: Locations domain
- [x] Task 9: Lots + Stock domain
- [x] Task 10: Tests passing, server verified

### Phase 2 — BOMs and Builds (next session)
- [x] Task 11: BOMs CRUD + CSV import (pricing intentionally omitted)
- [x] Task 12: Builds (single-stage) with attrition + pick list + reserve/complete/cancel
- [ ] Task 13: Purchase Orders + receiving + barcode lookup
- [x] Task 14: Labels (QR + barcode SVG) + print page

### Phase 3 — Frontend
- [ ] Task 15: Vite + React + Tailwind setup
- [ ] Task 16: Auth pages (login/register)
- [ ] Task 17: Parts inventory page with search
- [ ] Task 18: Storage locations page
- [ ] Task 19: Stock detail + lots view
- [ ] Task 20: BOM editor + pricing view
- [ ] Task 21: Builds runner
- [ ] Task 22: Purchase orders page
- [ ] Task 23: Labels print page
- [ ] Task 24: Settings (users, RBAC, export/import JSON)

### Phase 4 — Polish
- [ ] Task 25: i18n vi/en on frontend
- [ ] Task 26: E2E tests (Playwright)
- [ ] Task 27: Performance pass (DB indexes, N+1 audit, bundle)
- [ ] Task 28: Security audit + SECURITY.md
- [ ] Task 29: ARCHITECTURE.md + API.md
- [ ] Task 30: README + run instructions for Sir's dad

---

## Phase 1 Foundation Tasks (executed)

### Task 0 — Repo init

**Files:** `package.json`, `pnpm-workspace.yaml`, `.gitignore`, `.env.example`

Create pnpm workspace with `backend` and `frontend` packages. Single root install.

### Task 1 — Backend tooling

**Files:** `backend/package.json`, `backend/tsconfig.json`, `biome.json`, `tsconfig.base.json`

Fastify + Prisma + Zod + argon2 + pino. Vitest for tests. tsx for dev.

### Task 2 — Prisma schema

**Files:** `backend/prisma/schema.prisma`

Core entities:
- `User` (id, email, name, passwordHash, role, createdAt)
- `Session` (id, userId, expiresAt, csrfToken)
- `StorageLocation` (id, name, parentId nullable, description)
- `Part` (id, name, partNumber, manufacturer, description, footprint, unit, customFields Json, notes, createdAt, updatedAt)
- `Lot` (id, partId, code, receivedAt, expiresAt nullable, unitCost, currency, notes)
- `StockItem` (id, partId, lotId nullable, locationId, quantity, reservedQuantity, createdAt)
- `Bom` (id, name, version, notes, createdAt)
- `BomLine` (id, bomId, partId, quantity, designator nullable)
- `Build` (id, bomId, name, status, attritionPercent, notes, createdAt)
- `BuildStage` (id, buildId, name, sequence, status)
- `BuildPick` (id, stageId, partId, lotId nullable, locationId, quantityRequested, quantityPicked)
- `PurchaseOrder` (id, supplier, status, orderedAt, expectedAt nullable, notes)
- `PoLine` (id, poId, partId, quantity, unitPrice, currency)
- `Label` (id, partId, lotId nullable, format, svgContent, createdAt)
- `AuditLog` (id, userId, action, entityType, entityId, payload Json, createdAt)

Every FK has an index. Every search column has an index (Part.name, Part.partNumber, Part.manufacturer, Lot.code, StorageLocation.name).

### Task 3 — Server bootstrap

**Files:** `backend/src/server.ts`, `backend/src/config.ts`, `backend/src/db.ts`

Fastify with helmet-equivalent headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy). Body size limit. CORS locked to env ALLOWED_ORIGINS. Compression on. Pino logger.

### Task 4 — Auth service + routes

**Files:** `backend/src/services/auth.service.ts`, `backend/src/schemas/auth.schema.ts`, `backend/src/routes/auth.routes.ts`

Register / login / logout / me. argon2id with 12 rounds. Email lowercase + validated. Password min 12 chars. Rate limit on login (5 attempts per 15 min per email + IP).

### Task 5 — Session + CSRF

**Files:** `backend/src/plugins/auth.ts`, `backend/src/plugins/csrf.ts`

Session cookie: httpOnly, secure, sameSite=strict, signed (HMAC-SHA256). 7-day rolling expiry. CSRF: double-submit cookie pattern, 32-byte token, constant-time compare, required on POST/PATCH/PUT/DELETE.

### Task 6 — Error handler + rate limit

**Files:** `backend/src/plugins/error-handler.ts`, `backend/src/plugins/rate-limit.ts`

Generic JSON error responses (no stack trace leak). Zod errors mapped to 422. NotFound → 404. Unauthorized → 401. Forbidden → 403. Rate limit: 100 req / 15 min / IP general; 5 / 15 min / IP on auth.

### Task 7 — Parts domain

**Files:** `backend/src/services/part.service.ts`, `backend/src/schemas/part.schema.ts`, `backend/src/routes/parts.routes.ts`

CRUD + search. Search matches name, partNumber, manufacturer, description (case-insensitive). Pagination (default 50, max 200). Custom fields stored as JSON validated against per-part schema. All endpoints behind auth + CSRF (except GET).

### Task 8 — Locations domain

**Files:** `backend/src/services/location.service.ts`, `backend/src/schemas/location.schema.ts`, `backend/src/routes/locations.routes.ts`

CRUD. Tree structure (parentId). Cycle detection on parent assignment. Used by stock items and labels.

### Task 9 — Lots + Stock

**Files:** `backend/src/services/stock.service.ts`, `backend/src/schemas/stock.schema.ts`, `backend/src/routes/stock.routes.ts`, `backend/src/routes/lots.routes.ts`

Stock = per (partId, lotId?, locationId). Adjustments write to AuditLog. Lot creates require unique code per part. Stock summary endpoint: per-part totals across lots/locations. Reservation on build picks.

### Task 10 — Verification

Vitest integration tests covering register→login→create part→search→stock adjust. Run, all green. Start server, curl `/api/health` and `/api/auth/me` (401 expected without cookie). Document evidence in commit message.

---

## Phase 2 Tasks (sketch for next session)

### Task 11 — BOMs

CSV import (KiCad-style: designator, quantity, MPN, manufacturer, description, footprint). Manual edit. Pricing endpoint: walk BOM, look up cheapest stock or cheapest supplier price break, return per-line and total cost in requested currency. Cycle detection for nested BOMs.

### Task 12 — Builds

Single-stage: take BOM, calculate picks (apply attrition), reserve stock, create pick list. Multi-stage: ordered sequence of stages, each with own pick list; later stages see reduced stock. Status flow: planned → in_progress → done / cancelled.

### Task 13 — Purchase Orders

Create PO from BOM shortages (shortage = required − available). Status: draft → ordered → partially_received → received → cancelled. Receive flow: scan lot code or MPN, increment stock.

### Task 14 — Labels

QR (data: MPN + lot code + url) and Code-128 (data: MPN). SVG output, no third-party barcode font needed (pure-JS generator). Print page = grid of labels sized for Avery 5160 / 5163 etc.

---

## Extension Points (documented but not built)

- `services/distributors/` — pluggable interface for Mouser/DigiKey API price breaks
- `services/scanner/` — WebSocket bridge to native barcode scanner app
- `services/notifications/` — email/webhook on low stock
- Real-time UI sync via SSE on stock changes

---

## Verification Checklist (per task)

- [ ] Watched test fail (RED)
- [ ] Wrote minimal code to pass (GREEN)
- [ ] Refactored while staying green (REFACTOR)
- [ ] No new linter errors
- [ ] No new TypeScript errors
- [ ] Committed with conventional message
- [ ] `pnpm --filter backend test` exits 0
- [ ] Server starts without errors
- [ ] Manual curl proves endpoint behavior
