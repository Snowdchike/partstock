import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { newId } from '../lib/ids.js';
import { ForbiddenError, NotFoundError } from '../lib/errors.js';
import { CreatePartSchema, PartQuerySchema, UpdatePartSchema } from '../schemas/part.schema.js';

export async function registerPartRoutes(app: FastifyInstance): Promise<void> {
  // List + search (scoped to owner)
  app.get('/api/parts', { preHandler: [app.requireAuth] }, async (req) => {
    const q = PartQuerySchema.parse(req.query);
    const ownerId = req.user!.id;
    const where = {
      ownerId,
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
      }),
      db.part.count({ where }),
    ]);
    return { items, total, limit: q.limit, offset: q.offset };
  });

  // Get one (owner-scoped)
  app.get<{ Params: { id: string } }>(
    '/api/parts/:id',
    { preHandler: [app.requireAuth] },
    async (req) => {
      const ownerId = req.user!.id;
      const part = await db.part.findFirst({
        where: { id: req.params.id, ownerId },
        include: { lots: true, stockItems: { include: { location: true, lot: true } } },
      });
      if (!part) throw new NotFoundError('Part not found');
      return part;
    },
  );

  // Create
  app.post('/api/parts', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const input = CreatePartSchema.parse(req.body);
    const userId = req.user!.id;
    const part = await db.part.create({
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
      },
    });
    await db.auditLog.create({
      data: {
        id: newId(),
        userId,
        action: 'part.create',
        entityType: 'Part',
        entityId: part.id,
        payload: JSON.stringify({ name: part.name, partNumber: part.partNumber }),
        ipAddress: req.ip,
      },
    });
    return reply.status(201).send(part);
  });

  // Update (owner-scoped)
  app.patch<{ Params: { id: string } }>(
    '/api/parts/:id',
    { preHandler: [app.requireAuth] },
    async (req) => {
      const input = UpdatePartSchema.parse(req.body);
      const userId = req.user!.id;
      const existing = await db.part.findFirst({ where: { id: req.params.id, ownerId: userId } });
      if (!existing) throw new NotFoundError('Part not found');
      const data: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(input)) {
        if (k === 'customFields' && v !== undefined) data[k] = JSON.stringify(v);
        else if (v !== undefined) data[k] = v;
      }
      const part = await db.part.update({ where: { id: req.params.id }, data });
      await db.auditLog.create({
        data: {
          id: newId(),
          userId,
          action: 'part.update',
          entityType: 'Part',
          entityId: part.id,
          payload: JSON.stringify(data),
          ipAddress: req.ip,
        },
      });
      return part;
    },
  );

  // Delete (owner-scoped)
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

  // Cross-tenant access check helper exposed for other routes
  app.decorate('assertOwnsPart', async (partId: string, ownerId: string) => {
    const exists = await db.part.findFirst({ where: { id: partId, ownerId }, select: { id: true } });
    if (!exists) throw new ForbiddenError('Access denied');
  });

  // silence unused z
  void z;
}
