import type { FastifyInstance } from 'fastify';
import { db } from '../db.js';
import { newId } from '../lib/ids.js';
import { BadRequestError, NotFoundError } from '../lib/errors.js';
import {
  buildLabelCaption,
  buildLabelPayload,
  renderCode128Svg,
  renderQrSvg,
} from '../lib/labels.js';
import { CreateLabelSchema, LabelQuerySchema } from '../schemas/label.schema.js';

const labelInclude = {
  part: {
    select: {
      id: true,
      name: true,
      partNumber: true,
      manufacturer: true,
    },
  },
  lot: { select: { id: true, code: true } },
} as const;

export async function registerLabelRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/labels', { preHandler: [app.requireAuth] }, async (req) => {
    const q = LabelQuerySchema.parse(req.query);
    const ownerId = req.user!.id;
    const where = {
      ownerId,
      ...(q.partId ? { partId: q.partId } : {}),
      ...(q.lotId ? { lotId: q.lotId } : {}),
    };
    const [items, total] = await Promise.all([
      db.label.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: q.limit,
        skip: q.offset,
        include: labelInclude,
      }),
      db.label.count({ where }),
    ]);
    return { items, total, limit: q.limit, offset: q.offset };
  });

  app.get<{ Params: { id: string } }>(
    '/api/labels/:id',
    { preHandler: [app.requireAuth] },
    async (req) => {
      const label = await db.label.findFirst({
        where: { id: req.params.id, ownerId: req.user!.id },
        include: labelInclude,
      });
      if (!label) throw new NotFoundError('Label not found');
      return label;
    },
  );

  app.post('/api/labels', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const input = CreateLabelSchema.parse(req.body);
    const userId = req.user!.id;

    const part = await db.part.findFirst({ where: { id: input.partId, ownerId: userId } });
    if (!part) throw new NotFoundError('Part not found');

    let lotCode: string | null = null;
    if (input.lotId) {
      const lot = await db.lot.findFirst({
        where: { id: input.lotId, partId: part.id },
      });
      if (!lot) throw new NotFoundError('Lot not found');
      lotCode = lot.code;
    }

    const payload = buildLabelPayload({
      partNumber: part.partNumber,
      manufacturer: part.manufacturer,
      lotCode,
      name: part.name,
    });
    const caption = buildLabelCaption({
      partNumber: part.partNumber,
      name: part.name,
      lotCode,
    });

    let svg: string;
    try {
      if (input.format === 'qr') {
        svg = await renderQrSvg(payload, { caption });
      } else {
        // Code128 payload must be ASCII printable — use compact MPN|lot
        const compact = [part.partNumber, lotCode].filter(Boolean).join('|');
        svg = renderCode128Svg(compact, { caption });
      }
    } catch (e) {
      throw new BadRequestError(e instanceof Error ? e.message : 'Failed to render label');
    }

    const created = [];
    for (let i = 0; i < input.copies; i++) {
      const label = await db.label.create({
        data: {
          id: newId(),
          ownerId: userId,
          partId: part.id,
          lotId: input.lotId ?? null,
          format: input.format,
          payload,
          svg,
        },
        include: labelInclude,
      });
      created.push(label);
    }

    await db.auditLog.create({
      data: {
        id: newId(),
        userId,
        action: 'label.create',
        entityType: 'Label',
        entityId: created[0]!.id,
        payload: JSON.stringify({
          format: input.format,
          partId: part.id,
          lotId: input.lotId ?? null,
          copies: input.copies,
        }),
        ipAddress: req.ip,
      },
    });

    return reply.status(201).send({ items: created, count: created.length });
  });

  app.delete<{ Params: { id: string } }>(
    '/api/labels/:id',
    { preHandler: [app.requireAuth] },
    async (req, reply) => {
      const userId = req.user!.id;
      const existing = await db.label.findFirst({
        where: { id: req.params.id, ownerId: userId },
      });
      if (!existing) throw new NotFoundError('Label not found');
      await db.label.delete({ where: { id: req.params.id } });
      await db.auditLog.create({
        data: {
          id: newId(),
          userId,
          action: 'label.delete',
          entityType: 'Label',
          entityId: req.params.id,
          payload: '{}',
          ipAddress: req.ip,
        },
      });
      return reply.status(204).send();
    },
  );
}
