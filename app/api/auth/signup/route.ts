import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { hashPassword } from '@/lib/auth/crypto';
import { checkRateLimit, getRequestAddress } from '@/lib/auth/rateLimit';
import { appUrl, EmailProviderUnavailableError, isEmailConfigured, sendTransactionalEmail } from '@/lib/auth/email';
import { createOneTimeToken, verificationExpiryMs } from '@/lib/auth/tokens';

export async function POST(request: Request) {
  let body: { name?: string; email?: string; password?: string; organizationName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const organizationName = typeof body.organizationName === 'string' ? body.organizationName.trim() : '';
  const signupLimit = checkRateLimit(`signup:ip:${getRequestAddress(request)}`, 5, 60 * 60 * 1000);
  if (!signupLimit.allowed) {
    return NextResponse.json({ error: 'Too many signup attempts. Try again later.' }, { status: 429, headers: { 'Retry-After': String(signupLimit.retryAfterSeconds) } });
  }
  if (!name || name.length > 100 || !email || email.length > 255 || !organizationName || organizationName.length > 200) {
    return NextResponse.json({ error: 'Name, work email, and organization name are required' }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid work email address' }, { status: 400 });
  }
  if (password.length < 12) {
    return NextResponse.json({ error: 'Password must be at least 12 characters' }, { status: 400 });
  }
  if (!isEmailConfigured()) {
    return NextResponse.json({ error: 'Workspace signup is temporarily unavailable because email delivery is not configured.' }, { status: 503 });
  }

  let createdUserId: string | undefined;
  let createdOrganizationId: string | undefined;
  try {
    const { user, token, organizationId } = await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({ data: { name: organizationName } });
      const user = await tx.user.create({
        data: {
          orgId: organization.id,
          email,
          name,
          role: 'owner',
          passwordHash: await hashPassword(password),
        },
      });
      const token = createOneTimeToken();
      await tx.emailVerificationToken.create({ data: { userId: user.id, tokenHash: token.tokenHash, expiresAt: new Date(Date.now() + verificationExpiryMs) } });
      return { user, token: token.token, organizationId: organization.id };
    });
    createdUserId = user.id;
    createdOrganizationId = organizationId;
    const verificationUrl = `${appUrl()}/verify-email?token=${encodeURIComponent(token)}`;
    await sendTransactionalEmail({
      to: user.email,
      subject: 'Verify your ShopFlow workspace',
      text: `Verify your ShopFlow account: ${verificationUrl}`,
      html: `<p>Welcome to ShopFlow.</p><p><a href="${verificationUrl}">Verify your email address</a> to activate your workspace.</p><p>This link expires in 24 hours.</p>`,
    });
    return NextResponse.json({ message: 'Verification email sent. Check your inbox to activate your workspace.' }, { status: 201 });
  } catch (error: unknown) {
    if (createdUserId && createdOrganizationId) {
      await prisma.$transaction([
        prisma.emailVerificationToken.deleteMany({ where: { userId: createdUserId } }),
        prisma.user.delete({ where: { id: createdUserId } }),
        prisma.organization.delete({ where: { id: createdOrganizationId } }),
      ]).catch(() => undefined);
      if (error instanceof EmailProviderUnavailableError || error instanceof Error) {
        return NextResponse.json({ error: 'We could not deliver the verification email. Please try again later.' }, { status: 503 });
      }
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Unable to create workspace' }, { status: 500 });
  }
}
