import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { db } from '../db.js';
import { newId } from '../lib/ids.js';
import { BadRequestError, NotFoundError } from '../lib/errors.js';
import {
  BuildQuerySchema,
  CreateBuildSchema,
  UpdateBuildSchema,
  UpdatePickSchema,
} from '../schemas/build.schema.js';

const pickInclude = {
  part: {
    select: {
      id: true,
      name: true,
      partNumber: true,
      manufacturer: true,
      unit: true,
    },
  },
  lot: { select: { id: true, code: true } },
  location: { select: { id: true, name: true } },
} as const;

const stageInclude = {
  picks: { include: pickInclude, orderBy: { part: { name: 'asc' as const } } },
} as const;

const buildInclude = {
  bom: { select: { id: true, name: true, version: true } },
  stages: {
    include: stageInclude,
    orderBy: { sequence: 'asc' as const },
  },
} as const;

type Tx = Prisma.TransactionClient;

function neededQty(lineQty: number, boards: number, attritionPercent: number): number {
  return lineQty * boards * (1 + attritionPercent / 100);
}

async function getOwnedBuild(buildId: string, ownerId: string) {
  const build = await db.build.findFirst({ where: { id: buildId, ownerId } });
  if (!build) throw new NotFoundError('Build not found');
  return build;
}

async function loadBuild(buildId: string, ownerId: string) {
  const build = await db.build.findFirst({
    where: { id: buildId, ownerId },
    include: buildInclude,
  });
  if (!build) throw new NotFoundError('Build not found');
  return build;
}

async function reserveStock(
  tx: Tx,
  ownerId: string,
  partId: string,
  locationId: string,
  lotId: string | null,
  amount: number,
) {
  if (amount <= 0) return;
  const stock = await tx.stockItem.findFirst({
    where: { ownerId, partId, locationId, lotId },
  });
  if (!stock) throw new BadRequestError('Stock item missing for reservation');
  const available = stock.quantity - stock.reservedQuantity;
  if (available + 1e-9 < amount) {
    throw new BadRequestError(
      `Insufficient available stock for part ${partId} at location ${locationId} (need ${amount}, have ${available})`,
    );
  }
  await tx.stockItem.update({
    where: { id: stock.id },
    data: { reservedQuantity: stock.reservedQuantity + amount },
  });
}

async function releaseReservation(
  tx: Tx,
  ownerId: string,
  partId: string,
  locationId: string,
  lotId: string | null,
  amount: number,
) {
  if (amount <= 0) return;
  const stock = await tx.stockItem.findFirst({
    where: { ownerId, partId, locationId, lotId },
  });
  if (!stock) return;
  const next = Math.max(0, stock.reservedQuantity - amount);
  await tx.stockItem.update({
    where: { id: stock.id },
    data: { reservedQuantity: next },
  });
}

async function consumeStock(
  tx: Tx,
  ownerId: string,
  partId: string,
  locationId: string,
  lotId: string | null,
  picked: number,
  reserved: number,
) {
  const stock = await tx.stockItem.findFirst({
    where: { ownerId, partId, locationId, lotId },
  });
  if (!stock) throw new BadRequestError('Stock item missing for consumption');
  if (stock.quantity + 1e-9 < picked) {
    throw new BadRequestError(
      `Cannot consume ${picked}: only ${stock.quantity} on hand for part ${partId}`,
    );
  }
  await tx.stockItem.update({
    where: { id: stock.id },
    data: {
      quantity: stock.quantity - picked,
      reservedQuantity: Math.max(0, stock.reservedQuantity - reserved),
    },
  });
}

