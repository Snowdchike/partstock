import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { loadConfig } from '../config.js';
import { fromZodError } from '../lib/errors.js';
import { SESSION_COOKIE_NAME, destroySession } from '../plugins/auth.js';
import * as authService from '../services/auth.service.js';
import { LoginSchema, RegisterSchema } from '../schemas/auth.schema.js';

const CSRF_COOKIE = 'pbx_csrf';

// Tunnel-style proxies (serveo.net, localhost.run, ngrok, cloudflared) terminate
// TLS upstream and forward plain HTTP. They MUST set X-Forwarded-Proto: https,
// otherwise downstream cookie security gets miscomputed.
function isSecureRequest(req: FastifyRequest): boolean {
  const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.toLowerCase();
  if (proto === 'https') return true;
  if ((req.headers['x-forwarded-ssl'] as string | undefined)?.toLowerCase() === 'on') return true;
  return req.protocol === 'https';
}

function setSessionCookie(
  req: FastifyRequest,
  reply: FastifyReply,
  sessionId: string,
  csrfToken: string,
  expiresAt: Date,
) {
  const secure = isSecureRequest(req);
  reply.setCookie(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/',
    expires: expiresAt,
    signed: false, // session IDs are already high-entropy ULIDs (128 bits)
  });
  reply.setCookie(CSRF_COOKIE, csrfToken, {
    httpOnly: false, // must be readable by JS to echo via header
    secure,
    sameSite: 'strict',
    path: '/',
    expires: expiresAt,
  });
}

function clearSessionCookies(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  reply.clearCookie(CSRF_COOKIE, { path: '/' });
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  // Register creates the user AND immediately signs them in (sets session cookie).
  // This is the standard pattern for sign-up flows and avoids the 2-round-trip
  // race where the second request can lose the first response's Set-Cookie.
  app.post('/api/auth/register', async (req, reply) => {
    const input = RegisterSchema.parse(req.body);
    const user = await authService.register(input);
    // Re-use login flow so password verification, hashing params, and session
    // creation stay in lockstep.
    const meta = {
      userAgent: req.headers['user-agent'] ?? '',
      ipAddress: req.ip,
    };
    const result = await authService.login(
      { email: input.email, password: input.password },
      meta,
    );
    setSessionCookie(req, reply, result.sessionId, result.csrfToken, result.expiresAt);
    return reply.status(201).send({ user: result.user });
  });

  app.post('/api/auth/login', async (req, reply) => {
    const input = LoginSchema.parse(req.body);
    const meta = {
      userAgent: req.headers['user-agent'] ?? '',
      ipAddress: req.ip,
    };
    const result = await authService.login(input, meta);
    setSessionCookie(req, reply, result.sessionId, result.csrfToken, result.expiresAt);
    return reply.send({ user: result.user });
  });

  app.post('/api/auth/logout', { preHandler: [app.requireAuth] }, async (req, reply) => {
    if (req.sessionId) await destroySession(req.sessionId);
    clearSessionCookies(reply);
    return reply.send({ ok: true });
  });

  app.get('/api/auth/me', async (req, reply) => {
    if (!req.user)
      return reply
        .status(401)
        .send({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated', details: null } });
    return reply.send({ user: req.user });
  });
}

export { ZodError, fromZodError };
