import type { FastifyInstance } from 'fastify';
import { db } from '../db.js';
import { newId } from '../lib/ids.js';
import { BadRequestError, NotFoundError } from '../lib/errors.js';
import { CreatePartSchema, PartQuerySchema, UpdatePartSchema } from '../schemas/part.schema.js';

const partInclude = {
  category: { select: { id: true, name: true } },
  partTags: { include: { tag: { select: { id: true, name: true, color: true } } } },
} as const;

function shapePart<T extends { partTags?: Array<{ tag: { id: string; name: string; color: string | null } }> }>(
  part: T,
) {
  const { partTags, ...rest } = part;
  return {
    ...rest,
    tags: (partTags ?? []).map((pt) => pt.tag),
  };
}

async function assertOwnedCategory(categoryId: string | null | undefined, ownerId: string) {
  if (!categoryId) return;
  const cat = await db.category.findFirst({ where: { id: categoryId, ownerId }, select: { id: true } });
  if (!cat) throw new BadRequestError('Category not found');
}

async function assertOwnedTags(tagIds: string[], ownerId: string) {
  if (tagIds.length === 0) return;
  const tags = await db.tag.findMany({
    where: { ownerId, id: { in: tagIds } },
    select: { id: true },
  });
  if (tags.length !== tagIds.length) throw new BadRequestError('One or more tags not found');
}

export async function registerPartRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/parts', { preHandler: [app.requireAuth] }, async (req) => {
    const q = PartQuerySchema.parse(req.query);
    const ownerId = req.user!.id;
    const where = {
      ownerId,
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(q.tagId ? { partTags: { some: { tagId: q.tagId } } } : {}),
      ...(q.q
        ? {
            OR: [
              { name: { contains: q.q } },
              { partNumber: { contains: q.q } },
              { manufacturer: { contains: q.q } },
              { description: { contains: q.q } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      db.part.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: q.limit,
        skip: q.offset,
        include: partInclude,
      }),
      db.part.count({ where }),
    ]);
    return {
      items: items.map(shapePart),
      total,
      limit: q.limit,
      offset: q.offset,
    };
  });

  app.get<{ Params: { id: string } }>(
    '/api/parts/:id',
    { preHandler: [app.requireAuth] },
    async (req) => {
      const ownerId = req.user!.id;
      const part = await db.part.findFirst({
        where: { id: req.params.id, ownerId },
        include: {
          ...partInclude,
          lots: true,
          stockItems: { include: { location: true, lot: true } },
        },
      });
      if (!part) throw new NotFoundError('Part not found');
      return shapePart(part);
    },
  );

  app.post('/api/parts', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const input = CreatePartSchema.parse(req.body);
    const userId = req.user!.id;
    await assertOwnedCategory(input.categoryId, userId);
    await assertOwnedTags(input.tagIds, userId);

    const part = await db.$transaction(async (tx) => {
      const created = await tx.part.create({
        data: {
          id: newId(),
          ownerId: userId,
          name: input.name,
          partNumber: input.partNumber,
          manufacturer: input.manufacturer ?? null,
          description: input.description ?? null,
          footprint: input.footprint ?? null,
          unit: input.unit,
          customFields: JSON.stringify(input.customFields),
          notes: input.notes ?? null,
          categoryId: input.categoryId ?? null,
          partTags: {
            create: input.tagIds.map((tagId) => ({ tagId })),
          },
        },
        include: partInclude,
      });
      await tx.auditLog.create({
        data: {
          id: newId(),
          userId,
          action: 'part.create',
          entityType: 'Part',
          entityId: created.id,
          payload: JSON.stringify({
            name: created.name,
            partNumber: created.partNumber,
            categoryId: created.categoryId,
            tagIds: input.tagIds,
          }),
          ipAddress: req.ip,
        },
      });
      return created;
    });

    return reply.status(201).send(shapePart(part));
  });

  app.patch<{ Params: { id: string } }>(
    '/api/parts/:id',
    { preHandler: [app.requireAuth] },
    async (req) => {
      const input = UpdatePartSchema.parse(req.body);
      const userId = req.user!.id;
      const existing = await db.part.findFirst({ where: { id: req.params.id, ownerId: userId } });
      if (!existing) throw new NotFoundError('Part not found');

      if (input.categoryId !== undefined) await assertOwnedCategory(input.categoryId, userId);
      if (input.tagIds) await assertOwnedTags(input.tagIds, userId);

      const part = await db.$transaction(async (tx) => {
        const data: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(input)) {
          if (k === 'tagIds') continue;
          if (k === 'customFields' && v !== undefined) data[k] = JSON.stringify(v);
          else if (v !== undefined) data[k] = v;
        }
        if (Object.keys(data).length > 0) {
          await tx.part.update({ where: { id: req.params.id }, data });
        }
        if (input.tagIds) {
          await tx.partTag.deleteMany({ where: { partId: req.params.id } });
          if (input.tagIds.length > 0) {
            await tx.partTag.createMany({
              data: input.tagIds.map((tagId) => ({ partId: req.params.id, tagId })),
            });
          }
        }
        await tx.auditLog.create({
          data: {
            id: newId(),
            userId,
            action: 'part.update',
            entityType: 'Part',
            entityId: req.params.id,
            payload: JSON.stringify(input),
            ipAddress: req.ip,
          },
        });
        return tx.part.findFirstOrThrow({
          where: { id: req.params.id },
          include: partInclude,
        });
      });

      return shapePart(part);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/parts/:id',
    { preHandler: [app.requireAuth] },
    async (req, reply) => {
      const userId = req.user!.id;
      const existing = await db.part.findFirst({ where: { id: req.params.id, ownerId: userId } });
      if (!existing) throw new NotFoundError('Part not found');
      await db.part.delete({ where: { id: req.params.id } });
      await db.auditLog.create({
        data: {
          id: newId(),
          userId,
          action: 'part.delete',
          entityType: 'Part',
          entityId: req.params.id,
          payload: '{}',
          ipAddress: req.ip,
        },
      });
      return reply.status(204).send();
    },
  );

  app.decorate('assertOwnsPart', async (partId: string, ownerId: string) => {
    const exists = await db.part.findFirst({ where: { id: partId, ownerId }, select: { id: true } });
    if (!exists) throw new NotFoundError('Part not found');
  });
}