export async function registerBuildRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/builds', { preHandler: [app.requireAuth] }, async (req) => {
    const q = BuildQuerySchema.parse(req.query);
    const ownerId = req.user!.id;
    const where = {
      ownerId,
      ...(q.status ? { status: q.status } : {}),
      ...(q.q
        ? {
            OR: [{ name: { contains: q.q } }, { notes: { contains: q.q } }, { bom: { name: { contains: q.q } } }],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      db.build.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: q.limit,
        skip: q.offset,
        include: {
          bom: { select: { id: true, name: true, version: true } },
          stages: { select: { id: true, name: true, status: true, _count: { select: { picks: true } } } },
        },
      }),
      db.build.count({ where }),
    ]);
    return {
      items: items.map((b) => ({
        ...b,
        pickCount: b.stages.reduce((n, s) => n + s._count.picks, 0),
        stages: b.stages.map(({ _count, ...s }) => ({ ...s, pickCount: _count.picks })),
      })),
      total,
      limit: q.limit,
      offset: q.offset,
    };
  });

  app.get<{ Params: { id: string } }>(
    '/api/builds/:id',
    { preHandler: [app.requireAuth] },
    async (req) => loadBuild(req.params.id, req.user!.id),
  );

  app.post('/api/builds', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const input = CreateBuildSchema.parse(req.body);
    const userId = req.user!.id;

    const bom = await db.bom.findFirst({
      where: { id: input.bomId, ownerId: userId },
      include: { lines: true },
    });
    if (!bom) throw new NotFoundError('BOM not found');
    if (bom.lines.length === 0) throw new BadRequestError('BOM has no lines');

    const result = await db.$transaction(async (tx) => {
      const buildId = newId();
      const stageId = newId();
      const shortages: Array<{
        partId: string;
        needed: number;
        allocated: number;
        short: number;
      }> = [];

      type Alloc = {
        partId: string;
        locationId: string;
        lotId: string | null;
        quantityRequested: number;
      };
      const allocations: Alloc[] = [];

      for (const line of bom.lines) {
        const needed = neededQty(line.quantity, input.quantity, input.attritionPercent);
        const stocks = await tx.stockItem.findMany({
          where: { ownerId: userId, partId: line.partId },
          orderBy: { quantity: 'desc' },
        });

        let remaining = needed;
        for (const stock of stocks) {
          if (remaining <= 1e-9) break;
          const available = stock.quantity - stock.reservedQuantity;
          if (available <= 1e-9) continue;
          const take = Math.min(available, remaining);
          allocations.push({
            partId: line.partId,
            locationId: stock.locationId,
            lotId: stock.lotId,
            quantityRequested: take,
          });
          remaining -= take;
        }

        const allocated = needed - Math.max(0, remaining);
        if (remaining > 1e-9) {
          shortages.push({
            partId: line.partId,
            needed,
            allocated,
            short: remaining,
          });
        }
      }

      const build = await tx.build.create({
        data: {
          id: buildId,
          ownerId: userId,
          bomId: bom.id,
          name: input.name,
          quantity: input.quantity,
          status: 'planned',
          attritionPercent: input.attritionPercent,
          notes: input.notes ?? null,
          stages: {
            create: {
              id: stageId,
              name: input.stageName,
              sequence: 1,
              status: 'planned',
              picks: {
                create: allocations.map((a) => ({
                  id: newId(),
                  partId: a.partId,
                  lotId: a.lotId,
                  locationId: a.locationId,
                  quantityRequested: a.quantityRequested,
                  quantityPicked: 0,
                })),
              },
            },
          },
        },
        include: buildInclude,
      });

      if (input.reserve) {
        for (const a of allocations) {
          await reserveStock(tx, userId, a.partId, a.locationId, a.lotId, a.quantityRequested);
        }
      }

      await tx.auditLog.create({
        data: {
          id: newId(),
          userId,
          action: 'build.create',
          entityType: 'Build',
          entityId: buildId,
          payload: JSON.stringify({
            bomId: bom.id,
            quantity: input.quantity,
            attritionPercent: input.attritionPercent,
            reserved: input.reserve,
            allocationCount: allocations.length,
            shortages,
          }),
          ipAddress: req.ip,
        },
      });

      return { build, shortages, reserved: input.reserve };
    });

    return reply.status(201).send(result);
  });

  app.patch<{ Params: { id: string } }>(
    '/api/builds/:id',
    { preHandler: [app.requireAuth] },
    async (req) => {
      const input = UpdateBuildSchema.parse(req.body);
      const userId = req.user!.id;
      const existing = await getOwnedBuild(req.params.id, userId);
      if (existing.status === 'done' || existing.status === 'cancelled') {
        throw new BadRequestError(`Cannot edit a ${existing.status} build`);
      }
      const data: Record<string, unknown> = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.notes !== undefined) data.notes = input.notes;
      await db.build.update({ where: { id: req.params.id }, data });
      return loadBuild(req.params.id, userId);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/builds/:id/start',
    { preHandler: [app.requireAuth] },
    async (req) => {
      const userId = req.user!.id;
      const existing = await getOwnedBuild(req.params.id, userId);
      if (existing.status !== 'planned') {
        throw new BadRequestError(`Only planned builds can start (status=${existing.status})`);
      }
      await db.$transaction(async (tx) => {
        await tx.build.update({
          where: { id: req.params.id },
          data: { status: 'in_progress' },
        });
        await tx.buildStage.updateMany({
          where: { buildId: req.params.id },
          data: { status: 'in_progress' },
        });
        await tx.auditLog.create({
          data: {
            id: newId(),
            userId,
            action: 'build.start',
            entityType: 'Build',
            entityId: req.params.id,
            payload: '{}',
            ipAddress: req.ip,
          },
        });
      });
      return loadBuild(req.params.id, userId);
    },
  );

  app.patch<{ Params: { id: string; pickId: string } }>(
    '/api/builds/:id/picks/:pickId',
    { preHandler: [app.requireAuth] },
    async (req) => {
      const input = UpdatePickSchema.parse(req.body);
      const userId = req.user!.id;
      const build = await getOwnedBuild(req.params.id, userId);
      if (build.status === 'done' || build.status === 'cancelled') {
        throw new BadRequestError(`Cannot pick on a ${build.status} build`);
      }

      const pick = await db.buildPick.findFirst({
        where: { id: req.params.pickId, stage: { buildId: req.params.id } },
      });
      if (!pick) throw new NotFoundError('Pick not found');
      if (input.quantityPicked > pick.quantityRequested + 1e-9) {
        throw new BadRequestError(
          `quantityPicked ${input.quantityPicked} exceeds requested ${pick.quantityRequested}`,
        );
      }

      const updated = await db.buildPick.update({
        where: { id: pick.id },
        data: {
          quantityPicked: input.quantityPicked,
          ...(input.lotId !== undefined ? { lotId: input.lotId } : {}),
          ...(input.locationId !== undefined ? { locationId: input.locationId } : {}),
        },
        include: pickInclude,
      });
      return updated;
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/builds/:id/complete',
    { preHandler: [app.requireAuth] },
    async (req) => {
      const userId = req.user!.id;
      const existing = await getOwnedBuild(req.params.id, userId);
      if (existing.status === 'done') throw new BadRequestError('Build already done');
      if (existing.status === 'cancelled') throw new BadRequestError('Cannot complete a cancelled build');

      await db.$transaction(async (tx) => {
        const stages = await tx.buildStage.findMany({
          where: { buildId: req.params.id },
          include: { picks: true },
        });
        for (const stage of stages) {
          for (const pick of stage.picks) {
            const picked = pick.quantityPicked > 0 ? pick.quantityPicked : pick.quantityRequested;
            await consumeStock(
              tx,
              userId,
              pick.partId,
              pick.locationId,
              pick.lotId,
              picked,
              pick.quantityRequested,
            );
            if (pick.quantityPicked === 0) {
              await tx.buildPick.update({
                where: { id: pick.id },
                data: { quantityPicked: picked },
              });
            }
          }
          await tx.buildStage.update({
            where: { id: stage.id },
            data: { status: 'done' },
          });
        }
        await tx.build.update({
          where: { id: req.params.id },
          data: { status: 'done', completedAt: new Date() },
        });
        await tx.auditLog.create({
          data: {
            id: newId(),
            userId,
            action: 'build.complete',
            entityType: 'Build',
            entityId: req.params.id,
            payload: '{}',
            ipAddress: req.ip,
          },
        });
      });

      return loadBuild(req.params.id, userId);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/builds/:id/cancel',
    { preHandler: [app.requireAuth] },
    async (req) => {
      const userId = req.user!.id;
      const existing = await getOwnedBuild(req.params.id, userId);
      if (existing.status === 'done') throw new BadRequestError('Cannot cancel a completed build');
      if (existing.status === 'cancelled') throw new BadRequestError('Build already cancelled');

      await db.$transaction(async (tx) => {
        const stages = await tx.buildStage.findMany({
          where: { buildId: req.params.id },
          include: { picks: true },
        });
        for (const stage of stages) {
          for (const pick of stage.picks) {
            await releaseReservation(
              tx,
              userId,
              pick.partId,
              pick.locationId,
              pick.lotId,
              pick.quantityRequested,
            );
          }
          await tx.buildStage.update({
            where: { id: stage.id },
            data: { status: 'cancelled' },
          });
        }
        await tx.build.update({
          where: { id: req.params.id },
          data: { status: 'cancelled' },
        });
        await tx.auditLog.create({
          data: {
            id: newId(),
            userId,
            action: 'build.cancel',
            entityType: 'Build',
            entityId: req.params.id,
            payload: '{}',
            ipAddress: req.ip,
          },
        });
      });

      return loadBuild(req.params.id, userId);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/builds/:id',
    { preHandler: [app.requireAuth] },
    async (req, reply) => {
      const userId = req.user!.id;
      const existing = await getOwnedBuild(req.params.id, userId);
      if (existing.status === 'planned' || existing.status === 'in_progress') {
        throw new BadRequestError('Cancel the build before deleting, so reserved stock is released');
      }
      await db.build.delete({ where: { id: req.params.id } });
      await db.auditLog.create({
        data: {
          id: newId(),
          userId,
          action: 'build.delete',
          entityType: 'Build',
          entityId: req.params.id,
          payload: '{}',
          ipAddress: req.ip,
        },
      });
      return reply.status(204).send();
    },
  );
}
