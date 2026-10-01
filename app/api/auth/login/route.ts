import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createUserSession } from '@/lib/auth/session';
import { verifyPassword } from '@/lib/auth/crypto';
import { checkRateLimit, getRequestAddress } from '@/lib/auth/rateLimit';

export async function POST(request: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password) return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });

  const addressLimit = checkRateLimit(`login:ip:${getRequestAddress(request)}`, 10, 15 * 60 * 1000);
  const accountLimit = checkRateLimit(`login:email:${email}`, 10, 15 * 60 * 1000);
  if (!addressLimit.allowed || !accountLimit.allowed) {
    const retryAfterSeconds = Math.max(addressLimit.retryAfterSeconds, accountLimit.retryAfterSeconds);
    return NextResponse.json({ error: 'Too many sign-in attempts. Try again later.' }, { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }
    if (!user.emailVerifiedAt) {
      return NextResponse.json({ error: 'Please verify your email address before signing in' }, { status: 403 });
    }

    await createUserSession(user.id);
    return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch {
    return NextResponse.json({ error: 'Unable to sign in right now' }, { status: 503 });
  }
}
