import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';
import { db } from '../src/db.js';

let app: FastifyInstance;

beforeAll(async () => {
  // Clean test DB before any tests run
  const tables = [
    'AuditLog',
    'Label',
    'BuildPick',
    'BuildStage',
    'Build',
    'BomLine',
    'Bom',
    'StockItem',
    'Lot',
    'PartTag',
    'Part',
    'Tag',
    'Category',
    'StorageLocation',
    'Session',
    'User',
  ];
  for (const t of tables) {
    await db.$executeRawUnsafe(`DELETE FROM "${t}"`).catch(() => {});
  }
  app = await buildServer();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  // Truncate between tests to keep state isolated (FK-safe order)
  await db.auditLog.deleteMany();
  await db.label.deleteMany();
  await db.buildPick.deleteMany();
  await db.buildStage.deleteMany();
  await db.build.deleteMany();
  await db.bomLine.deleteMany();
  await db.bom.deleteMany();
  await db.stockItem.deleteMany();
  await db.lot.deleteMany();
  await db.partTag.deleteMany();
  await db.part.deleteMany();
  await db.tag.deleteMany();
  await db.category.deleteMany();
  await db.storageLocation.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
});

async function registerAndLogin(): Promise<{ cookies: string; csrf: string; userId: string }> {
  const email = `tester+${Date.now()}@example.com`;
  await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: {
      email,
      name: 'Tester',
      password: 'Sup3rSecret!Pass',
    },
  });
  const loginRes = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password: 'Sup3rSecret!Pass' },
  });
  expect(loginRes.statusCode).toBe(200);
  const setCookie = loginRes.headers['set-cookie'];
  const cookieStr = Array.isArray(setCookie) ? setCookie.join('; ') : (setCookie ?? '');
  const csrfMatch = /pbx_csrf=([^;]+)/.exec(cookieStr);
  const sessionMatch = /pbx_session=([^;]+)/.exec(cookieStr);
  const user = (await app.inject({
    method: 'GET',
    url: '/api/auth/me',
    headers: { cookie: cookieStr },
  })).json();
  return {
    cookies: `pbx_session=${sessionMatch?.[1] ?? ''}`,
    csrf: csrfMatch?.[1] ?? '',
    userId: (user as { user: { id: string } }).user.id,
  };
}

describe('health', () => {
  it('returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true });
  });
});

describe('auth', () => {
  it('rejects weak passwords on register', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'weak@example.com', name: 'X', password: 'short' },
    });
    expect(res.statusCode).toBe(422);
    expect((res.json() as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
  });

  it('accepts 8-char password with complexity', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'ok8@example.com', name: 'OK8', password: 'Abcd1234' },
    });
    expect(res.statusCode).toBe(201);
  });

  it('rejects 8-char password missing complexity', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'nosym@example.com', name: 'NoSym', password: 'alllower1' },
    });
    expect(res.statusCode).toBe(422);
  });

  it('rejects wrong password on login with 401', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'a@a.com', name: 'A', password: 'GoodPass123Word' },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'a@a.com', password: 'WrongPass123Word' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 on /api/auth/me without cookie', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(res.statusCode).toBe(401);
  });

  it('first registered user becomes admin', async () => {
    const { userId } = await registerAndLogin();
    const me = await db.user.findUnique({ where: { id: userId } });
    expect(me?.role).toBe('admin');
  });
});

