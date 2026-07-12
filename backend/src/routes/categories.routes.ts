import type { FastifyInstance } from 'fastify';
import { db } from '../db.js';
import { newId } from '../lib/ids.js';
import { BadRequestError, NotFoundError } from '../lib/errors.js';
import { CreateCategorySchema, UpdateCategorySchema } from '../schemas/category.schema.js';

async function wouldCreateCycle(id: string, newParentId: string, ownerId: string): Promise<boolean> {
  let cursor: string | null = newParentId;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor === id) return true;
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    const parent: { parentId: string | null; ownerId: string } | null = await db.category.findUnique({
      where: { id: cursor },
      select: { parentId: true, ownerId: true },
    });
    if (!parent || parent.ownerId !== ownerId) return true;
    cursor = parent.parentId;
  }
  return false;
}

export async function registerCategoryRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/categories', { preHandler: [app.requireAuth] }, async (req) => {
    const ownerId = req.user!.id;
    return db.category.findMany({
      where: { ownerId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { parts: true, children: true } } },
    });
  });

  app.get<{ Params: { id: string } }>(
    '/api/categories/:id',
    { preHandler: [app.requireAuth] },
    async (req) => {
      const cat = await db.category.findFirst({
        where: { id: req.params.id, ownerId: req.user!.id },
        include: { _count: { select: { parts: true, children: true } } },
      });
      if (!cat) throw new NotFoundError('Category not found');
      return cat;
    },
  );

  app.post('/api/categories', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const input = CreateCategorySchema.parse(req.body);
    const ownerId = req.user!.id;
    if (input.parentId) {
      const parent = await db.category.findFirst({ where: { id: input.parentId, ownerId } });
      if (!parent) throw new BadRequestError('Parent category not found');
    }
    const cat = await db.category.create({
      data: {
        id: newId(),
        ownerId,
        name: input.name,
        parentId: input.parentId ?? null,
        description: input.description ?? null,
      },
    });
    await db.auditLog.create({
      data: {
        id: newId(),
        userId: ownerId,
        action: 'category.create',
        entityType: 'Category',
        entityId: cat.id,
        payload: JSON.stringify({ name: cat.name }),
        ipAddress: req.ip,
      },
    });
    return reply.status(201).send(cat);
  });

  app.patch<{ Params: { id: string } }>(
    '/api/categories/:id',
    { preHandler: [app.requireAuth] },
    async (req) => {
      const input = UpdateCategorySchema.parse(req.body);
      const ownerId = req.user!.id;
      const existing = await db.category.findFirst({ where: { id: req.params.id, ownerId } });
      if (!existing) throw new NotFoundError('Category not found');
      if (input.parentId) {
        if (await wouldCreateCycle(req.params.id, input.parentId, ownerId)) {
          throw new BadRequestError('Parent assignment would create a cycle');
        }
      }
      const data: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(input)) if (v !== undefined) data[k] = v;
      const cat = await db.category.update({ where: { id: req.params.id }, data });
      await db.auditLog.create({
        data: {
          id: newId(),
          userId: ownerId,
          action: 'category.update',
          entityType: 'Category',
          entityId: cat.id,
          payload: JSON.stringify(data),
          ipAddress: req.ip,
        },
      });
      return cat;
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/categories/:id',
    { preHandler: [app.requireAuth] },
    async (req, reply) => {
      const ownerId = req.user!.id;
      const existing = await db.category.findFirst({
        where: { id: req.params.id, ownerId },
        include: { _count: { select: { children: true } } },
      });
      if (!existing) throw new NotFoundError('Category not found');
      if (existing._count.children > 0) {
        throw new BadRequestError('Category has children; move or delete them first');
      }
      await db.part.updateMany({
        where: { categoryId: req.params.id, ownerId },
        data: { categoryId: null },
      });
      await db.category.delete({ where: { id: req.params.id } });
      await db.auditLog.create({
        data: {
          id: newId(),
          userId: ownerId,
          action: 'category.delete',
          entityType: 'Category',
          entityId: req.params.id,
          payload: '{}',
          ipAddress: req.ip,
        },
      });
      return reply.status(204).send();
    },
  );
}
