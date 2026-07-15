import { describe, expect, it } from 'vitest';
import {
  absolutePathForKey,
  mimeMeta,
  resolveUploadRoot,
  sanitizeOriginalName,
  storageKeyFor,
} from '../../src/lib/attachments.js';

describe('attachments lib', () => {
  it('maps allowed mime types', () => {
    expect(mimeMeta('application/pdf')?.kind).toBe('datasheet');
    expect(mimeMeta('image/png')?.ext).toBe('png');
    expect(mimeMeta('application/x-msdownload')).toBeNull();
  });

  it('builds owner-scoped storage keys', () => {
    expect(storageKeyFor('owner1', 'att1')).toBe('owner1/att1');
  });

  it('rejects path traversal in storage keys', () => {
    expect(() => absolutePathForKey('../etc/passwd')).toThrow();
    expect(() => absolutePathForKey('/etc/passwd')).toThrow();
    expect(() => absolutePathForKey('a\\b')).toThrow();
  });

  it('resolves keys under upload root', () => {
    const full = absolutePathForKey('owner/id');
    expect(full.startsWith(resolveUploadRoot())).toBe(true);
    expect(full.endsWith('owner/id') || full.endsWith('owner\\id')).toBe(true);
  });

  it('sanitizes original names', () => {
    expect(sanitizeOriginalName('../../evil.pdf')).toBe('.._.._evil.pdf');
    expect(sanitizeOriginalName('')).toBe('file');
    expect(sanitizeOriginalName('a'.repeat(300)).length).toBe(200);
  });
});
