// Minimal SVG generators for part/lot labels.
// QR via `qrcode` package; Code128-B is pure (no font).

import QRCode from 'qrcode';

const CODE128_B_START = 104;
const CODE128_STOP = 106;

// Code 128 patterns (indices 0–106). Source: standard Code 128 table.
const CODE128_PATTERNS: string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

function code128BValue(ch: string): number {
  const code = ch.charCodeAt(0);
  if (code < 32 || code > 126) {
    throw new Error(`Code128-B cannot encode character code ${code}`);
  }
  return code - 32;
}

function encodeCode128B(data: string): number[] {
  if (!data) throw new Error('Code128 payload empty');
  const values = [CODE128_B_START];
  for (const ch of data) values.push(code128BValue(ch));
  let checksum = values[0]!;
  for (let i = 1; i < values.length; i++) checksum += values[i]! * i;
  values.push(checksum % 103);
  values.push(CODE128_STOP);
  return values;
}

export function renderCode128Svg(
  payload: string,
  opts?: { height?: number; module?: number; caption?: string },
): string {
  const height = opts?.height ?? 60;
  const module = opts?.module ?? 2;
  const caption = opts?.caption ?? payload;
  const values = encodeCode128B(payload);
  let x = module * 10;
  let bars = '';
  for (const v of values) {
    const pattern = CODE128_PATTERNS[v];
    if (!pattern) throw new Error(`Missing Code128 pattern for ${v}`);
    let black = true;
    for (const d of pattern) {
      const w = Number(d) * module;
      if (black) {
        bars += `<rect x="${x}" y="8" width="${w}" height="${height}" fill="#000"/>`;
      }
      x += w;
      black = !black;
    }
  }
  x += module * 10;
  const textY = height + 24;
  const totalH = textY + 8;
  const escaped = escapeXml(caption);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${x}" height="${totalH}" viewBox="0 0 ${x} ${totalH}">
  <rect width="100%" height="100%" fill="#fff"/>
  ${bars}
  <text x="${x / 2}" y="${textY}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="12" fill="#000">${escaped}</text>
</svg>`;
}

export async function renderQrSvg(
  payload: string,
  opts?: { size?: number; caption?: string },
): Promise<string> {
  const size = opts?.size ?? 128;
  const caption = opts?.caption ?? payload;
  const matrix = await QRCode.create(payload, { errorCorrectionLevel: 'M' });
  const modules = matrix.modules;
  const count = modules.size;
  const quiet = 2;
  const cell = size / (count + quiet * 2);
  let rects = '';
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (!modules.get(r, c)) continue;
      const x = (c + quiet) * cell;
      const y = (r + quiet) * cell;
      rects += `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}" fill="#000"/>`;
    }
  }
  const textY = size + 16;
  const totalH = textY + 6;
  const escaped = escapeXml(caption);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${totalH}" viewBox="0 0 ${size} ${totalH}">
  <rect width="100%" height="100%" fill="#fff"/>
  ${rects}
  <text x="${size / 2}" y="${textY}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="10" fill="#000">${escaped}</text>
</svg>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildLabelPayload(input: {
  partNumber: string;
  manufacturer?: string | null;
  lotCode?: string | null;
  name?: string | null;
}): string {
  const parts = [input.partNumber];
  if (input.manufacturer) parts.push(input.manufacturer);
  if (input.lotCode) parts.push(input.lotCode);
  return parts.join('|');
}

export function buildLabelCaption(input: {
  partNumber: string;
  name?: string | null;
  lotCode?: string | null;
}): string {
  const bits = [input.partNumber];
  if (input.lotCode) bits.push(input.lotCode);
  if (input.name) bits.push(input.name);
  return bits.join(' · ').slice(0, 80);
}
