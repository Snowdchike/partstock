import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { loadConfig } from '../config.js';
import { fromZodError } from '../lib/errors.js';
import { SESSION_COOKIE_NAME, destroySession } from '../plugins/auth.js';
import { LoginSchema, RegisterSchema } from '../schemas/auth.schema.js';
import * as authService from '../services/auth.service.js';

const CSRF_COOKIE = 'pbx_csrf';

function setSessionCookie(
  reply: import('fastify').FastifyReply,
  sessionId: string,
  csrfToken: string,
  expiresAt: Date,
) {
  const cfg = loadConfig();
  const secure = cfg.NODE_ENV === 'production';
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

function clearSessionCookies(reply: import('fastify').FastifyReply) {
  reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  reply.clearCookie(CSRF_COOKIE, { path: '/' });
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/register', async (req, reply) => {
    const input = RegisterSchema.parse(req.body);
    await authService.register(input);
    return reply.status(201).send({ ok: true });
  });

  app.post('/api/auth/login', async (req, reply) => {
    const input = LoginSchema.parse(req.body);
    const meta = {
      userAgent: req.headers['user-agent'] ?? '',
      ipAddress: req.ip,
    };
    const result = await authService.login(input, meta);
    setSessionCookie(reply, result.sessionId, result.csrfToken, result.expiresAt);
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
