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
import { registerScanRoutes } from './routes/scan.routes.js';
import { registerCategoryRoutes } from './routes/categories.routes.js';
import { registerTagRoutes } from './routes/tags.routes.js';
import { registerUrlImportRoutes } from './routes/url-import.routes.js';

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
    // SPA + same-origin API. default-src 'none' without connect-src blocks fetch()
    // (browser inherits connect-src from default-src → black screen after load).
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'blob:'],
        'font-src': ["'self'", 'data:'],
        'connect-src': ["'self'"],
        'object-src': ["'none'"],
        'worker-src': ["'self'", 'blob:'],
        'manifest-src': ["'self'"],
      },
    },
    // Local HTTP deploy for dad; HSTS + upgrade-insecure-requests break plain http://LAN
    hsts: false,
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
  await registerCategoryRoutes(app);
  await registerTagRoutes(app);
  await registerLocationRoutes(app);
  await registerLotRoutes(app);
  await registerStockRoutes(app);
  await registerBomRoutes(app);
  await registerBuildRoutes(app);
  await registerLabelRoutes(app);
  await registerScanRoutes(app);
  await registerUrlImportRoutes(app);

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
    const assetsDir = resolve(distDir, 'assets');

    // Only mount hashed bundles under /assets/* so HTML routes stay free.
    await app.register(fastifyStatic, {
      root: assetsDir,
      prefix: '/assets/',
      decorateReply: false,
      cacheControl: true,
      maxAge: '1y',
      immutable: true,
    });

    const sendHtml = async (
      _req: unknown,
      reply: { type: (t: string) => { header: (k: string, v: string) => { send: (b: string) => unknown } } },
    ) => reply.type('text/html').header('cache-control', 'no-cache').send(indexHtml);

    app.get('/', sendHtml as never);
    app.get('/index.html', sendHtml as never);

    app.setNotFoundHandler(async (req, reply) => {
      if (req.url.startsWith('/api')) {
        return reply
          .status(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Route not found', details: null } });
      }
      const lastSegment = req.url.split('?')[0]?.split('/').pop() ?? '';
      if (lastSegment.includes('.')) {
        return reply
          .status(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Asset not found', details: null } });
      }
      return reply.type('text/html').header('cache-control', 'no-cache').send(indexHtml);
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
