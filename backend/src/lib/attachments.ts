import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { loadConfig } from '../config.js';

// Allowed Content-Types (declared mime). Extension is derived from mime, not client filename.
export const ATTACHMENT_MIME: Record<string, { ext: string; kind: 'datasheet' | 'image' | 'other' }> = {
  'application/pdf': { ext: 'pdf', kind: 'datasheet' },
  'image/png': { ext: 'png', kind: 'image' },
  'image/jpeg': { ext: 'jpg', kind: 'image' },
  'image/webp': { ext: 'webp', kind: 'image' },
  'image/gif': { ext: 'gif', kind: 'image' },
  'text/plain': { ext: 'txt', kind: 'other' },
};

export function resolveUploadRoot(): string {
  const raw = loadConfig().UPLOAD_DIR;
  return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
}

/** storageKey is always `{ownerId}/{attachmentId}` — never trust client paths. */
export function storageKeyFor(ownerId: string, attachmentId: string): string {
  return `${ownerId}/${attachmentId}`;
}

export function absolutePathForKey(storageKey: string): string {
  const root = resolveUploadRoot();
  // Reject any key that tries to escape via .. or absolute path segments.
  if (storageKey.includes('..') || storageKey.startsWith('/') || storageKey.includes('\\')) {
    throw new Error('invalid storage key');
  }
  const full = resolve(root, storageKey);
  if (full !== root && !full.startsWith(root + sep)) {
    throw new Error('path escapes upload root');
  }
  return full;
}

export function sanitizeOriginalName(name: string): string {
  const base = name.replace(/[/\\]/g, '_').replace(/\0/g, '').trim();
  const cut = base.slice(0, 200);
  return cut.length > 0 ? cut : 'file';
}

export async function writeAttachmentFile(storageKey: string, data: Buffer): Promise<void> {
  const full = absolutePathForKey(storageKey);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, data, { flag: 'wx' });
}

export async function removeAttachmentFile(storageKey: string): Promise<void> {
  try {
    await unlink(absolutePathForKey(storageKey));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') throw err;
  }
}

export function mimeMeta(mime: string): { ext: string; kind: 'datasheet' | 'image' | 'other' } | null {
  return ATTACHMENT_MIME[mime] ?? null;
}
