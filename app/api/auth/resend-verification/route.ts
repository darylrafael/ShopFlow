import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { appUrl, isEmailConfigured, sendTransactionalEmail } from '@/lib/auth/email';
import { createOneTimeToken, verificationExpiryMs } from '@/lib/auth/tokens';
import { checkRateLimit, getRequestAddress } from '@/lib/auth/rateLimit';

export async function POST(request: Request) {
  const limit = checkRateLimit(`resend-verification:ip:${getRequestAddress(request)}`, 5, 60 * 60 * 1000);
  if (!limit.allowed) return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } });
  let body: { email?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }); }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || !isEmailConfigured()) return NextResponse.json({ error: 'Verification email delivery is unavailable' }, { status: 503 });
  const user = await prisma.user.findUnique({ where: { email } });
  if (user && !user.emailVerifiedAt) {
    const token = createOneTimeToken();
    await prisma.emailVerificationToken.deleteMany({ where: { userId: user.id } });
    await prisma.emailVerificationToken.create({ data: { userId: user.id, tokenHash: token.tokenHash, expiresAt: new Date(Date.now() + verificationExpiryMs) } });
    const verificationUrl = `${appUrl()}/verify-email?token=${encodeURIComponent(token.token)}`;
    await sendTransactionalEmail({ to: user.email, subject: 'Verify your ShopFlow workspace', text: `Verify your ShopFlow account: ${verificationUrl}`, html: `<p><a href="${verificationUrl}">Verify your email address</a>. This link expires in 24 hours.</p>` });
  }
  return NextResponse.json({ message: 'If the account needs verification, a new link has been sent.' });
}
