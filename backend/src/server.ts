import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { loadConfig } from './config.js';
import { disconnectDb } from './db.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerAuthPlugin } from './plugins/auth.js';
import { registerCsrfPlugin } from './plugins/csrf.js';
import { registerAuthRoutes } from './routes/auth.routes.js';
import { registerPartRoutes } from './routes/parts.routes.js';
import { registerLocationRoutes } from './routes/locations.routes.js';
import { registerLotRoutes } from './routes/lots.routes.js';
import { registerStockRoutes } from './routes/stock.routes.js';

export async function buildServer(): Promise<FastifyInstance> {
  const cfg = loadConfig();

  const app = Fastify({
    logger:
      cfg.LOG_LEVEL === 'silent'
        ? false
        : {
            level: cfg.LOG_LEVEL,
            ...(cfg.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
          },
    bodyLimit: 1024 * 256, // 256 KiB — generous for JSON, blocks payload bombs
    trustProxy: true,
  });

  // --- Plugins (order matters) ---

  await app.register(helmet, {
    // Strict CSP for an API: only same-origin by default
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'none'"],
        'frame-ancestors': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'no-referrer' },
  });

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // same-origin / curl
      if (cfg.ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error('CORS: origin not allowed'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });

  await app.register(cookie, { secret: cfg.SESSION_SECRET });

  // General API rate limit
  await app.register(rateLimit, {
    max: cfg.RATE_LIMIT_MAX,
    timeWindow: '15 minutes',
    allowList: ['127.0.0.1'],
    keyGenerator: (req) => req.ip,
  });

  // --- Decorators / handlers ---

  registerErrorHandler(app, { setNotFound: cfg.NODE_ENV !== 'production' });
  await registerAuthPlugin(app);
  await registerCsrfPlugin(app);

  // --- Routes ---

  app.get('/api/health', async () => ({
    ok: true,
    version: '0.1.0',
    time: new Date().toISOString(),
  }));

  await registerAuthRoutes(app);
  await registerPartRoutes(app);
  await registerLocationRoutes(app);
  await registerLotRoutes(app);
  await registerStockRoutes(app);

  // --- Static frontend (production) ---
  // In dev, run `npm run dev` in /frontend and it proxies /api to this server.
  // In production, build the frontend (`npm run build` in /frontend) and the
  // server serves the resulting dist/ as static assets + SPA fallback.
  if (cfg.NODE_ENV === 'production') {
    const here = dirname(fileURLToPath(import.meta.url));
    const distDir = resolve(here, '../../frontend/dist');
    // Serve static files only for the /assets prefix (hashed bundles), with long cache.
    await app.register(fastifyStatic, {
      root: distDir,
      prefix: '/assets/',
      cacheControl: true,
      maxAge: '1y',
      immutable: true,
    });
    // Serve root index.html
    app.get('/', async (_req, reply) => {
      const indexPath = resolve(distDir, 'index.html');
      const html = await readFile(indexPath, 'utf8');
      return reply.type('text/html').send(html);
    });
    // SPA fallback: any non-/api route returns index.html
    app.setNotFoundHandler(async (req, reply) => {
      if (req.url.startsWith('/api')) {
        return reply
          .status(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Route not found', details: null } });
      }
      const indexPath = resolve(distDir, 'index.html');
      const html = await readFile(indexPath, 'utf8');
      return reply.type('text/html').send(html);
    });
  }

  // --- Lifecycle ---

  app.addHook('onClose', async () => {
    await disconnectDb();
  });

  return app;
}

// Allow direct start: `node dist/server.js`
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const cfg = loadConfig();
  buildServer()
    .then(async (app) => {
      await app.listen({ host: cfg.HOST, port: cfg.PORT });
      app.log.info({ host: cfg.HOST, port: cfg.PORT }, 'server listening');
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Failed to start server:', err);
      process.exit(1);
    });
}
