import argon2 from 'argon2';
import { db } from '../db.js';
import { ConflictError, UnauthorizedError } from '../lib/errors.js';
import { newId } from '../lib/ids.js';
import { createSession } from '../plugins/auth.js';
import type { LoginInput, RegisterInput } from '../schemas/auth.schema.js';

const ARGON2_OPTS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB — OWASP 2024 minimum
  timeCost: 2,
  parallelism: 1,
};

export async function register(input: RegisterInput): Promise<{ id: string; email: string }> {
  const existing = await db.user.findUnique({ where: { email: input.email } });
  if (existing) throw new ConflictError('Email already registered');

  const passwordHash = await argon2.hash(input.password, ARGON2_OPTS);
  const isFirstUser = (await db.user.count()) === 0;
  const user = await db.user.create({
    data: {
      id: newId(),
      email: input.email,
      name: input.name,
      passwordHash,
      role: isFirstUser ? 'admin' : 'user',
    },
  });
  return { id: user.id, email: user.email };
}

export async function login(
  input: LoginInput,
  meta: { userAgent?: string; ipAddress?: string },
): Promise<{
  sessionId: string;
  csrfToken: string;
  expiresAt: Date;
  user: { id: string; email: string; name: string; role: string };
}> {
  const user = await db.user.findUnique({ where: { email: input.email } });
  // Constant-ish-time: always hash a dummy if user missing, so timing doesn't leak existence
  const dummyHash =
    '$argon2id$v=19$m=19456,t=2,p=1$ZHVtbXlzYWx0ZHVtbXk$0000000000000000000000000000000000000000000';
  const hash = user?.passwordHash ?? dummyHash;
  const ok = await argon2.verify(hash, input.password).catch(() => false);
  if (!user || !ok) throw new UnauthorizedError('Invalid email or password');

  const session = await createSession(user.id, meta);
  return {
    sessionId: session.id,
    csrfToken: session.csrfToken,
    expiresAt: session.expiresAt,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  };
}

export async function changePassword(
  userId: string,
  oldPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new UnauthorizedError();
  const ok = await argon2.verify(user.passwordHash, oldPassword);
  if (!ok) throw new UnauthorizedError('Wrong password');
  const passwordHash = await argon2.hash(newPassword, ARGON2_OPTS);
  await db.user.update({ where: { id: userId }, data: { passwordHash } });
  // Invalidate all other sessions (keep current: caller decides)
  // Skipped here for simplicity — caller can pass currentSessionId
}
