import type { FastifyInstance } from 'fastify';
import { db } from '../db.js';
import { newId } from '../lib/ids.js';
import { NotFoundError } from '../lib/errors.js';
import { CreateTagSchema, UpdateTagSchema } from '../schemas/tag.schema.js';

export async function registerTagRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/tags', { preHandler: [app.requireAuth] }, async (req) => {
    const ownerId = req.user!.id;
    return db.tag.findMany({
      where: { ownerId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { partTags: true } } },
    });
  });

  app.post('/api/tags', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const input = CreateTagSchema.parse(req.body);
    const ownerId = req.user!.id;
    const tag = await db.tag.create({
      data: {
        id: newId(),
        ownerId,
        name: input.name,
        color: input.color ?? null,
      },
    });
    await db.auditLog.create({
      data: {
        id: newId(),
        userId: ownerId,
        action: 'tag.create',
        entityType: 'Tag',
        entityId: tag.id,
        payload: JSON.stringify({ name: tag.name }),
        ipAddress: req.ip,
      },
    });
    return reply.status(201).send(tag);
  });

  app.patch<{ Params: { id: string } }>(
    '/api/tags/:id',
    { preHandler: [app.requireAuth] },
    async (req) => {
      const input = UpdateTagSchema.parse(req.body);
      const ownerId = req.user!.id;
      const existing = await db.tag.findFirst({ where: { id: req.params.id, ownerId } });
      if (!existing) throw new NotFoundError('Tag not found');
      const data: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(input)) if (v !== undefined) data[k] = v;
      return db.tag.update({ where: { id: req.params.id }, data });
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/tags/:id',
    { preHandler: [app.requireAuth] },
    async (req, reply) => {
      const ownerId = req.user!.id;
      const existing = await db.tag.findFirst({ where: { id: req.params.id, ownerId } });
      if (!existing) throw new NotFoundError('Tag not found');
      await db.tag.delete({ where: { id: req.params.id } });
      return reply.status(204).send();
    },
  );
}
