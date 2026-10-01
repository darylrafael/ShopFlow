import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getDevelopmentOrgId } from '@/lib/orgContext';


export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const orgId = await getDevelopmentOrgId();

    const job = await prisma.job.findFirst({
      where: { id, orgId },
      include: {
        product: true,
        jobOperations: {
          orderBy: { sequenceNumber: 'asc' },
        },
      },
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json(job);
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const orgId = await getDevelopmentOrgId();
    const body = await request.json();

    const existing = await prisma.job.findFirst({
      where: { id, orgId },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (body.status !== undefined) {
      if (body.status !== 'released') {
        return NextResponse.json({ error: 'Only releasing a job is supported in this workflow' }, { status: 400 });
      }
      if (existing.status !== 'draft') {
        return NextResponse.json({ error: 'Only draft jobs can be released' }, { status: 409 });
      }
    }

    let dueDate = existing.dueDate;
    if (body.dueDate) {
      dueDate = new Date(body.dueDate);
      if (isNaN(dueDate.getTime())) {
        return NextResponse.json({ error: 'Invalid dueDate' }, { status: 400 });
      }
    }

    const job = await prisma.$transaction(async (tx) => {
      const jobUpdateData = {
        ...(body.customerName !== undefined ? { customerName: body.customerName } : {}),
        ...(body.priority !== undefined ? { priority: body.priority } : {}),
        dueDate,
        ...(body.status === 'released' ? { status: 'released' as const, releaseDate: new Date() } : {}),
      };
      const updated = await tx.job.update({
        where: { id },
        data: jobUpdateData,
      });

      await tx.activityLog.create({
        data: {
          orgId,
          entityId: updated.id,
          entityType: 'Job',
          action: 'UPDATE_JOB',
          changes: body,
        },
      });

      return updated;
    });

    return NextResponse.json(job);
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 400 });
  }
}
