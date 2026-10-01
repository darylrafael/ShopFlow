import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword, hashSessionToken } from '@/lib/auth/crypto';

export async function POST(request: Request) {
  let body: { token?: string; password?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }); }
  const token = typeof body.token === 'string' ? body.token : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!token || password.length < 12) return NextResponse.json({ error: 'A valid token and a password of at least 12 characters are required' }, { status: 400 });

  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashSessionToken(token) } });
  if (!record || record.usedAt || record.expiresAt <= new Date()) return NextResponse.json({ error: 'This recovery link is invalid or expired' }, { status: 400 });
  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
    await tx.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    await tx.session.deleteMany({ where: { userId: record.userId } });
  });
  return NextResponse.json({ message: 'Password updated. You can sign in now.' });
}
