export type PartUrlPreview = {
  sourceUrl: string;
  name: string | null;
  partNumber: string | null;
  manufacturer: string | null;
  description: string | null;
  footprint: string | null;
  imageUrl: string | null;
  confidence: 'high' | 'medium' | 'low';
  signals: string[];
};

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function metaContent(html: string, key: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${key}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${key}["']`, 'i'),
    new RegExp(`<meta[^>]+name=["']${key}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${key}["']`, 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeEntities(m[1].trim());
  }
  return null;
}

function titleTag(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]{1,300})<\/title>/i);
  return m?.[1] ? decodeEntities(m[1].trim()) : null;
}

function itemprop(html: string, prop: string): string | null {
  const re = new RegExp(
    `<[^>]+itemprop=["']${prop}["'][^>]+content=["']([^"']+)["']|<[^>]+itemprop=["']${prop}["'][^>]*>([^<]{1,200})<`,
    'i',
  );
  const m = html.match(re);
  const v = m?.[1] || m?.[2];
  return v ? decodeEntities(v.trim()) : null;
}

function extractJsonLdProducts(html: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = m[1]?.trim();
    if (!raw) continue;
    try {
      const data = JSON.parse(raw) as unknown;
      const stack = Array.isArray(data) ? data : [data];
      for (const node of stack) {
        if (!node || typeof node !== 'object') continue;
        const n = node as Record<string, unknown>;
        const type = n['@type'];
        const types = Array.isArray(type) ? type.map(String) : [String(type ?? '')];
        if (types.some((t) => /product/i.test(t))) out.push(n);
        if (Array.isArray(n['@graph'])) {
          for (const g of n['@graph'] as unknown[]) {
            if (g && typeof g === 'object') {
              const gt = (g as Record<string, unknown>)['@type'];
              const gtypes = Array.isArray(gt) ? gt.map(String) : [String(gt ?? '')];
              if (gtypes.some((t) => /product/i.test(t))) out.push(g as Record<string, unknown>);
            }
          }
        }
      }
    } catch {
      // ignore bad json-ld
    }
  }
  return out;
}

function brandName(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && v && 'name' in v) return String((v as { name: unknown }).name);
  return null;
}

function guessMpnFromText(text: string): string | null {
  const patterns = [
    /\b([A-Z]{1,6}\d{2,}[A-Z0-9-]{2,})\b/,
    /\b(C\d{4,}[A-Z0-9]*)\b/i,
    /\b(R\d{3,}[A-Z0-9-]*)\b/i,
    /\b(STM32[A-Z0-9]+)\b/i,
    /\b([A-Z]{2,}\d{3,}[-A-Z0-9]{2,})\b/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1] && m[1].length >= 4 && m[1].length <= 40) return m[1];
  }
  return null;
}

export function extractPartFromHtml(html: string, pageUrl: string): PartUrlPreview {
  const signals: string[] = [];
  let name: string | null = null;
  let partNumber: string | null = null;
  let manufacturer: string | null = null;
  let description: string | null = null;
  let footprint: string | null = null;
  let imageUrl: string | null = null;

  const products = extractJsonLdProducts(html);
  if (products[0]) {
    const p = products[0];
    if (typeof p.name === 'string') {
      name = p.name;
      signals.push('jsonld:name');
    }
    const mpn = p.mpn ?? p.sku ?? p.productID ?? p.model;
    if (typeof mpn === 'string') {
      partNumber = mpn;
      signals.push('jsonld:mpn');
    }
    const brand = brandName(p.brand);
    if (brand) {
      manufacturer = brand;
      signals.push('jsonld:brand');
    }
    if (typeof p.description === 'string') {
      description = p.description.slice(0, 2000);
      signals.push('jsonld:description');
    }
    const img = p.image;
    if (typeof img === 'string') imageUrl = img;
    else if (Array.isArray(img) && typeof img[0] === 'string') imageUrl = img[0];
  }

  const ogTitle = metaContent(html, 'og:title');
  const ogDesc = metaContent(html, 'og:description');
  const ogImage = metaContent(html, 'og:image');
  const metaDesc = metaContent(html, 'description');
  const title = titleTag(html);

  if (!name && ogTitle) {
    name = ogTitle;
    signals.push('og:title');
  }
  if (!name && title) {
    name = title;
    signals.push('title');
  }
  if (!description && (ogDesc || metaDesc)) {
    description = (ogDesc || metaDesc)!.slice(0, 2000);
    signals.push(ogDesc ? 'og:description' : 'meta:description');
  }
  if (!imageUrl && ogImage) {
    imageUrl = ogImage;
    signals.push('og:image');
  }

  const ipMpn = itemprop(html, 'mpn') || itemprop(html, 'sku') || itemprop(html, 'productID');
  if (!partNumber && ipMpn) {
    partNumber = ipMpn;
    signals.push('itemprop:mpn');
  }
  const ipBrand = itemprop(html, 'brand') || itemprop(html, 'manufacturer');
  if (!manufacturer && ipBrand) {
    manufacturer = ipBrand;
    signals.push('itemprop:brand');
  }
  const ipName = itemprop(html, 'name');
  if (!name && ipName) {
    name = ipName;
    signals.push('itemprop:name');
  }

  const blob = [name, title, ogTitle, description].filter(Boolean).join(' ');
  if (!partNumber) {
    const guess = guessMpnFromText(blob);
    if (guess) {
      partNumber = guess;
      signals.push('guess:mpn');
    }
  }

  // Absolute image
  if (imageUrl) {
    try {
      imageUrl = new URL(imageUrl, pageUrl).toString();
    } catch {
      imageUrl = null;
    }
  }

  let confidence: PartUrlPreview['confidence'] = 'low';
  if (partNumber && (name || manufacturer)) confidence = 'high';
  else if (partNumber || name) confidence = 'medium';

  return {
    sourceUrl: pageUrl,
    name: name?.slice(0, 200) ?? null,
    partNumber: partNumber?.slice(0, 120) ?? null,
    manufacturer: manufacturer?.slice(0, 120) ?? null,
    description: description?.slice(0, 2000) ?? null,
    footprint: footprint?.slice(0, 120) ?? null,
    imageUrl,
    confidence,
    signals,
  };
}

export function extractPartFromJson(body: string, pageUrl: string): PartUrlPreview | null {
  try {
    const data = JSON.parse(body) as Record<string, unknown>;
    const name = typeof data.name === 'string' ? data.name : typeof data.title === 'string' ? data.title : null;
    const partNumber =
      typeof data.mpn === 'string'
        ? data.mpn
        : typeof data.sku === 'string'
          ? data.sku
          : typeof data.partNumber === 'string'
            ? data.partNumber
            : null;
    const manufacturer =
      typeof data.manufacturer === 'string'
        ? data.manufacturer
        : typeof data.brand === 'string'
          ? data.brand
          : null;
    const description = typeof data.description === 'string' ? data.description.slice(0, 2000) : null;
    if (!name && !partNumber) return null;
    return {
      sourceUrl: pageUrl,
      name,
      partNumber,
      manufacturer,
      description,
      footprint: typeof data.footprint === 'string' ? data.footprint : null,
      imageUrl: typeof data.image === 'string' ? data.image : null,
      confidence: partNumber ? 'high' : 'medium',
      signals: ['json'],
    };
  } catch {
    return null;
  }
}
