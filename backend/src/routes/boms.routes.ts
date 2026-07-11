import type { FastifyInstance } from 'fastify';
import { db } from '../db.js';
import { newId } from '../lib/ids.js';
import { BadRequestError, NotFoundError } from '../lib/errors.js';
import { parseBomCsv } from '../lib/csv.js';
import {
  BomLineInputSchema,
  BomQuerySchema,
  CreateBomSchema,
  ImportBomCsvSchema,
  UpdateBomLineSchema,
  UpdateBomSchema,
} from '../schemas/bom.schema.js';

const lineInclude = {
  part: {
    select: {
      id: true,
      name: true,
      partNumber: true,
      manufacturer: true,
      footprint: true,
      unit: true,
    },
  },
} as const;

async function getOwnedBom(bomId: string, ownerId: string) {
  const bom = await db.bom.findFirst({ where: { id: bomId, ownerId } });
  if (!bom) throw new NotFoundError('BOM not found');
  return bom;
}

async function assertOwnedPart(partId: string, ownerId: string) {
  const part = await db.part.findFirst({ where: { id: partId, ownerId }, select: { id: true } });
  if (!part) throw new NotFoundError('Part not found');
  return part;
}

export async function registerBomRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/boms', { preHandler: [app.requireAuth] }, async (req) => {
    const q = BomQuerySchema.parse(req.query);
    const ownerId = req.user!.id;
    const where = {
      ownerId,
      ...(q.q
        ? {
            OR: [
              { name: { contains: q.q } },
              { version: { contains: q.q } },
              { notes: { contains: q.q } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      db.bom.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: q.limit,
        skip: q.offset,
        include: { _count: { select: { lines: true } } },
      }),
      db.bom.count({ where }),
    ]);
    return {
      items: items.map(({ _count, ...rest }) => ({ ...rest, lineCount: _count.lines })),
      total,
      limit: q.limit,
      offset: q.offset,
    };
  });

  app.get<{ Params: { id: string } }>(
    '/api/boms/:id',
    { preHandler: [app.requireAuth] },
    async (req) => {
      const ownerId = req.user!.id;
      const bom = await db.bom.findFirst({
        where: { id: req.params.id, ownerId },
        include: {
          lines: {
            include: lineInclude,
            orderBy: { designator: 'asc' },
          },
        },
      });
      if (!bom) throw new NotFoundError('BOM not found');
      return bom;
    },
  );

  app.post('/api/boms', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const input = CreateBomSchema.parse(req.body);
    const userId = req.user!.id;

    for (const line of input.lines) {
      await assertOwnedPart(line.partId, userId);
    }

    const bom = await db.$transaction(async (tx) => {
      const created = await tx.bom.create({
        data: {
          id: newId(),
          ownerId: userId,
          name: input.name,
          version: input.version,
          notes: input.notes ?? null,
          lines: {
            create: input.lines.map((line) => ({
              id: newId(),
              partId: line.partId,
              quantity: line.quantity,
              designator: line.designator ?? null,
            })),
          },
        },
        include: { lines: { include: lineInclude } },
      });
      await tx.auditLog.create({
        data: {
          id: newId(),
          userId,
          action: 'bom.create',
          entityType: 'Bom',
          entityId: created.id,
          payload: JSON.stringify({
            name: created.name,
            version: created.version,
            lineCount: created.lines.length,
          }),
          ipAddress: req.ip,
        },
      });
      return created;
    });

    return reply.status(201).send(bom);
  });

  app.patch<{ Params: { id: string } }>(
    '/api/boms/:id',
    { preHandler: [app.requireAuth] },
    async (req) => {
      const input = UpdateBomSchema.parse(req.body);
      const userId = req.user!.id;
      await getOwnedBom(req.params.id, userId);

      const data: Record<string, unknown> = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.version !== undefined) data.version = input.version;
      if (input.notes !== undefined) data.notes = input.notes;

      const bom = await db.bom.update({
        where: { id: req.params.id },
        data,
        include: { lines: { include: lineInclude } },
      });
      await db.auditLog.create({
        data: {
          id: newId(),
          userId,
          action: 'bom.update',
          entityType: 'Bom',
          entityId: bom.id,
          payload: JSON.stringify(data),
          ipAddress: req.ip,
        },
      });
      return bom;
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/boms/:id',
    { preHandler: [app.requireAuth] },
    async (req, reply) => {
      const userId = req.user!.id;
      await getOwnedBom(req.params.id, userId);
      await db.bom.delete({ where: { id: req.params.id } });
      await db.auditLog.create({
        data: {
          id: newId(),
          userId,
          action: 'bom.delete',
          entityType: 'Bom',
          entityId: req.params.id,
          payload: '{}',
          ipAddress: req.ip,
        },
      });
      return reply.status(204).send();
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/boms/:id/lines',
    { preHandler: [app.requireAuth] },
    async (req, reply) => {
      const input = BomLineInputSchema.parse(req.body);
      const userId = req.user!.id;
      await getOwnedBom(req.params.id, userId);
      await assertOwnedPart(input.partId, userId);

      const line = await db.bomLine.create({
        data: {
          id: newId(),
          bomId: req.params.id,
          partId: input.partId,
          quantity: input.quantity,
          designator: input.designator ?? null,
        },
        include: lineInclude,
      });
      await db.auditLog.create({
        data: {
          id: newId(),
          userId,
          action: 'bom.line.create',
          entityType: 'BomLine',
          entityId: line.id,
          payload: JSON.stringify({ bomId: req.params.id, partId: input.partId, quantity: input.quantity }),
          ipAddress: req.ip,
        },
      });
      return reply.status(201).send(line);
    },
  );

  app.patch<{ Params: { id: string; lineId: string } }>(
    '/api/boms/:id/lines/:lineId',
    { preHandler: [app.requireAuth] },
    async (req) => {
      const input = UpdateBomLineSchema.parse(req.body);
      const userId = req.user!.id;
      await getOwnedBom(req.params.id, userId);

      const existing = await db.bomLine.findFirst({
        where: { id: req.params.lineId, bomId: req.params.id },
      });
      if (!existing) throw new NotFoundError('BOM line not found');

      if (input.partId) await assertOwnedPart(input.partId, userId);

      const data: Record<string, unknown> = {};
      if (input.partId !== undefined) data.partId = input.partId;
      if (input.quantity !== undefined) data.quantity = input.quantity;
      if (input.designator !== undefined) data.designator = input.designator;

      const line = await db.bomLine.update({
        where: { id: req.params.lineId },
        data,
        include: lineInclude,
      });
      await db.auditLog.create({
        data: {
          id: newId(),
          userId,
          action: 'bom.line.update',
          entityType: 'BomLine',
          entityId: line.id,
          payload: JSON.stringify(data),
          ipAddress: req.ip,
        },
      });
      return line;
    },
  );

  app.delete<{ Params: { id: string; lineId: string } }>(
    '/api/boms/:id/lines/:lineId',
    { preHandler: [app.requireAuth] },
    async (req, reply) => {
      const userId = req.user!.id;
      await getOwnedBom(req.params.id, userId);
      const existing = await db.bomLine.findFirst({
        where: { id: req.params.lineId, bomId: req.params.id },
      });
      if (!existing) throw new NotFoundError('BOM line not found');
      await db.bomLine.delete({ where: { id: req.params.lineId } });
      await db.auditLog.create({
        data: {
          id: newId(),
          userId,
          action: 'bom.line.delete',
          entityType: 'BomLine',
          entityId: req.params.lineId,
          payload: JSON.stringify({ bomId: req.params.id }),
          ipAddress: req.ip,
        },
      });
      return reply.status(204).send();
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/boms/:id/import-csv',
    { preHandler: [app.requireAuth] },
    async (req) => {
      const input = ImportBomCsvSchema.parse(req.body);
      const userId = req.user!.id;
      await getOwnedBom(req.params.id, userId);

      let rows;
      try {
        rows = parseBomCsv(input.csv);
      } catch (e) {
        throw new BadRequestError(e instanceof Error ? e.message : 'Invalid CSV');
      }

      const result = await db.$transaction(async (tx) => {
        if (input.replaceLines) {
          await tx.bomLine.deleteMany({ where: { bomId: req.params.id } });
        }

        let createdParts = 0;
        let matchedParts = 0;
        const lines = [];

        for (const row of rows) {
          let part = await tx.part.findFirst({
            where: {
              ownerId: userId,
              partNumber: row.partNumber,
              ...(row.manufacturer
                ? { manufacturer: row.manufacturer }
                : {}),
            },
          });

          if (!part && row.manufacturer == null) {
            part = await tx.part.findFirst({
              where: { ownerId: userId, partNumber: row.partNumber },
            });
          }

          if (!part) {
            if (!input.createMissingParts) {
              throw new BadRequestError(
                `Part not found for MPN "${row.partNumber}"${row.manufacturer ? ` / ${row.manufacturer}` : ''}. Enable createMissingParts or add the part first.`,
              );
            }
            part = await tx.part.create({
              data: {
                id: newId(),
                ownerId: userId,
                name: row.name ?? row.description ?? row.partNumber,
                partNumber: row.partNumber,
                manufacturer: row.manufacturer,
                description: row.description,
                footprint: row.footprint,
                unit: 'pcs',
                customFields: '{}',
              },
            });
            createdParts += 1;
            await tx.auditLog.create({
              data: {
                id: newId(),
                userId,
                action: 'part.create',
                entityType: 'Part',
                entityId: part.id,
                payload: JSON.stringify({
                  name: part.name,
                  partNumber: part.partNumber,
                  source: 'bom.csv.import',
                }),
                ipAddress: req.ip,
              },
            });
          } else {
            matchedParts += 1;
          }

          const line = await tx.bomLine.create({
            data: {
              id: newId(),
              bomId: req.params.id,
              partId: part.id,
              quantity: row.quantity,
              designator: row.designator,
            },
            include: lineInclude,
          });
          lines.push(line);
        }

        await tx.auditLog.create({
          data: {
            id: newId(),
            userId,
            action: 'bom.import_csv',
            entityType: 'Bom',
            entityId: req.params.id,
            payload: JSON.stringify({
              lineCount: lines.length,
              createdParts,
              matchedParts,
              replaceLines: input.replaceLines,
            }),
            ipAddress: req.ip,
          },
        });

        return { lines, createdParts, matchedParts };
      });

      return result;
    },
  );
}
