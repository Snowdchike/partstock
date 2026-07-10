import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { loadConfig } from './config.js';
import { disconnectDb } from './db.js';
import { registerAuthPlugin } from './plugins/auth.js';
import { registerCsrfPlugin } from './plugins/csrf.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerAuthRoutes } from './routes/auth.routes.js';
import { registerLocationRoutes } from './routes/locations.routes.js';
import { registerLotRoutes } from './routes/lots.routes.js';
import { registerPartRoutes } from './routes/parts.routes.js';
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

  registerErrorHandler(app);
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
