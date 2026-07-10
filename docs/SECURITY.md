# Security

## Implemented

### Authentication
- Passwords: **argon2id** with `memoryCost=19 MiB`, `timeCost=2`, `parallelism=1` (OWASP 2024 minimum).
- Min 12 chars, must include lowercase + uppercase + digit.
- First user to register becomes `admin`.
- Constant-time-ish login: always hashes a dummy password if the user doesn't exist, so timing doesn't leak account presence.

### Sessions
- Stored in `Session` table; ULID is the cookie value.
- Cookies: `httpOnly`, `sameSite=strict`, `secure` (production only), 7-day rolling expiry.
- Periodic cleanup of expired sessions (every hour).

### CSRF
- **Double-submit cookie pattern**: `pbx_csrf` cookie + `x-csrf-token` header.
- Enforced on all `POST`/`PUT`/`PATCH`/`DELETE`.
- Constant-time comparison.
- Bypassed only for `/api/health`, `/api/auth/register`, `/api/auth/login` (the two unsafe methods that establish the token).

### Transport & Headers
- HSTS (`max-age=15552000; includeSubDomains`).
- CSP: `default-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` plus the standard helmet additions.
- `X-Content-Type-Options: nosniff`.
- `X-Frame-Options: SAMEORIGIN`.
- `Referrer-Policy: no-referrer`.

### CORS
- Allowlist via env `ALLOWED_ORIGINS` (comma-separated).
- Credentials enabled only for allowed origins.

### Rate Limiting
- General: 100 req / 15 min / IP (configurable via `RATE_LIMIT_MAX`).
- Auth (login/register): 5 req / 15 min / IP.

### Input Validation
- All inputs go through Zod schemas (`src/schemas/`).
- 422 response with `details` array showing the path + message + code per issue.

### Error Handling
- All errors return a generic JSON envelope: `{ error: { code, message, details } }`.
- Server logs full details (stack, IP, request id) but **never returns stack traces**.
- Prisma errors mapped: `P2002` → 409, `P2025` → 404, `P2003` → 409.

### Body Size
- 256 KiB limit on all requests — blocks payload bombs.

### Audit
- Every state-changing endpoint writes an `AuditLog` row with user, action, entity, IP, payload.

## Out of scope (documented extension points, not built yet)

- 2FA / TOTP
- Password reset email flow
- Session revocation UI
- Security event alerting (e.g. webhook on brute-force attempts)
- Field-level encryption for `notes`/`description` (PII)
- SSRF-safe URL fetcher (no user-supplied URLs are fetched yet)
- Secrets manager integration (current model is `SESSION_SECRET` from env)

## Reporting a vulnerability

This is a private repo (not published). For now: file an issue or contact Sir directly.
