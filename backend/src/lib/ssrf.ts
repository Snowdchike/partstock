import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { BadRequestError } from './errors.js';

const BLOCKED_HOSTS = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata',
]);

function isPrivateIp(ip: string): boolean {
  if (ip === '::1' || ip === '0.0.0.0') return true;
  if (ip.includes(':')) {
    const lower = ip.toLowerCase();
    if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')) return true;
    return false;
  }
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return true;
  const [a, b] = parts as [number, number, number, number];
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

export async function assertSafePublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BadRequestError('Invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BadRequestError('Only http/https URLs are allowed');
  }
  if (url.username || url.password) {
    throw new BadRequestError('URL must not contain credentials');
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (BLOCKED_HOSTS.has(host) || host.endsWith('.localhost') || host.endsWith('.local')) {
    throw new BadRequestError('URL host is not allowed');
  }
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new BadRequestError('URL points to a private IP');
    return url;
  }
  let records: string[];
  try {
    const v4 = await lookup(host, { all: true, family: 4 }).catch(() => [] as Array<{ address: string }>);
    const v6 = await lookup(host, { all: true, family: 6 }).catch(() => [] as Array<{ address: string }>);
    records = [...v4, ...v6].map((r) => r.address);
  } catch {
    throw new BadRequestError('Could not resolve URL host');
  }
  if (records.length === 0) throw new BadRequestError('Could not resolve URL host');
  if (records.some(isPrivateIp)) throw new BadRequestError('URL resolves to a private IP');
  return url;
}

export type FetchedPage = {
  finalUrl: string;
  contentType: string;
  body: string;
};

export async function fetchPublicPage(rawUrl: string, opts?: { timeoutMs?: number; maxBytes?: number }): Promise<FetchedPage> {
  const timeoutMs = opts?.timeoutMs ?? 8000;
  const maxBytes = opts?.maxBytes ?? 1_000_000;
  let current = await assertSafePublicUrl(rawUrl);
  let body = '';
  let contentType = '';
  let finalUrl = current.toString();

  for (let hop = 0; hop < 4; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(current.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'user-agent': 'PartStock-URLImport/0.1 (+self-hosted inventory)',
          accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        },
      });
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const loc = res.headers.get('location');
        if (!loc) throw new BadRequestError('Redirect without location');
        current = await assertSafePublicUrl(new URL(loc, current).toString());
        continue;
      }
      if (!res.ok) throw new BadRequestError(`Upstream returned HTTP ${res.status}`);
      contentType = res.headers.get('content-type') ?? '';
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength > maxBytes) throw new BadRequestError('Response too large');
      body = buf.toString('utf8');
      finalUrl = current.toString();
      return { finalUrl, contentType, body };
    } catch (e) {
      if (e instanceof BadRequestError) throw e;
      if ((e as Error)?.name === 'AbortError') throw new BadRequestError('Upstream request timed out');
      throw new BadRequestError(e instanceof Error ? e.message : 'Failed to fetch URL');
    } finally {
      clearTimeout(timer);
    }
  }
  throw new BadRequestError('Too many redirects');
}