describe('parts CRUD + search', () => {
  it('requires auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/parts' });
    expect(res.statusCode).toBe(401);
  });

  it('creates, searches, updates, deletes a part', async () => {
    const { cookies, csrf } = await registerAndLogin();

    const create = await app.inject({
      method: 'POST',
      url: '/api/parts',
      headers: { cookie: cookies, 'x-csrf-token': csrf },
      payload: {
        name: 'Resistor 10k',
        partNumber: 'RC0603FR-0710KL',
        manufacturer: 'Yageo',
        footprint: '0603',
        unit: 'pcs',
        customFields: { voltage: '50V' },
      },
    });
    expect(create.statusCode).toBe(201);
    const part = create.json() as { id: string; name: string };

    const search = await app.inject({
      method: 'GET',
      url: '/api/parts?q=Resistor',
      headers: { cookie: cookies },
    });
    expect(search.statusCode).toBe(200);
    expect((search.json() as { items: unknown[] }).items.length).toBe(1);

    const upd = await app.inject({
      method: 'PATCH',
      url: `/api/parts/${part.id}`,
      headers: { cookie: cookies, 'x-csrf-token': csrf },
      payload: { notes: 'spare stock' },
    });
    expect(upd.statusCode).toBe(200);
    expect((upd.json() as { notes: string }).notes).toBe('spare stock');

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/parts/${part.id}`,
      headers: { cookie: cookies, 'x-csrf-token': csrf },
    });
    expect(del.statusCode).toBe(204);

    const after = await app.inject({
      method: 'GET',
      url: '/api/parts',
      headers: { cookie: cookies },
    });
    expect((after.json() as { items: unknown[] }).items.length).toBe(0);
  });

  it('blocks CSRF on POST without token', async () => {
    const { cookies } = await registerAndLogin();
    const res = await app.inject({
      method: 'POST',
      url: '/api/parts',
      headers: { cookie: cookies },
      payload: { name: 'X', partNumber: 'Y' },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('locations + lots + stock', () => {
  it('creates a location tree, part, lot, adjusts stock', async () => {
    const { cookies, csrf } = await registerAndLogin();

    // parent location
    const parent = await app.inject({
      method: 'POST',
      url: '/api/locations',
      headers: { cookie: cookies, 'x-csrf-token': csrf },
      payload: { name: 'Workshop' },
    });
    const parentId = (parent.json() as { id: string }).id;

    // child location
    const child = await app.inject({
      method: 'POST',
      url: '/api/locations',
      headers: { cookie: cookies, 'x-csrf-token': csrf },
      payload: { name: 'Bin A1', parentId },
    });
    const childId = (child.json() as { id: string }).id;

    // cycle prevention
    const cycle = await app.inject({
      method: 'PATCH',
      url: `/api/locations/${parentId}`,
      headers: { cookie: cookies, 'x-csrf-token': csrf },
      payload: { parentId: childId },
    });
    expect(cycle.statusCode).toBe(400);

    // part
    const part = await app.inject({
      method: 'POST',
      url: '/api/parts',
      headers: { cookie: cookies, 'x-csrf-token': csrf },
      payload: { name: 'Capacitor', partNumber: 'CL10B104KB8NNNC', manufacturer: 'Samsung' },
    });
    const partId = (part.json() as { id: string }).id;

    // lot
    const lot = await app.inject({
      method: 'POST',
      url: '/api/lots',
      headers: { cookie: cookies, 'x-csrf-token': csrf },
      payload: { partId, code: 'REEL-2026-001' },
    });
    const lotId = (lot.json() as { id: string }).id;

    // stock +50
    const adj = await app.inject({
      method: 'POST',
      url: '/api/stock/adjust',
      headers: { cookie: cookies, 'x-csrf-token': csrf },
      payload: { partId, lotId, locationId: childId, delta: 50, reason: 'initial receive' },
    });
    expect(adj.statusCode).toBe(201);
    expect((adj.json() as { quantity: number }).quantity).toBe(50);

    // duplicate lot code rejected
    const dup = await app.inject({
      method: 'POST',
      url: '/api/lots',
      headers: { cookie: cookies, 'x-csrf-token': csrf },
      payload: { partId, code: 'REEL-2026-001' },
    });
    expect(dup.statusCode).toBe(409);

    // overdraw rejected
    const neg = await app.inject({
      method: 'POST',
      url: '/api/stock/adjust',
      headers: { cookie: cookies, 'x-csrf-token': csrf },
      payload: { partId, lotId, locationId: childId, delta: -100, reason: 'overdraw' },
    });
    expect(neg.statusCode).toBe(400);

    // summary
    const summary = await app.inject({
      method: 'GET',
      url: `/api/stock/summary/${partId}`,
      headers: { cookie: cookies },
    });
    expect((summary.json() as { total: number }).total).toBe(50);

    // list all stock (default — not low-only)
    const listAll = await app.inject({
      method: 'GET',
      url: '/api/stock',
      headers: { cookie: cookies },
    });
    expect(listAll.statusCode).toBe(200);
    const allRows = listAll.json() as Array<{ partId: string; total: number }>;
    expect(allRows.some((r) => r.partId === partId && r.total === 50)).toBe(true);

    // low-only with high threshold still includes
    const listLow = await app.inject({
      method: 'GET',
      url: '/api/stock?lowOnly=1&threshold=10',
      headers: { cookie: cookies },
    });
    expect(
      (listLow.json() as Array<{ partId: string }>).some((r) => r.partId === partId),
    ).toBe(false);
  });
});

describe('boms CRUD + CSV import', () => {
  it('requires auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/boms' });
    expect(res.statusCode).toBe(401);
  });

  it('creates BOM with lines, updates, deletes, isolates by owner', async () => {
    const a = await registerAndLogin();
    const b = await registerAndLogin();

    const partA = await app.inject({
      method: 'POST',
      url: '/api/parts',
      headers: { cookie: a.cookies, 'x-csrf-token': a.csrf },
      payload: { name: '10k resistor', partNumber: 'RC0603-10K', manufacturer: 'Yageo' },
    });
    expect(partA.statusCode).toBe(201);
    const partId = (partA.json() as { id: string }).id;

    const create = await app.inject({
      method: 'POST',
      url: '/api/boms',
      headers: { cookie: a.cookies, 'x-csrf-token': a.csrf },
      payload: {
        name: 'Widget v1',
        version: '1.0',
        notes: 'first rev',
        lines: [{ partId, quantity: 2, designator: 'R1,R2' }],
      },
    });
    expect(create.statusCode).toBe(201);
    const bom = create.json() as {
      id: string;
      name: string;
      version: string;
      lines: Array<{ id: string; partId: string; quantity: number; designator: string | null }>;
    };
    expect(bom.name).toBe('Widget v1');
    expect(bom.lines).toHaveLength(1);
    expect(bom.lines[0]?.quantity).toBe(2);

    const listA = await app.inject({
      method: 'GET',
      url: '/api/boms',
      headers: { cookie: a.cookies },
    });
    expect(listA.statusCode).toBe(200);
    expect((listA.json() as { items: unknown[] }).items).toHaveLength(1);

    const listB = await app.inject({
      method: 'GET',
      url: '/api/boms',
      headers: { cookie: b.cookies },
    });
    expect((listB.json() as { items: unknown[] }).items).toHaveLength(0);

    const cross = await app.inject({
      method: 'GET',
      url: `/api/boms/${bom.id}`,
      headers: { cookie: b.cookies },
    });
    expect(cross.statusCode).toBe(404);

    const badPart = await app.inject({
      method: 'POST',
      url: `/api/boms/${bom.id}/lines`,
      headers: { cookie: a.cookies, 'x-csrf-token': a.csrf },
      payload: { partId: 'not-a-real-part', quantity: 1 },
    });
    expect(badPart.statusCode).toBe(404);

    const addLine = await app.inject({
      method: 'POST',
      url: `/api/boms/${bom.id}/lines`,
      headers: { cookie: a.cookies, 'x-csrf-token': a.csrf },
      payload: { partId, quantity: 1, designator: 'R3' },
    });
    expect(addLine.statusCode).toBe(201);

    const got = await app.inject({
      method: 'GET',
      url: `/api/boms/${bom.id}`,
      headers: { cookie: a.cookies },
    });
    expect(got.statusCode).toBe(200);
    expect((got.json() as { lines: unknown[] }).lines).toHaveLength(2);

    const lineId = bom.lines[0]!.id;
    const patchLine = await app.inject({
      method: 'PATCH',
      url: `/api/boms/${bom.id}/lines/${lineId}`,
      headers: { cookie: a.cookies, 'x-csrf-token': a.csrf },
      payload: { quantity: 4, designator: 'R1,R2,R4,R5' },
    });
    expect(patchLine.statusCode).toBe(200);
    expect((patchLine.json() as { quantity: number }).quantity).toBe(4);

    const delLine = await app.inject({
      method: 'DELETE',
      url: `/api/boms/${bom.id}/lines/${lineId}`,
      headers: { cookie: a.cookies, 'x-csrf-token': a.csrf },
    });
    expect(delLine.statusCode).toBe(204);

    const upd = await app.inject({
      method: 'PATCH',
      url: `/api/boms/${bom.id}`,
      headers: { cookie: a.cookies, 'x-csrf-token': a.csrf },
      payload: { notes: 'rev b' },
    });
    expect(upd.statusCode).toBe(200);
    expect((upd.json() as { notes: string }).notes).toBe('rev b');

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/boms/${bom.id}`,
      headers: { cookie: a.cookies, 'x-csrf-token': a.csrf },
    });
    expect(del.statusCode).toBe(204);

    const after = await app.inject({
      method: 'GET',
      url: '/api/boms',
      headers: { cookie: a.cookies },
    });
    expect((after.json() as { items: unknown[] }).items).toHaveLength(0);
  });

  it('imports KiCad-style CSV and creates missing parts when requested', async () => {
    const { cookies, csrf } = await registerAndLogin();

    const existing = await app.inject({
      method: 'POST',
      url: '/api/parts',
      headers: { cookie: cookies, 'x-csrf-token': csrf },
      payload: { name: 'Existing cap', partNumber: 'CL10B104KB8NNNC', manufacturer: 'Samsung' },
    });
    expect(existing.statusCode).toBe(201);

    const bomRes = await app.inject({
      method: 'POST',
      url: '/api/boms',
      headers: { cookie: cookies, 'x-csrf-token': csrf },
      payload: { name: 'CSV Board', version: 'A' },
    });
    expect(bomRes.statusCode).toBe(201);
    const bomId = (bomRes.json() as { id: string }).id;

    const csv = [
      'Reference,Qty,MPN,Manufacturer,Description,Footprint',
      '"C1,C2",2,CL10B104KB8NNNC,Samsung,100nF X7R,0603',
      'R1,1,RC0603FR-0710KL,Yageo,10k 1%,0603',
      'U1,1,STM32F103C8T6,ST,MCU,LQFP48',
    ].join('\n');

    const imp = await app.inject({
      method: 'POST',
      url: `/api/boms/${bomId}/import-csv`,
      headers: { cookie: cookies, 'x-csrf-token': csrf },
      payload: { csv, createMissingParts: true },
    });
    expect(imp.statusCode).toBe(200);
    const body = imp.json() as {
      lines: Array<{ designator: string | null; quantity: number; part: { partNumber: string } }>;
      createdParts: number;
      matchedParts: number;
    };
    expect(body.lines).toHaveLength(3);
    expect(body.createdParts).toBe(2);
    expect(body.matchedParts).toBe(1);

    const capLine = body.lines.find((l) => l.part.partNumber === 'CL10B104KB8NNNC');
    expect(capLine?.quantity).toBe(2);
    expect(capLine?.designator).toBe('C1,C2');

    const parts = await app.inject({
      method: 'GET',
      url: '/api/parts?q=STM32',
      headers: { cookie: cookies },
    });
    expect((parts.json() as { items: unknown[] }).items.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects CSV import when createMissingParts is false and MPN missing', async () => {
    const { cookies, csrf } = await registerAndLogin();
    const bomRes = await app.inject({
      method: 'POST',
      url: '/api/boms',
      headers: { cookie: cookies, 'x-csrf-token': csrf },
      payload: { name: 'Strict BOM' },
    });
    const bomId = (bomRes.json() as { id: string }).id;

    const imp = await app.inject({
      method: 'POST',
      url: `/api/boms/${bomId}/import-csv`,
      headers: { cookie: cookies, 'x-csrf-token': csrf },
      payload: {
        csv: 'Reference,Qty,MPN,Manufacturer\nR1,1,NOTEXIST,Acme\n',
        createMissingParts: false,
      },
    });
    expect(imp.statusCode).toBe(400);
  });
});

