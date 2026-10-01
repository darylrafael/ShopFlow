import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'ok', service: 'shopflow' });
  } catch {
    return NextResponse.json({ status: 'unhealthy', service: 'shopflow' }, { status: 503 });
  }
}
