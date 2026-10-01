import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { getDevelopmentOrgId } from '@/lib/orgContext';
import { createJobFromProduct } from '@/lib/services/jobService';

export async function GET() {
  try {
    const orgId = await getDevelopmentOrgId();
    const jobs = await prisma.job.findMany({
      where: { orgId },
      include: {
        product: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(jobs);
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const orgId = await getDevelopmentOrgId();
    const body = await request.json();

    if (!body.jobNumber || !body.customerName || !body.productId || typeof body.quantity !== 'number' || !body.dueDate) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (body.quantity <= 0) {
      return NextResponse.json({ error: 'Quantity must be positive' }, { status: 400 });
    }

    const dueDate = new Date(body.dueDate);
    if (isNaN(dueDate.getTime())) {
      return NextResponse.json({ error: 'Invalid dueDate' }, { status: 400 });
    }

    // According to Phase 0 domain rules, dueDate must be future (enforced at API layer)
    if (dueDate <= new Date()) {
      return NextResponse.json({ error: 'dueDate must be in the future' }, { status: 400 });
    }

    // Use domain service which creates job and operations atomically
    const job = await createJobFromProduct({
      orgId,
      jobNumber: body.jobNumber,
      customerName: body.customerName,
      productId: body.productId,
      quantity: body.quantity,
      priority: body.priority,
      dueDate,
    });

    return NextResponse.json(job, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('Product not found')) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }
    
    // Handle expected conflict for unique JobNumber, Prisma code P2002
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'A job with this Job Number already exists' }, { status: 409 });
    }

    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
