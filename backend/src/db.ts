import { PrismaClient } from '@prisma/client';
import { loadConfig } from './config.js';

// One client per process. Re-exported as `db` so routes/services
// can import without managing their own instances.
const config = loadConfig();

export const db = new PrismaClient({
  log: config.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export async function disconnectDb(): Promise<void> {
  await db.$disconnect();
}
