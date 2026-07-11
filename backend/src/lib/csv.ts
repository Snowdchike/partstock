export type BomCsvRow = {
  designator: string | null;
  quantity: number;
  partNumber: string;
  manufacturer: string | null;
  description: string | null;
  footprint: string | null;
  name: string | null;
};

const HEADER_ALIASES: Record<keyof Omit<BomCsvRow, 'quantity'> | 'quantity', string[]> = {
  designator: ['designator', 'reference', 'references', 'ref', 'refs', 'designators'],
  quantity: ['quantity', 'qty', 'qty.', 'count', 'q'],
  partNumber: ['partnumber', 'part_number', 'mpn', 'pn', 'part', 'value', 'lcsc', 'sku'],
  manufacturer: ['manufacturer', 'mfr', 'mfg', 'brand', 'vendor'],
  description: ['description', 'desc', 'comment', 'comments'],
  footprint: ['footprint', 'package', 'pkg', 'foot print'],
  name: ['name', 'partname', 'part_name', 'title'],
};

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/^\uFEFF/, '')
    .replace(/[^a-z0-9.]+/g, '_');
}

function mapHeader(raw: string): keyof typeof HEADER_ALIASES | null {
  const n = normalizeHeader(raw).replace(/_+/g, '');
  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as Array<
    [keyof typeof HEADER_ALIASES, string[]]
  >) {
    if (aliases.some((a) => a.replace(/[^a-z0-9]+/g, '') === n)) return field;
  }
  return null;
}

function parseCsvLine(line: string): string[] {
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

export function parseBomCsv(text: string): BomCsvRow[] {
  const cleaned = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = cleaned
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
  if (lines.length < 2) {
    throw new Error('CSV must include a header row and at least one data row');
  }

  const headers = parseCsvLine(lines[0]!).map(mapHeader);
  const mpnIdx = headers.indexOf('partNumber');
  const qtyIdx = headers.indexOf('quantity');
  if (mpnIdx === -1) throw new Error('CSV header must include MPN / part number column');
  if (qtyIdx === -1) throw new Error('CSV header must include Qty / quantity column');

  const rows: BomCsvRow[] = [];
  for (let li = 1; li < lines.length; li++) {
    const cols = parseCsvLine(lines[li]!);
    if (cols.every((c) => !c)) continue;

    const get = (field: keyof typeof HEADER_ALIASES): string | null => {
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
