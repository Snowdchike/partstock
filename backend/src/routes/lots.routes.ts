import type { FastifyInstance } from 'fastify';
import { db } from '../db.js';
import { newId } from '../lib/ids.js';
import { ForbiddenError, NotFoundError } from '../lib/errors.js';
import { CreateLotSchema } from '../schemas/lot.schema.js';

export async function registerLotRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/lots', { preHandler: [app.requireAuth] }, async (req) => {
    const ownerId = req.user!.id;
    const partId = (req.query as Record<string, string>).partId;
    // If partId given, verify ownership
    if (partId) {
      const part = await db.part.findFirst({ where: { id: partId, ownerId }, select: { id: true } });
      if (!part) return [];
    }
    return db.lot.findMany({
      where: {
        ...(partId ? { partId } : {}),
        part: { ownerId },
      },
      include: { part: { select: { name: true, partNumber: true } } },
      orderBy: { receivedAt: 'desc' },
    });
  });

  app.post('/api/lots', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const input = CreateLotSchema.parse(req.body);
    const ownerId = req.user!.id;
    const part = await db.part.findFirst({ where: { id: input.partId, ownerId } });
    if (!part) throw new NotFoundError('Part not found');
    // Unique (partId, code) conflicts map to 409 via error-handler P2002.
    const lot = await db.lot.create({
      data: {
        id: newId(),
        partId: input.partId,
        code: input.code,
        receivedAt: input.receivedAt ?? new Date(),
        expiresAt: input.expiresAt ?? null,
        notes: input.notes ?? null,
      },
    });
    return reply.status(201).send(lot);
  });

  app.delete<{ Params: { id: string } }>(
    '/api/lots/:id',
    { preHandler: [app.requireAuth] },
    async (req, reply) => {
      const ownerId = req.user!.id;
      const lot = await db.lot.findFirst({
        where: { id: req.params.id },
        include: { part: { select: { ownerId: true } } },
      });
      if (!lot || lot.part.ownerId !== ownerId) throw new ForbiddenError('Access denied');
      await db.lot.delete({ where: { id: req.params.id } });
      return reply.status(204).send();
    },
  );
}
