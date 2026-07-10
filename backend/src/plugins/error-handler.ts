import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError, UnauthorizedError, fromZodError } from '../lib/errors.js';

// Generic error envelope. Never leaks stack traces.
// Log full detail server-side, return sanitized JSON to client.
export async function registerErrorHandler(app: FastifyInstance): Promise<void> {
  app.setErrorHandler((err, req: FastifyRequest, reply: FastifyReply) => {
    // App-thrown errors (known shape)
    if (err instanceof AppError) {
      req.log.warn({ err, code: err.code }, 'app error');
      return reply.status(err.statusCode).send({
        error: { code: err.code, message: err.message, details: err.details ?? null },
      });
    }

    // Zod validation (raw, not wrapped)
    if (err instanceof ZodError) {
      const ve = fromZodError(err);
      return reply.status(ve.statusCode).send({
        error: { code: ve.code, message: ve.message, details: ve.details },
      });
    }

    // Prisma known errors → map to HTTP codes
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        const fields =
          (err.meta?.target as string[] | string | undefined)?.toString() ?? 'field';
        return reply.status(409).send({
          error: {
            code: 'CONFLICT',
            message: `Unique constraint violated: ${fields}`,
            details: null,
          },
        });
      }
      if (err.code === 'P2025') {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Resource not found', details: null },
        });
      }
      if (err.code === 'P2003') {
        return reply.status(409).send({
          error: {
            code: 'CONFLICT',
            message: 'Referenced resource is in use',
            details: null,
          },
        });
      }
    }

    // @fastify/session throws plain errors for missing/invalid sessions
    if (err.message?.toLowerCase().includes('unauthorized')) {
      return reply
        .status(401)
        .send({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized', details: null } });
    }

    // Fastify schema validation (route-level JSON schema)
    if (err.validation) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: err.message, details: err.validation },
      });
    }

    // Anything else: log it, return generic 500
    req.log.error({ err }, 'unhandled error');
    return reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error', details: null },
    });
  });

  // 404 handler
  app.setNotFoundHandler((_req, reply) => {
    return reply
      .status(404)
      .send({ error: { code: 'NOT_FOUND', message: 'Route not found', details: null } });
  });

  // Type-augment FastifyRequest so route handlers can use req.session without casts
  app.decorateRequest('user', null);
  app.decorateRequest('sessionId', null);

  // Silence unused-import warning — kept as a marker for future expansion
  void UnauthorizedError;
}