describe('builds pick list + stock reserve/consume', () => {
  it('requires auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/builds' });
    expect(res.statusCode).toBe(401);
  });

  it('creates build from BOM, reserves stock, completes and consumes', async () => {
    const { cookies, csrf } = await registerAndLogin();

    const loc = await app.inject({
      method: 'POST',
      url: '/api/locations',
      headers: { cookie: cookies, 'x-csrf-token': csrf },
      payload: { name: 'Bin B1' },
    });
    const locationId = (loc.json() as { id: string }).id;

    const part = await app.inject({
      method: 'POST',
      url: '/api/parts',
      headers: { cookie: cookies, 'x-csrf-token': csrf },
      payload: { name: 'MCU', partNumber: 'STM32F103', manufacturer: 'ST' },
    });
    const partId = (part.json() as { id: string }).id;

    await app.inject({
      method: 'POST',
      url: '/api/stock/adjust',
      headers: { cookie: cookies, 'x-csrf-token': csrf },
      payload: { partId, locationId, delta: 100, reason: 'seed' },
    });

    const bom = await app.inject({
      method: 'POST',
      url: '/api/boms',
      headers: { cookie: cookies, 'x-csrf-token': csrf },
      payload: {
        name: 'Controller',
        version: '1',
        lines: [{ partId, quantity: 1, designator: 'U1' }],
      },
    });
    const bomId = (bom.json() as { id: string }).id;

    // 10 boards * 1 part * (1 + 2% attrition) = 10.2 requested
    const created = await app.inject({
      method: 'POST',
      url: '/api/builds',
      headers: { cookie: cookies, 'x-csrf-token': csrf },
      payload: {
        bomId,
        name: 'Batch #1',
        quantity: 10,
        attritionPercent: 2,
        reserve: true,
      },
    });
    expect(created.statusCode).toBe(201);
    const body = created.json() as {
      build: {
        id: string;
        status: string;
        quantity: number;
        stages: Array<{
          picks: Array<{ id: string; quantityRequested: number; quantityPicked: number; locationId: string }>;
        }>;
      };
      shortages: unknown[];
      reserved: boolean;
    };
    expect(body.reserved).toBe(true);
    expect(body.shortages).toHaveLength(0);
    expect(body.build.status).toBe('planned');
    expect(body.build.quantity).toBe(10);
    const pick = body.build.stages[0]!.picks[0]!;
    expect(pick.quantityRequested).toBeCloseTo(10.2, 5);
    expect(pick.locationId).toBe(locationId);

    const summaryReserved = await app.inject({
      method: 'GET',
      url: `/api/stock/summary/${partId}`,
      headers: { cookie: cookies },
    });
    const reservedBefore = summaryReserved.json() as { total: number; reserved: number; available: number };
    expect(reservedBefore.total).toBe(100);
    expect(reservedBefore.reserved).toBeCloseTo(10.2, 5);
    expect(reservedBefore.available).toBeCloseTo(89.8, 5);

    const start = await app.inject({
      method: 'POST',
      url: `/api/builds/${body.build.id}/start`,
      headers: { cookie: cookies, 'x-csrf-token': csrf },
    });
    expect(start.statusCode).toBe(200);
    expect((start.json() as { status: string }).status).toBe('in_progress');

    const complete = await app.inject({
      method: 'POST',
      url: `/api/builds/${body.build.id}/complete`,
      headers: { cookie: cookies, 'x-csrf-token': csrf },
    });
    expect(complete.statusCode).toBe(200);
    expect((complete.json() as { status: string }).status).toBe('done');

    const summaryAfter = await app.inject({
      method: 'GET',
      url: `/api/stock/summary/${partId}`,
      headers: { cookie: cookies },
    });
    const after = summaryAfter.json() as { total: number; reserved: number; available: number };
    expect(after.total).toBeCloseTo(89.8, 5);
    expect(after.reserved).toBeCloseTo(0, 5);
  });

  it('reports shortage when stock is insufficient and cancel releases reservation', async () => {
    const { cookies, csrf } = await registerAndLogin();

    const loc = await app.inject({
      method: 'POST',
      url: '/api/locations',
      headers: { cookie: cookies, 'x-csrf-token': csrf },
      payload: { name: 'Bin C1' },
    });
    const locationId = (loc.json() as { id: string }).id;

    const part = await app.inject({
      method: 'POST',
      url: '/api/parts',
      headers: { cookie: cookies, 'x-csrf-token': csrf },
      payload: { name: 'Resistor', partNumber: 'R1K', manufacturer: 'Yageo' },
    });
    const partId = (part.json() as { id: string }).id;

    await app.inject({
      method: 'POST',
      url: '/api/stock/adjust',
      headers: { cookie: cookies, 'x-csrf-token': csrf },
      payload: { partId, locationId, delta: 5, reason: 'seed' },
    });

    const bom = await app.inject({
      method: 'POST',
      url: '/api/boms',
      headers: { cookie: cookies, 'x-csrf-token': csrf },
      payload: {
        name: 'Short board',
        lines: [{ partId, quantity: 2, designator: 'R1,R2' }],
      },
    });
    const bomId = (bom.json() as { id: string }).id;

    // 10 boards * 2 = 20 needed, only 5 in stock
    const created = await app.inject({
      method: 'POST',
      url: '/api/builds',
      headers: { cookie: cookies, 'x-csrf-token': csrf },
      payload: { bomId, name: 'Short batch', quantity: 10, attritionPercent: 0, reserve: true },
    });
    expect(created.statusCode).toBe(201);
    const body = created.json() as {
      build: { id: string; stages: Array<{ picks: Array<{ quantityRequested: number }> }> };
      shortages: Array<{ short: number; needed: number; allocated: number }>;
    };
    expect(body.shortages.length).toBe(1);
    expect(body.shortages[0]!.needed).toBe(20);
    expect(body.shortages[0]!.allocated).toBe(5);
    expect(body.shortages[0]!.short).toBe(15);
    expect(body.build.stages[0]!.picks[0]!.quantityRequested).toBe(5);

    const cancel = await app.inject({
      method: 'POST',
      url: `/api/builds/${body.build.id}/cancel`,
      headers: { cookie: cookies, 'x-csrf-token': csrf },
    });
    expect(cancel.statusCode).toBe(200);
    expect((cancel.json() as { status: string }).status).toBe('cancelled');

    const summary = await app.inject({
      method: 'GET',
      url: `/api/stock/summary/${partId}`,
      headers: { cookie: cookies },
    });
    const s = summary.json() as { total: number; reserved: number };
    expect(s.total).toBe(5);
    expect(s.reserved).toBe(0);
  });
});

