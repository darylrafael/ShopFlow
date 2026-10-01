import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { appUrl, isEmailConfigured, sendTransactionalEmail } from '@/lib/auth/email';
import { createOneTimeToken, passwordResetExpiryMs } from '@/lib/auth/tokens';
import { checkRateLimit, getRequestAddress } from '@/lib/auth/rateLimit';

export async function POST(request: Request) {
  const limit = checkRateLimit(`forgot:ip:${getRequestAddress(request)}`, 5, 60 * 60 * 1000);
  if (!limit.allowed) return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } });
  let body: { email?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }); }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
  if (!isEmailConfigured()) return NextResponse.json({ error: 'Password recovery is temporarily unavailable because email delivery is not configured.' }, { status: 503 });

  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const token = createOneTimeToken();
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
    await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: token.tokenHash, expiresAt: new Date(Date.now() + passwordResetExpiryMs) } });
    const resetUrl = `${appUrl()}/reset-password?token=${encodeURIComponent(token.token)}`;
    await sendTransactionalEmail({ to: user.email, subject: 'Reset your ShopFlow password', text: `Reset your ShopFlow password: ${resetUrl}`, html: `<p><a href="${resetUrl}">Reset your ShopFlow password</a>.</p><p>This link expires in 1 hour.</p>` });
  }
  return NextResponse.json({ message: 'If an account exists for that email, a recovery link has been sent.' });
}
