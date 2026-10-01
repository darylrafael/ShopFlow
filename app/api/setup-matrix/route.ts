import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { getDevelopmentOrgId } from '@/lib/orgContext';


export async function GET() {
  try {
    const orgId = await getDevelopmentOrgId();
    const transitions = await prisma.setupTransition.findMany({
      where: { orgId },
      include: {
        machine: true,
      },
      orderBy: [
        { machineId: 'asc' },
        { fromOpType: 'asc' },
        { toOpType: 'asc' },
      ],
    });
    return NextResponse.json(transitions);
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const orgId = await getDevelopmentOrgId();
    const body = await request.json();

    if (!body.toOpType || typeof body.durationMinutes !== 'number' || body.durationMinutes < 0) {
      return NextResponse.json({ error: 'toOpType is required, and durationMinutes must be non-negative' }, { status: 400 });
    }

    const machineId = body.machineId || null;
    const fromOpType = body.fromOpType || null;

    if (machineId) {
      const machine = await prisma.machine.findFirst({
        where: { id: machineId, orgId },
      });
      if (!machine) {
        return NextResponse.json({ error: 'Machine not found' }, { status: 404 });
      }
    }

    let transition;
    try {
      transition = await prisma.$transaction(async (tx) => {
        const created = await tx.setupTransition.create({
          data: {
            orgId,
            machineId,
            fromOpType,
            toOpType: body.toOpType,
            durationMinutes: body.durationMinutes,
          },
        });

        await tx.activityLog.create({
          data: {
            orgId,
            entityId: created.id,
            entityType: 'SetupTransition',
            action: 'CREATE_SETUP_TRANSITION',
            changes: body,
          },
        });

        return created;
      });
    } catch (e: unknown) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return NextResponse.json({ error: 'A setup transition with these parameters already exists' }, { status: 409 });
      }
      throw e;
    }

    return NextResponse.json(transition, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
