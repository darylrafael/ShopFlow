import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createUserSession } from '@/lib/auth/session';
import { hashSessionToken } from '@/lib/auth/crypto';

export async function POST(request: Request) {
  let body: { token?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }); }
  const token = typeof body.token === 'string' ? body.token : '';
  if (!token) return NextResponse.json({ error: 'Verification token is required' }, { status: 400 });

  const record = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: hashSessionToken(token) }, include: { user: true } });
  if (!record || record.expiresAt <= new Date()) return NextResponse.json({ error: 'This verification link is invalid or expired' }, { status: 400 });

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } });
    await tx.emailVerificationToken.delete({ where: { id: record.id } });
  });
  await createUserSession(record.userId);
  return NextResponse.json({ user: { id: record.user.id, email: record.user.email, name: record.user.name, role: record.user.role } });
}
