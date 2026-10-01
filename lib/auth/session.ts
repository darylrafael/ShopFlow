import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { createSessionToken, hashSessionToken } from './crypto';

export const SESSION_COOKIE = 'shopflow_session';
const SESSION_DAYS = 7;

export type AuthenticatedUser = {
  id: string;
  orgId: string;
  email: string;
  name: string;
  role: 'owner' | 'operator';
};

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  let cookieStore: Awaited<ReturnType<typeof cookies>>;
  try {
    cookieStore = await cookies();
  } catch {
    // Route handlers invoked directly by unit tests do not have a request cookie context.
    return null;
  }
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt <= new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  return {
    id: session.user.id,
    orgId: session.user.orgId,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
  };
}

export async function createUserSession(userId: string) {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { userId, tokenHash: hashSessionToken(token), expiresAt } });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env['NODE_ENV'] === 'production',
    sameSite: 'lax',
    expires: expiresAt,
    path: '/',
  });
}

export async function destroyUserSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
  cookieStore.delete(SESSION_COOKIE);
}
