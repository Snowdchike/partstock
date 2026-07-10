import type { FastifyInstance } from 'fastify';
import { db } from '../db.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import { newId } from '../lib/ids.js';
import { CreateLotSchema } from '../schemas/lot.schema.js';

export async function registerLotRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/lots', { preHandler: [app.requireAuth] }, async (req) => {
    const partId = (req.query as Record<string, string>).partId;
    return db.lot.findMany({
      where: partId ? { partId } : {},
      include: { part: { select: { name: true, partNumber: true } } },
      orderBy: { receivedAt: 'desc' },
    });
  });

  app.post('/api/lots', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const input = CreateLotSchema.parse(req.body);
    const part = await db.part.findUnique({ where: { id: input.partId } });
    if (!part) throw new NotFoundError('Part not found');
    try {
      const lot = await db.lot.create({
        data: {
          id: newId(),
          partId: input.partId,
          code: input.code,
          receivedAt: input.receivedAt ?? new Date(),
          expiresAt: input.expiresAt ?? null,
          unitCost: input.unitCost,
          currency: input.currency,
          notes: input.notes ?? null,
        },
      });
      return reply.status(201).send(lot);
    } catch (e) {
      if (String(e).includes('UNIQUE')) {
        throw new ConflictError('Lot code already exists for this part');
      }
      throw e;
    }
  });

  app.delete<{ Params: { id: string } }>(
    '/api/lots/:id',
    { preHandler: [app.requireAuth] },
    async (req, reply) => {
      await db.lot.delete({ where: { id: req.params.id } }).catch(() => {
        throw new NotFoundError('Lot not found');
      });
      return reply.status(204).send();
    },
  );
}
