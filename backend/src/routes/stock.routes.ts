import type { FastifyInstance } from 'fastify';
import { db } from '../db.js';
import { newId } from '../lib/ids.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../lib/errors.js';
import { AdjustStockSchema } from '../schemas/stock.schema.js';

export async function registerStockRoutes(app: FastifyInstance): Promise<void> {
  // Adjust stock for (part, lot?, location). Creates StockItem if absent.
  app.post('/api/stock/adjust', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const input = AdjustStockSchema.parse(req.body);
    const userId = req.user!.id;

    const part = await db.part.findFirst({ where: { id: input.partId, ownerId: userId } });
    if (!part) throw new NotFoundError('Part not found');
    const location = await db.storageLocation.findFirst({
      where: { id: input.locationId, ownerId: userId },
    });
    if (!location) throw new NotFoundError('Location not found');
    if (input.lotId) {
      const lot = await db.lot.findFirst({
        where: { id: input.lotId, part: { ownerId: userId } },
      });
      if (!lot) throw new NotFoundError('Lot not found');
      if (lot.partId !== input.partId) throw new BadRequestError('Lot does not belong to part');
    }

    const result = await db.$transaction(async (tx) => {
      const existing = await tx.stockItem.findFirst({
        where: {
          ownerId: userId,
          partId: input.partId,
          lotId: input.lotId ?? null,
          locationId: input.locationId,
        },
      });

      const newQty = (existing?.quantity ?? 0) + input.delta;
      if (newQty < 0) {
        throw new BadRequestError(
          `Adjustment would drive quantity negative (have ${existing?.quantity ?? 0}, delta ${input.delta})`,
        );
      }

      const stock = existing
        ? await tx.stockItem.update({
            where: { id: existing.id },
            data: { quantity: newQty },
          })
        : await tx.stockItem.create({
            data: {
              id: newId(),
              ownerId: userId,
              partId: input.partId,
              lotId: input.lotId ?? null,
              locationId: input.locationId,
              quantity: newQty,
              reservedQuantity: 0,
            },
          });

      await tx.auditLog.create({
        data: {
          id: newId(),
          userId,
          action: 'stock.adjust',
          entityType: 'StockItem',
          entityId: stock.id,
          payload: JSON.stringify({
            partId: input.partId,
            lotId: input.lotId ?? null,
            locationId: input.locationId,
            delta: input.delta,
            newQuantity: stock.quantity,
            reason: input.reason,
          }),
          ipAddress: req.ip,
        },
      });

      return stock;
    });

    return reply.status(201).send(result);
  });

  // Summary per part: total quantity across lots/locations (owner-scoped)
  app.get<{ Params: { partId: string } }>(
    '/api/stock/summary/:partId',
    { preHandler: [app.requireAuth] },
    async (req) => {
      const ownerId = req.user!.id;
      const part = await db.part.findFirst({ where: { id: req.params.partId, ownerId } });
      if (!part) throw new NotFoundError('Part not found');
      const items = await db.stockItem.findMany({
        where: { partId: req.params.partId, ownerId },
        include: { location: true, lot: true },
        orderBy: { location: { name: 'asc' } },
      });
      const total = items.reduce((sum, i) => sum + i.quantity, 0);
      const reserved = items.reduce((sum, i) => sum + i.reservedQuantity, 0);
      return { total, reserved, available: total - reserved, items };
    },
  );

  // List low-stock: parts whose total < threshold (owner-scoped)
  app.get('/api/stock', { preHandler: [app.requireAuth] }, async (req) => {
    const ownerId = req.user!.id;
    const q = req.query as { threshold?: string };
    const threshold = Number(q.threshold ?? '0');
    const items = await db.stockItem.findMany({
      where: { ownerId },
      include: { part: true, lot: true, location: true },
      take: 500,
    });
    const grouped = new Map<
      string,
      {
        partId: string;
        part: typeof items[number]['part'];
        total: number;
        lots: Array<{ lotId: string | null; lotCode: string | null; locationId: string; locationName: string; quantity: number }>;
      }
    >();
    for (const it of items) {
      const key = it.partId;
      const g = grouped.get(key) ?? { partId: key, part: it.part, total: 0, lots: [] };
      g.total += it.quantity;
      g.lots.push({
        lotId: it.lotId,
        lotCode: it.lot?.code ?? null,
        locationId: it.locationId,
        locationName: it.location.name,
        quantity: it.quantity,
      });
      grouped.set(key, g);
    }
    return Array.from(grouped.values()).filter((g) => g.total <= threshold);
  });
}
