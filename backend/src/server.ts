import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { access, readFile } from 'node:fs/promises';
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
import { registerBomRoutes } from './routes/boms.routes.js';
import { registerBuildRoutes } from './routes/builds.routes.js';
import { registerLabelRoutes } from './routes/labels.routes.js';

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
      if (!origin) return cb(null, true); // same-origin / curl / server-side fetch
      for (const allowed of cfg.ALLOWED_ORIGINS) {
        // Wildcard support: '*' anywhere in the pattern matches any chars.
        // e.g. "https://*.serveousercontent.com" matches any subdomain,
        //      "http://10.*:3001" matches any 10.x.x.x host on port 3001.
        const starIdx = allowed.indexOf('*');
        if (starIdx === -1) {
          if (allowed === origin) return cb(null, true);
        } else {
          const prefix = allowed.slice(0, starIdx);
          const suffix = allowed.slice(starIdx + 1);
          if (origin.startsWith(prefix) && origin.endsWith(suffix)) {
            return cb(null, true);
          }
        }
      }
      return cb(new Error('CORS: origin not allowed'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    // Explicit headers so the browser's preflight succeeds for our CSRF header.
    allowedHeaders: ['Content-Type', 'x-csrf-token'],
    // Cache preflight for 1 hour to avoid extra round-trips.
    maxAge: 3600,
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
  await registerBomRoutes(app);
  await registerBuildRoutes(app);
  await registerLabelRoutes(app);

  // --- Static frontend (production) ---
  // In dev, run `npm run dev` in /frontend and it proxies /api to this server.
  // In production, build the frontend (`npm run build` in /frontend) and the
  // server serves the resulting dist/ as static assets + SPA fallback.
  if (cfg.NODE_ENV === 'production') {
    const here = dirname(fileURLToPath(import.meta.url));
    const distDir = resolve(here, '../../frontend/dist');
    const indexPath = resolve(distDir, 'index.html');

    // Fail fast with a helpful message instead of cryptic ENOENT on every request.
    try {
      await access(indexPath);
    } catch {
      throw new Error(
        `Frontend bundle not found at ${indexPath}.\n` +
          `Run \`cd frontend && npm run build\` (or \`npm run build -w frontend\` from root) before starting in production.`,
      );
    }

    // Cache index.html in memory — SPA fallback would otherwise read the file on every request.
    const indexHtml = await readFile(indexPath, 'utf8');

    // Serve static files from dist/ at root, but exclude index.html
    // (we serve that manually with cache control headers).
    await app.register(fastifyStatic, {
      root: distDir,
      prefix: '/',
      cacheControl: true,
      maxAge: '1y',
      immutable: true,
      // Don't list directory; serveFile is the action.
      decorateReply: false,
      // Skip index.html — we serve it ourselves from cache
      // (fastify-static doesn't have a built-in skip, so we intercept via a hook).
      constraints: {},
    });

    // Intercept index.html requests to use the cached copy with proper short cache.
    app.get('/index.html', async (_req, reply) => {
      return reply
        .type('text/html')
        .header('cache-control', 'no-cache')
        .send(indexHtml);
    });

    // SPA fallback: any non-/api, non-asset route returns index.html
    app.setNotFoundHandler(async (req, reply) => {
      // Don't serve SPA for /api/* — those should be 404 JSON.
      if (req.url.startsWith('/api')) {
        return reply
          .status(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Route not found', details: null } });
      }
      // For paths that look like static asset requests (have a file extension),
      // let the 404 stand — serving HTML would confuse the browser.
      // The static plugin already handled real assets; this catches typos in asset URLs.
      const lastSegment = req.url.split('?')[0]?.split('/').pop() ?? '';
      if (lastSegment.includes('.')) {
        return reply
          .status(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Asset not found', details: null } });
      }
      return reply.type('text/html').send(indexHtml);
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