describe('labels QR + code128', () => {
  it('requires auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/labels' });
    expect(res.statusCode).toBe(401);
  });

  it('creates QR and Code128 labels, lists, deletes', async () => {
    const { cookies, csrf } = await registerAndLogin();

    const part = await app.inject({
      method: 'POST',
      url: '/api/parts',
      headers: { cookie: cookies, 'x-csrf-token': csrf },
      payload: { name: '10k resistor', partNumber: 'RC0603-10K', manufacturer: 'Yageo' },
    });
    const partId = (part.json() as { id: string }).id;

    const lot = await app.inject({
      method: 'POST',
      url: '/api/lots',
      headers: { cookie: cookies, 'x-csrf-token': csrf },
      payload: { partId, code: 'REEL-LBL-1' },
    });
    const lotId = (lot.json() as { id: string }).id;

    const qr = await app.inject({
      method: 'POST',
      url: '/api/labels',
      headers: { cookie: cookies, 'x-csrf-token': csrf },
      payload: { partId, lotId, format: 'qr', copies: 2 },
    });
    expect(qr.statusCode).toBe(201);
    const qrBody = qr.json() as {
      count: number;
      items: Array<{ id: string; format: string; svg: string; payload: string }>;
    };
    expect(qrBody.count).toBe(2);
    expect(qrBody.items[0]!.format).toBe('qr');
    expect(qrBody.items[0]!.svg).toContain('<svg');
    expect(qrBody.items[0]!.payload).toContain('RC0603-10K');
    expect(qrBody.items[0]!.payload).toContain('REEL-LBL-1');

    const c128 = await app.inject({
      method: 'POST',
      url: '/api/labels',
      headers: { cookie: cookies, 'x-csrf-token': csrf },
      payload: { partId, format: 'code128', copies: 1 },
    });
    expect(c128.statusCode).toBe(201);
    const cBody = c128.json() as { items: Array<{ format: string; svg: string }> };
    expect(cBody.items[0]!.format).toBe('code128');
    expect(cBody.items[0]!.svg).toContain('<rect');

    const list = await app.inject({
      method: 'GET',
      url: `/api/labels?partId=${partId}`,
      headers: { cookie: cookies },
    });
    expect(list.statusCode).toBe(200);
    expect((list.json() as { total: number }).total).toBe(3);

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/labels/${qrBody.items[0]!.id}`,
      headers: { cookie: cookies, 'x-csrf-token': csrf },
    });
    expect(del.statusCode).toBe(204);

    const after = await app.inject({
      method: 'GET',
      url: '/api/labels',
      headers: { cookie: cookies },
    });
    expect((after.json() as { total: number }).total).toBe(2);
  });
});

describe('categories + tags', () => {
  it('creates category tree, tags, assigns to part, isolates by owner', async () => {
    const a = await registerAndLogin();
    const b = await registerAndLogin();

    const parent = await app.inject({
      method: 'POST',
      url: '/api/categories',
      headers: { cookie: a.cookies, 'x-csrf-token': a.csrf },
      payload: { name: 'Passive' },
    });
    expect(parent.statusCode).toBe(201);
    const parentId = (parent.json() as { id: string }).id;

    const child = await app.inject({
      method: 'POST',
      url: '/api/categories',
      headers: { cookie: a.cookies, 'x-csrf-token': a.csrf },
      payload: { name: 'Resistors', parentId },
    });
    expect(child.statusCode).toBe(201);
    const childId = (child.json() as { id: string }).id;

    const cycle = await app.inject({
      method: 'PATCH',
      url: `/api/categories/${parentId}`,
      headers: { cookie: a.cookies, 'x-csrf-token': a.csrf },
      payload: { parentId: childId },
    });
    expect(cycle.statusCode).toBe(400);

    const tag = await app.inject({
      method: 'POST',
      url: '/api/tags',
      headers: { cookie: a.cookies, 'x-csrf-token': a.csrf },
      payload: { name: 'SMD', color: '3366ff' },
    });
    expect(tag.statusCode).toBe(201);
    const tagBody = tag.json() as { id: string; color: string };
    expect(tagBody.color).toBe('#3366ff');
    const tagId = tagBody.id;

    const part = await app.inject({
      method: 'POST',
      url: '/api/parts',
      headers: { cookie: a.cookies, 'x-csrf-token': a.csrf },
      payload: {
        name: '10k',
        partNumber: 'R10K-CAT',
        categoryId: childId,
        tagIds: [tagId],
      },
    });
    expect(part.statusCode).toBe(201);
    const partBody = part.json() as {
      id: string;
      categoryId: string;
      tags: Array<{ id: string; name: string }>;
    };
    expect(partBody.categoryId).toBe(childId);
    expect(partBody.tags).toHaveLength(1);
    expect(partBody.tags[0]!.name).toBe('SMD');

    const filtered = await app.inject({
      method: 'GET',
      url: `/api/parts?categoryId=${childId}&tagId=${tagId}`,
      headers: { cookie: a.cookies },
    });
    expect(filtered.statusCode).toBe(200);
    expect((filtered.json() as { items: unknown[] }).items).toHaveLength(1);

    const bCats = await app.inject({
      method: 'GET',
      url: '/api/categories',
      headers: { cookie: b.cookies },
    });
    expect((bCats.json() as unknown[]).length).toBe(0);

    const steal = await app.inject({
      method: 'POST',
      url: '/api/parts',
      headers: { cookie: b.cookies, 'x-csrf-token': b.csrf },
      payload: { name: 'X', partNumber: 'X1', categoryId: childId },
    });
    expect(steal.statusCode).toBe(400);

    const delParent = await app.inject({
      method: 'DELETE',
      url: `/api/categories/${parentId}`,
      headers: { cookie: a.cookies, 'x-csrf-token': a.csrf },
    });
    expect(delParent.statusCode).toBe(400);
  });
});

describe('scan lookup', () => {
  it('finds part by MPN and label payload', async () => {
    const { cookies, csrf } = await registerAndLogin();

    const part = await app.inject({
      method: 'POST',
      url: '/api/parts',
      headers: { cookie: cookies, 'x-csrf-token': csrf },
      payload: { name: 'Scan Part', partNumber: 'SCAN-MPN-1', manufacturer: 'Yageo' },
    });
    const partId = (part.json() as { id: string }).id;

    const byMpn = await app.inject({
      method: 'GET',
      url: '/api/scan?q=SCAN-MPN-1',
      headers: { cookie: cookies },
    });
    expect(byMpn.statusCode).toBe(200);
    const mpnBody = byMpn.json() as {
      count: number;
      primary: { type: string; partId?: string } | null;
      matches: Array<{ type: string }>;
    };
    expect(mpnBody.count).toBeGreaterThan(0);
    expect(mpnBody.primary?.type).toBe('part');
    expect(mpnBody.primary?.partId).toBe(partId);

    const lot = await app.inject({
      method: 'POST',
      url: '/api/lots',
      headers: { cookie: cookies, 'x-csrf-token': csrf },
      payload: { partId, code: 'LOT-SCAN-9' },
    });
    expect(lot.statusCode).toBe(201);

    const lbl = await app.inject({
      method: 'POST',
      url: '/api/labels',
      headers: { cookie: cookies, 'x-csrf-token': csrf },
      payload: { partId, format: 'qr', copies: 1 },
    });
    expect(lbl.statusCode).toBe(201);
    const payload = (lbl.json() as { items: Array<{ payload: string }> }).items[0]!.payload;

    const byPayload = await app.inject({
      method: 'GET',
      url: `/api/scan?q=${encodeURIComponent(payload)}`,
      headers: { cookie: cookies },
    });
    expect(byPayload.statusCode).toBe(200);
    const pBody = byPayload.json() as { primary: { partId?: string } | null; matches: Array<{ type: string }> };
    expect(pBody.primary?.partId).toBe(partId);
    expect(pBody.matches.some((m) => m.type === 'label' || m.type === 'part')).toBe(true);

    const byLot = await app.inject({
      method: 'GET',
      url: '/api/scan?q=LOT-SCAN-9',
      headers: { cookie: cookies },
    });
    expect((byLot.json() as { matches: Array<{ type: string }> }).matches.some((m) => m.type === 'lot')).toBe(
      true,
    );
  });

  it('requires auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/scan?q=x' });
    expect(res.statusCode).toBe(401);
  });
});

describe('parts CSV import/export', () => {
  it('exports CSV and imports creating categories/tags', async () => {
    const { cookies, csrf } = await registerAndLogin();

    await app.inject({
      method: 'POST',
      url: '/api/parts',
      headers: { cookie: cookies, 'x-csrf-token': csrf },
      payload: { name: 'Seed Cap', partNumber: 'C100N', manufacturer: 'Samsung' },
    });

    const exp = await app.inject({
      method: 'GET',
      url: '/api/parts/export.csv',
      headers: { cookie: cookies },
    });
    expect(exp.statusCode).toBe(200);
    expect(String(exp.headers['content-type'])).toContain('text/csv');
    expect(exp.body).toContain('partNumber');
    expect(exp.body).toContain('C100N');

    const csv = [
      'name,partNumber,manufacturer,description,footprint,unit,notes,category,tags',
      '10k resistor,R10K-CSV,Yageo,10k 1%,0603,pcs,from csv,Passive,SMD;Cheap',
      'MCU,STM32F103,ST,Bluepill,LQFP48,pcs,,MCU,SMD',
    ].join('\n');

    const imp = await app.inject({
      method: 'POST',
      url: '/api/parts/import-csv',
      headers: { cookie: cookies, 'x-csrf-token': csrf },
      payload: {
        csv,
        updateExisting: true,
        createMissingCategories: true,
        createMissingTags: true,
      },
    });
    expect(imp.statusCode).toBe(200);
    const body = imp.json() as {
      created: number;
      updated: number;
      total: number;
      errors: unknown[];
    };
    expect(body.total).toBe(2);
    expect(body.created).toBe(2);
    expect(body.errors).toHaveLength(0);

    const list = await app.inject({
      method: 'GET',
      url: '/api/parts?q=R10K-CSV',
      headers: { cookie: cookies },
    });
    const items = (list.json() as { items: Array<{ partNumber: string; category?: { name: string }; tags?: Array<{ name: string }> }> }).items;
    expect(items).toHaveLength(1);
    expect(items[0]!.category?.name).toBe('Passive');
    expect(items[0]!.tags?.map((t) => t.name).sort()).toEqual(['Cheap', 'SMD']);

    // re-import updates existing
    const csv2 = [
      'name,partNumber,manufacturer,description,footprint,unit,notes,category,tags',
      '10k resistor UPD,R10K-CSV,Yageo,updated,0603,pcs,note2,Passive,SMD',
    ].join('\n');
    const imp2 = await app.inject({
      method: 'POST',
      url: '/api/parts/import-csv',
      headers: { cookie: cookies, 'x-csrf-token': csrf },
      payload: { csv: csv2, updateExisting: true },
    });
    expect(imp2.statusCode).toBe(200);
    expect((imp2.json() as { updated: number }).updated).toBe(1);

    const got = await app.inject({
      method: 'GET',
      url: '/api/parts?q=R10K-CSV',
      headers: { cookie: cookies },
    });
    expect((got.json() as { items: Array<{ name: string }> }).items[0]!.name).toBe('10k resistor UPD');
  });

  it('requires auth for export', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/parts/export.csv' });
    expect(res.statusCode).toBe(401);
  });
});
