import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { BadRequestError } from '../lib/errors.js';

const ScanQuerySchema = z.object({
  q: z.string().min(1).max(500),
});

export async function registerScanRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/scan', { preHandler: [app.requireAuth] }, async (req) => {
    const { q } = ScanQuerySchema.parse(req.query);
    const ownerId = req.user!.id;
    const code = q.trim();
    if (!code) throw new BadRequestError('Empty scan code');

    const matches: Array<Record<string, unknown>> = [];

    // Label payload exact (QR/Code128 we generate)
    const labels = await db.label.findMany({
      where: { ownerId, payload: code },
      take: 10,
      include: {
        part: { select: { id: true, name: true, partNumber: true, manufacturer: true } },
        lot: { select: { id: true, code: true } },
      },
    });
    for (const l of labels) {
      matches.push({
        type: 'label',
        id: l.id,
        partId: l.partId,
        lotId: l.lotId,
        format: l.format,
        payload: l.payload,
        part: l.part,
        lot: l.lot,
      });
    }

    // Parse our payload shape: MPN|mfr|lot
    const segs = code.split('|').map((s) => s.trim()).filter(Boolean);
    if (segs.length >= 1) {
      const mpn = segs[0]!;
      const mfr = segs.length >= 2 ? segs[1]! : null;
      const lotCode = segs.length >= 3 ? segs[2]! : segs.length === 2 ? segs[1]! : null;

      const partsByMpn = await db.part.findMany({
        where: {
          ownerId,
          partNumber: mpn,
          ...(mfr && segs.length >= 3 ? { manufacturer: mfr } : {}),
        },
        take: 10,
        select: {
          id: true,
          name: true,
          partNumber: true,
          manufacturer: true,
          category: { select: { name: true } },
        },
      });
      for (const p of partsByMpn) {
        if (!matches.some((m) => m.type === 'part' && m.id === p.id)) {
          matches.push({ type: 'part', id: p.id, ...p });
        }
      }

      if (lotCode) {
        const lots = await db.lot.findMany({
          where: { code: lotCode, part: { ownerId } },
          take: 10,
          include: {
            part: { select: { id: true, name: true, partNumber: true, manufacturer: true } },
          },
        });
        for (const lot of lots) {
          if (!matches.some((m) => m.type === 'lot' && m.id === lot.id)) {
            matches.push({
              type: 'lot',
              id: lot.id,
              code: lot.code,
              partId: lot.partId,
              part: lot.part,
            });
          }
        }
      }
    }

    // Lot code exact
    const lotsExact = await db.lot.findMany({
      where: { code, part: { ownerId } },
      take: 10,
      include: {
        part: { select: { id: true, name: true, partNumber: true, manufacturer: true } },
      },
    });
    for (const lot of lotsExact) {
      if (!matches.some((m) => m.type === 'lot' && m.id === lot.id)) {
        matches.push({
          type: 'lot',
          id: lot.id,
          code: lot.code,
          partId: lot.partId,
          part: lot.part,
        });
      }
    }

    // Part number exact
    const partsExact = await db.part.findMany({
      where: { ownerId, partNumber: code },
      take: 10,
      select: {
        id: true,
        name: true,
        partNumber: true,
        manufacturer: true,
        category: { select: { name: true } },
      },
    });
    for (const p of partsExact) {
      if (!matches.some((m) => m.type === 'part' && m.id === p.id)) {
        matches.push({ type: 'part', id: p.id, ...p });
      }
    }

    // Location name exact
    const locations = await db.storageLocation.findMany({
      where: { ownerId, name: code },
      take: 10,
      select: { id: true, name: true, description: true },
    });
    for (const loc of locations) {
      matches.push({ type: 'location', id: loc.id, name: loc.name, description: loc.description });
    }

    // Best primary target for UI navigation
    let primary: { type: string; id: string; partId?: string } | null = null;
    const firstPart = matches.find((m) => m.type === 'part');
    const firstLot = matches.find((m) => m.type === 'lot');
    const firstLabel = matches.find((m) => m.type === 'label');
    if (firstLabel?.partId) {
      primary = { type: 'part', id: String(firstLabel.partId), partId: String(firstLabel.partId) };
    } else if (firstLot?.partId) {
      primary = { type: 'part', id: String(firstLot.partId), partId: String(firstLot.partId) };
    } else if (firstPart?.id) {
      primary = { type: 'part', id: String(firstPart.id), partId: String(firstPart.id) };
    } else if (matches[0]) {
      primary = { type: String(matches[0].type), id: String(matches[0].id) };
    }

    return { q: code, matches, primary, count: matches.length };
  });
}
