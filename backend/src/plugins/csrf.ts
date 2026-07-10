import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ForbiddenError } from '../lib/errors.js';
import { SESSION_COOKIE_NAME, getCsrfTokenForSession } from './auth.js';

const CSRF_HEADER = 'x-csrf-token';
const CSRF_FORM_FIELD = '_csrf';
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

// Double-submit cookie pattern.
// 1. On session creation, server stores csrfToken in DB and sets it as `pbx_csrf` cookie.
// 2. Client must echo the token back via header (preferred) or form field on mutating requests.
// 3. Server reads from DB (source of truth) and constant-time compares.
export async function registerCsrfPlugin(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (req: FastifyRequest, _reply: FastifyReply) => {
    if (!UNSAFE_METHODS.has(req.method)) return;
    if (!req.user || !req.sessionId) return; // auth plugin will 401 downstream

    const headerToken = (req.headers[CSRF_HEADER] as string | undefined) ?? undefined;
    const bodyToken =
      typeof req.body === 'object' && req.body !== null
        ? (req.body as Record<string, unknown>)[CSRF_FORM_FIELD]
        : undefined;

    const presented = headerToken ?? (typeof bodyToken === 'string' ? bodyToken : '');
    if (!presented) throw new ForbiddenError('CSRF token missing');

    const expected = await getCsrfTokenForSession(req.sessionId);
    if (!expected || !safeEqual(presented, expected)) {
      throw new ForbiddenError('CSRF token invalid');
    }
  });
}

export { SESSION_COOKIE_NAME };
