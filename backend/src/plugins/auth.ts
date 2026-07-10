import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { loadConfig } from '../config.js';
import { db } from '../db.js';
import { ForbiddenError, UnauthorizedError } from '../lib/errors.js';
import { newId } from '../lib/ids.js';

// Side-effect import so @fastify/cookie augments FastifyRequest
import '@fastify/cookie';

declare module 'fastify' {
  interface FastifyRequest {
    user: { id: string; email: string; name: string; role: string } | null;
    sessionId: string | null;
  }
  interface FastifyInstance {
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (roles: string[]) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const SESSION_COOKIE = 'pbx_session';

export async function registerAuthPlugin(app: FastifyInstance): Promise<void> {
  // 1. Read session cookie, hydrate req.user
  app.addHook('preHandler', async (req) => {
    req.user = null;
    req.sessionId = null;
    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    const raw = cookies?.[SESSION_COOKIE];
    if (!raw) return;
    try {
      const session = await db.session.findUnique({
        where: { id: raw },
        include: { user: true },
      });
      if (!session) return;
      if (session.expiresAt.getTime() <= Date.now()) {
        // Lazy GC: delete expired session we happened to hit
        await db.session.delete({ where: { id: session.id } }).catch(() => {});
        return;
      }
      req.sessionId = session.id;
      req.user = {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        role: session.user.role,
      };
      // Sliding expiry: refresh lastSeen + extend expiry (capped at TTL_DAYS from createdAt)
      const cfg = loadConfig();
      const cap = new Date(session.createdAt.getTime() + cfg.SESSION_TTL_DAYS * 86_400_000);
      const next = new Date(Date.now() + cfg.SESSION_TTL_DAYS * 86_400_000);
      await db.session.update({
        where: { id: session.id },
        data: { lastSeen: new Date(), expiresAt: next < cap ? next : cap },
      });
    } catch (err) {
      req.log.warn({ err }, 'session lookup failed');
    }
  });

  // 2. requireAuth decorator
  app.decorate('requireAuth', async (req: FastifyRequest, _reply: FastifyReply) => {
    if (!req.user) throw new UnauthorizedError('Authentication required');
  });

  // 3. requireRole decorator factory
  app.decorate('requireRole', (roles: string[]) => {
    return async (req: FastifyRequest, _reply: FastifyReply) => {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      if (!roles.includes(req.user.role)) throw new ForbiddenError('Insufficient role');
    };
  });

  // 4. Periodic cleanup of expired sessions
  const cleanupInterval = setInterval(
    () => {
      void db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {});
    },
    60 * 60 * 1000,
  );
  app.addHook('onClose', async () => clearInterval(cleanupInterval));
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;

// Helper exported for auth routes
export async function createSession(
  userId: string,
  metadata: { userAgent?: string; ipAddress?: string },
): Promise<{ id: string; csrfToken: string; expiresAt: Date }> {
  const cfg = loadConfig();
  const id = newId();
  const csrfToken = newId() + newId(); // 52 chars, entropy > 256 bits
  const expiresAt = new Date(Date.now() + cfg.SESSION_TTL_DAYS * 86_400_000);
  await db.session.create({
    data: { id, userId, csrfToken, expiresAt, ...metadata },
  });
  return { id, csrfToken, expiresAt };
}

export async function destroySession(id: string): Promise<void> {
  await db.session.delete({ where: { id } }).catch(() => {});
}

export async function getCsrfTokenForSession(id: string): Promise<string | null> {
  const s = await db.session.findUnique({ where: { id }, select: { csrfToken: true } });
  return s?.csrfToken ?? null;
}

void newId; // ensure import is not tree-shaken
