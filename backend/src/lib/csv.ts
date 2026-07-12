export type BomCsvRow = {
  designator: string | null;
  quantity: number;
  partNumber: string;
  manufacturer: string | null;
  description: string | null;
  footprint: string | null;
  name: string | null;
};

export type PartCsvRow = {
  name: string;
  partNumber: string;
  manufacturer: string | null;
  description: string | null;
  footprint: string | null;
  unit: string;
  notes: string | null;
  category: string | null;
  tags: string[];
};

const BOM_HEADER_ALIASES: Record<keyof Omit<BomCsvRow, 'quantity'> | 'quantity', string[]> = {
  designator: ['designator', 'reference', 'references', 'ref', 'refs', 'designators'],
  quantity: ['quantity', 'qty', 'qty.', 'count', 'q'],
  partNumber: ['partnumber', 'part_number', 'mpn', 'pn', 'part', 'value', 'lcsc', 'sku'],
  manufacturer: ['manufacturer', 'mfr', 'mfg', 'brand', 'vendor'],
  description: ['description', 'desc', 'comment', 'comments'],
  footprint: ['footprint', 'package', 'pkg', 'foot print'],
  name: ['name', 'partname', 'part_name', 'title'],
};

const PART_HEADER_ALIASES: Record<keyof Omit<PartCsvRow, 'tags'> | 'tags', string[]> = {
  name: ['name', 'partname', 'part_name', 'title'],
  partNumber: ['partnumber', 'part_number', 'mpn', 'pn', 'sku'],
  manufacturer: ['manufacturer', 'mfr', 'mfg', 'brand'],
  description: ['description', 'desc'],
  footprint: ['footprint', 'package', 'pkg'],
  unit: ['unit', 'uom'],
  notes: ['notes', 'note', 'comment', 'comments'],
  category: ['category', 'cat', 'group'],
  tags: ['tags', 'tag', 'labels'],
};

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/^\uFEFF/, '')
    .replace(/[^a-z0-9.]+/g, '_');
}

function mapHeader<T extends string>(raw: string, aliases: Record<T, string[]>): T | null {
  const n = normalizeHeader(raw).replace(/_+/g, '');
  for (const [field, list] of Object.entries(aliases) as Array<[T, string[]]>) {
    if (list.some((a) => a.replace(/[^a-z0-9]+/g, '') === n)) return field;
  }
  return null;
}

export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function splitCsvRows(text: string): string[] {
  return text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
}

export function escapeCsvCell(v: string | null | undefined): string {
  const s = v ?? '';
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function parseBomCsv(text: string): BomCsvRow[] {
  const lines = splitCsvRows(text);
  if (lines.length < 2) {
    throw new Error('CSV must include a header row and at least one data row');
  }

  const headers = parseCsvLine(lines[0]!).map((h) => mapHeader(h, BOM_HEADER_ALIASES));
  if (headers.indexOf('partNumber') === -1) {
    throw new Error('CSV header must include MPN / part number column');
  }
  if (headers.indexOf('quantity') === -1) {
    throw new Error('CSV header must include Qty / quantity column');
  }

  const rows: BomCsvRow[] = [];
  for (let li = 1; li < lines.length; li++) {
    const cols = parseCsvLine(lines[li]!);
    if (cols.every((c) => !c)) continue;

    const get = (field: keyof typeof BOM_HEADER_ALIASES): string | null => {
      const idx = headers.indexOf(field);
      if (idx === -1) return null;
      const v = cols[idx]?.trim() ?? '';
      return v.length ? v : null;
    };

    const partNumber = get('partNumber');
    if (!partNumber) throw new Error(`Row ${li + 1}: missing part number / MPN`);

    const qtyRaw = get('quantity') ?? '1';
    const quantity = Number(qtyRaw.replace(/,/g, ''));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`Row ${li + 1}: invalid quantity "${qtyRaw}"`);
    }

    rows.push({
      designator: get('designator'),
      quantity,
      partNumber,
      manufacturer: get('manufacturer'),
      description: get('description'),
      footprint: get('footprint'),
      name: get('name'),
    });
  }

  if (rows.length === 0) throw new Error('CSV has no data rows');
  return rows;
}

export function parsePartsCsv(text: string): PartCsvRow[] {
  const lines = splitCsvRows(text);
  if (lines.length < 2) {
    throw new Error('CSV must include a header row and at least one data row');
  }

  const headers = parseCsvLine(lines[0]!).map((h) => mapHeader(h, PART_HEADER_ALIASES));
  if (headers.indexOf('partNumber') === -1) {
    throw new Error('CSV header must include partNumber / MPN column');
  }

  const rows: PartCsvRow[] = [];
  for (let li = 1; li < lines.length; li++) {
    const cols = parseCsvLine(lines[li]!);
    if (cols.every((c) => !c)) continue;

    const get = (field: keyof typeof PART_HEADER_ALIASES): string | null => {
      const idx = headers.indexOf(field);
      if (idx === -1) return null;
      const v = cols[idx]?.trim() ?? '';
      return v.length ? v : null;
    };

    const partNumber = get('partNumber');
    if (!partNumber) throw new Error(`Row ${li + 1}: missing part number / MPN`);

    const name = get('name') ?? partNumber;
    const tagsRaw = get('tags');
    const tags = tagsRaw
      ? tagsRaw
          .split(/[;|]/)
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    rows.push({
      name,
      partNumber,
      manufacturer: get('manufacturer'),
      description: get('description'),
      footprint: get('footprint'),
      unit: get('unit') ?? 'pcs',
      notes: get('notes'),
      category: get('category'),
      tags,
    });
  }

  if (rows.length === 0) throw new Error('CSV has no data rows');
  return rows;
}

export function formatPartsCsv(
  parts: Array<{
    name: string;
    partNumber: string;
    manufacturer: string | null;
    description: string | null;
    footprint: string | null;
    unit: string;
    notes: string | null;
    categoryName: string | null;
    tagNames: string[];
  }>,
): string {
  const header = [
    'name',
    'partNumber',
    'manufacturer',
    'description',
    'footprint',
    'unit',
    'notes',
    'category',
    'tags',
  ].join(',');
  const lines = parts.map((p) =>
    [
      escapeCsvCell(p.name),
      escapeCsvCell(p.partNumber),
      escapeCsvCell(p.manufacturer),
      escapeCsvCell(p.description),
      escapeCsvCell(p.footprint),
      escapeCsvCell(p.unit),
      escapeCsvCell(p.notes),
      escapeCsvCell(p.categoryName),
      escapeCsvCell(p.tagNames.join(';')),
    ].join(','),
  );
  return [header, ...lines].join('\n') + '\n';
}
