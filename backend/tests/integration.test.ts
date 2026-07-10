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
