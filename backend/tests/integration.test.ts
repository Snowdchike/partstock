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
    'Part',
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
  await db.part.deleteMany();
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
