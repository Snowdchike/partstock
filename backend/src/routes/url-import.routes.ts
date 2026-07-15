import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { newId } from '../lib/ids.js';
import { BadRequestError } from '../lib/errors.js';
import { fetchPublicPage } from '../lib/ssrf.js';
import { extractPartFromHtml, extractPartFromJson } from '../lib/url-import.js';

const PreviewSchema = z.object({
  url: z.string().url().max(2000),
});

const CreateFromUrlSchema = z.object({
  url: z.string().url().max(2000),
  name: z.string().min(1).max(200).optional(),
  partNumber: z.string().min(1).max(120).optional(),
  manufacturer: z.string().max(120).optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
  footprint: z.string().max(120).optional().nullable(),
  unit: z.string().min(1).max(20).optional(),
  notes: z.string().max(20000).optional().nullable(),
});

async function previewFromUrl(url: string) {
  const page = await fetchPublicPage(url);
  const ct = page.contentType.toLowerCase();
  if (ct.includes('json')) {
    const fromJson = extractPartFromJson(page.body, page.finalUrl);
    if (fromJson) return fromJson;
  }
  return extractPartFromHtml(page.body, page.finalUrl);
}

export async function registerUrlImportRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/parts/import-url/preview', { preHandler: [app.requireAuth] }, async (req) => {
    const { url } = PreviewSchema.parse(req.body);
    return previewFromUrl(url);
  });

  app.post('/api/parts/import-url', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const input = CreateFromUrlSchema.parse(req.body);
    const userId = req.user!.id;
    const preview = await previewFromUrl(input.url);

    const name = (input.name ?? preview.name ?? preview.partNumber ?? '').trim();
    const partNumber = (input.partNumber ?? preview.partNumber ?? '').trim();
    if (!name || !partNumber) {
      throw new BadRequestError(
        'Could not determine name and partNumber from URL; provide them explicitly',
      );
    }

    const manufacturer =
      input.manufacturer !== undefined ? input.manufacturer : preview.manufacturer;
    const description =
      input.description !== undefined ? input.description : preview.description;
    const footprint = input.footprint !== undefined ? input.footprint : preview.footprint;
    const notesBase = input.notes !== undefined ? input.notes : null;
    const sourceLine = `source: ${preview.sourceUrl}`;
    const notes = notesBase ? `${notesBase}\n${sourceLine}` : sourceLine;

    const existing = await db.part.findFirst({
      where: {
        ownerId: userId,
        partNumber,
        ...(manufacturer != null ? { manufacturer } : { manufacturer: null }),
      },
    });
    if (existing) {
      throw new BadRequestError(`Part already exists: ${partNumber}`);
    }

    const part = await db.part.create({
      data: {
        id: newId(),
        ownerId: userId,
        name,
        partNumber,
        manufacturer: manufacturer ?? null,
        description: description ?? null,
        footprint: footprint ?? null,
        unit: input.unit ?? 'pcs',
        notes,
        customFields: JSON.stringify({
          sourceUrl: preview.sourceUrl,
          imageUrl: preview.imageUrl,
          importSignals: preview.signals,
        }),
      },
    });

    await db.auditLog.create({
      data: {
        id: newId(),
        userId,
        action: 'part.import_url',
        entityType: 'Part',
        entityId: part.id,
        payload: JSON.stringify({ url: preview.sourceUrl, partNumber, confidence: preview.confidence }),
        ipAddress: req.ip,
      },
    });

    return reply.status(201).send({ part, preview });
  });
}
