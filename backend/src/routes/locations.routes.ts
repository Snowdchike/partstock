import type { FastifyInstance } from 'fastify';
import { db } from '../db.js';
import { newId } from '../lib/ids.js';
import { BadRequestError, ConflictError, NotFoundError } from '../lib/errors.js';
import { CreateLocationSchema, UpdateLocationSchema } from '../schemas/location.schema.js';

async function wouldCreateCycle(id: string, newParentId: string, ownerId: string): Promise<boolean> {
  let cursor: string | null = newParentId;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor === id) return true;
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    const parent: { parentId: string | null; ownerId: string } | null = await db.storageLocation.findUnique({
      where: { id: cursor },
      select: { parentId: true, ownerId: true },
    });
    if (!parent || parent.ownerId !== ownerId) return true; // not your tree
    cursor = parent.parentId;
  }
  return false;
}

export async function registerLocationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/locations', { preHandler: [app.requireAuth] }, async (req) => {
    const ownerId = req.user!.id;
    return db.storageLocation.findMany({ where: { ownerId }, orderBy: { name: 'asc' } });
  });

  app.get<{ Params: { id: string } }>(
    '/api/locations/:id',
    { preHandler: [app.requireAuth] },
    async (req) => {
      const ownerId = req.user!.id;
      const loc = await db.storageLocation.findFirst({ where: { id: req.params.id, ownerId } });
      if (!loc) throw new NotFoundError('Location not found');
      return loc;
    },
  );

  app.post('/api/locations', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const input = CreateLocationSchema.parse(req.body);
    const ownerId = req.user!.id;
    if (input.parentId) {
      const parent = await db.storageLocation.findFirst({ where: { id: input.parentId, ownerId } });
      if (!parent) throw new BadRequestError('Parent location not found');
    }
    try {
      const loc = await db.storageLocation.create({
        data: {
          id: newId(),
          ownerId,
          name: input.name,
          parentId: input.parentId ?? null,
          description: input.description ?? null,
        },
      });
      return reply.status(201).send(loc);
    } catch (e) {
      if (String(e).includes('UNIQUE')) throw new ConflictError('Location name already exists');
      throw e;
    }
  });

  app.patch<{ Params: { id: string } }>(
    '/api/locations/:id',
    { preHandler: [app.requireAuth] },
    async (req) => {
      const input = UpdateLocationSchema.parse(req.body);
      const ownerId = req.user!.id;
      const existing = await db.storageLocation.findFirst({ where: { id: req.params.id, ownerId } });
      if (!existing) throw new NotFoundError('Location not found');
      if (input.parentId && (await wouldCreateCycle(req.params.id, input.parentId, ownerId))) {
        throw new BadRequestError('Parent assignment would create a cycle');
      }
      const data: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(input)) if (v !== undefined) data[k] = v;
      return db.storageLocation.update({ where: { id: req.params.id }, data });
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/locations/:id',
    { preHandler: [app.requireAuth] },
    async (req, reply) => {
      const ownerId = req.user!.id;
      const existing = await db.storageLocation.findFirst({ where: { id: req.params.id, ownerId } });
      if (!existing) throw new NotFoundError('Location not found');
      try {
        await db.storageLocation.delete({ where: { id: req.params.id } });
        return reply.status(204).send();
      } catch (e) {
        if (String(e).includes('FOREIGN KEY')) {
          throw new ConflictError('Location has stock or picks; remove them first');
        }
        throw e;
      }
    },
  );
}
