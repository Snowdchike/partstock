import type { FastifyInstance } from 'fastify';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import multipart from '@fastify/multipart';
import { db } from '../db.js';
import { loadConfig } from '../config.js';
import { newId } from '../lib/ids.js';
import { BadRequestError, NotFoundError } from '../lib/errors.js';
import {
  absolutePathForKey,
  mimeMeta,
  removeAttachmentFile,
  sanitizeOriginalName,
  storageKeyFor,
  writeAttachmentFile,
} from '../lib/attachments.js';

function shapeAttachment(a: {
  id: string;
  partId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  kind: string;
  createdAt: Date;
}) {
  return {
    id: a.id,
    partId: a.partId,
    originalName: a.originalName,
    mimeType: a.mimeType,
    sizeBytes: a.sizeBytes,
    kind: a.kind,
    createdAt: a.createdAt,
    // Relative download URL — browser hits same origin with session cookie.
    url: `/api/attachments/${a.id}/download`,
  };
}

export async function registerAttachmentRoutes(app: FastifyInstance): Promise<void> {
  const cfg = loadConfig();

  await app.register(multipart, {
    limits: {
      files: 1,
      fileSize: cfg.UPLOAD_MAX_BYTES,
      fields: 4,
      parts: 8,
    },
    // Do not attach files to body — we stream via req.file().
    attachFieldsToBody: false,
  });

  // List attachments for a part (owner-scoped).
  app.get<{ Params: { partId: string } }>(
    '/api/parts/:partId/attachments',
    { preHandler: [app.requireAuth] },
    async (req) => {
      const ownerId = req.user!.id;
      const part = await db.part.findFirst({
        where: { id: req.params.partId, ownerId },
        select: { id: true },
      });
      if (!part) throw new NotFoundError('Part not found');

      const items = await db.attachment.findMany({
        where: { partId: part.id, ownerId },
        orderBy: { createdAt: 'desc' },
      });
      return { items: items.map(shapeAttachment) };
    },
  );

  // Upload one file: multipart field name "file".
  app.post<{ Params: { partId: string } }>(
    '/api/parts/:partId/attachments',
    { preHandler: [app.requireAuth] },
    async (req, reply) => {
      const ownerId = req.user!.id;
      const part = await db.part.findFirst({
        where: { id: req.params.partId, ownerId },
        select: { id: true },
      });
      if (!part) throw new NotFoundError('Part not found');

      const file = await req.file();
      if (!file) throw new BadRequestError('Missing file field "file"');

      const mime = (file.mimetype || '').toLowerCase();
      const meta = mimeMeta(mime);
      if (!meta) {
        // Drain to free busboy
        try {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          for await (const _ of file.file) {
            /* discard */
          }
        } catch {
          /* ignore */
        }
        throw new BadRequestError(
          'Unsupported file type. Allowed: PDF, PNG, JPEG, WebP, GIF, plain text',
        );
      }

      // Buffer with hard cap (multipart fileSize already aborts oversized streams).
      const chunks: Buffer[] = [];
      let total = 0;
      try {
        for await (const chunk of file.file) {
          total += chunk.length;
          if (total > cfg.UPLOAD_MAX_BYTES) {
            throw new BadRequestError(`File exceeds max size (${cfg.UPLOAD_MAX_BYTES} bytes)`);
          }
          chunks.push(chunk);
        }
      } catch (err) {
        if (err instanceof BadRequestError) throw err;
        // busboy "limit" errors surface as truncated streams
        throw new BadRequestError(`File exceeds max size (${cfg.UPLOAD_MAX_BYTES} bytes)`);
      }
      if (file.file.truncated) {
        throw new BadRequestError(`File exceeds max size (${cfg.UPLOAD_MAX_BYTES} bytes)`);
      }

      const data = Buffer.concat(chunks);
      if (data.length === 0) throw new BadRequestError('Empty file');

      const id = newId();
      const storageKey = storageKeyFor(ownerId, id);
      const originalName = sanitizeOriginalName(file.filename || `file.${meta.ext}`);

      await writeAttachmentFile(storageKey, data);

      try {
        const created = await db.$transaction(async (tx) => {
          const att = await tx.attachment.create({
            data: {
              id,
              ownerId,
              partId: part.id,
              originalName,
              mimeType: mime,
              sizeBytes: data.length,
              storageKey,
              kind: meta.kind,
            },
          });
          await tx.auditLog.create({
            data: {
              id: newId(),
              userId: ownerId,
              action: 'attachment.create',
              entityType: 'Attachment',
              entityId: att.id,
              payload: JSON.stringify({
                partId: part.id,
                originalName,
                mimeType: mime,
                sizeBytes: data.length,
                kind: meta.kind,
              }),
              ipAddress: req.ip,
            },
          });
          return att;
        });
        return reply.status(201).send(shapeAttachment(created));
      } catch (err) {
        await removeAttachmentFile(storageKey).catch(() => {});
        throw err;
      }
    },
  );

  // Download — Content-Disposition: attachment; never inline HTML.
  app.get<{ Params: { id: string } }>(
    '/api/attachments/:id/download',
    { preHandler: [app.requireAuth] },
    async (req, reply) => {
      const ownerId = req.user!.id;
      const att = await db.attachment.findFirst({
        where: { id: req.params.id, ownerId },
      });
      if (!att) throw new NotFoundError('Attachment not found');

      let full: string;
      try {
        full = absolutePathForKey(att.storageKey);
      } catch {
        throw new NotFoundError('Attachment file missing');
      }

      try {
        await stat(full);
      } catch {
        throw new NotFoundError('Attachment file missing');
      }

      // Force download; block content-sniffing.
      const safeName = att.originalName.replace(/"/g, '');
      return reply
        .header('content-type', att.mimeType)
        .header('content-disposition', `attachment; filename="${safeName}"`)
        .header('x-content-type-options', 'nosniff')
        .header('cache-control', 'private, no-store')
        .send(createReadStream(full));
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/attachments/:id',
    { preHandler: [app.requireAuth] },
    async (req, reply) => {
      const ownerId = req.user!.id;
      const att = await db.attachment.findFirst({
        where: { id: req.params.id, ownerId },
      });
      if (!att) throw new NotFoundError('Attachment not found');

      await db.$transaction(async (tx) => {
        await tx.attachment.delete({ where: { id: att.id } });
        await tx.auditLog.create({
          data: {
            id: newId(),
            userId: ownerId,
            action: 'attachment.delete',
            entityType: 'Attachment',
            entityId: att.id,
            payload: JSON.stringify({
              partId: att.partId,
              originalName: att.originalName,
            }),
            ipAddress: req.ip,
          },
        });
      });

      await removeAttachmentFile(att.storageKey);

      return reply.status(204).send();
    },
  );
}
