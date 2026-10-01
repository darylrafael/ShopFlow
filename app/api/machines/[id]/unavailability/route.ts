import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getDevelopmentOrgId } from '@/lib/orgContext';


export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: machineId } = await params;
    const orgId = await getDevelopmentOrgId();
    const body = await request.json();

    // Verify machine belongs to org
    const existingMachine = await prisma.machine.findFirst({
      where: { id: machineId, orgId },
    });

    if (!existingMachine) {
      return NextResponse.json({ error: 'Machine not found' }, { status: 404 });
    }

    if (!body.startTime || !body.reason) {
      return NextResponse.json({ error: 'startTime and reason are required' }, { status: 400 });
    }

    const startTime = new Date(body.startTime);
    const endTime = body.endTime ? new Date(body.endTime) : null;

    if (isNaN(startTime.getTime())) {
      return NextResponse.json({ error: 'Invalid startTime' }, { status: 400 });
    }

    if (endTime && isNaN(endTime.getTime())) {
      return NextResponse.json({ error: 'Invalid endTime' }, { status: 400 });
    }

    if (endTime && endTime <= startTime) {
      return NextResponse.json({ error: 'endTime must be strictly after startTime' }, { status: 400 });
    }

    const unavailability = await prisma.$transaction(async (tx) => {
      const created = await tx.machineUnavailability.create({
        data: {
          machineId,
          startTime,
          endTime,
          reason: body.reason,
        },
      });

      await tx.activityLog.create({
        data: {
          orgId,
          entityId: created.id,
          entityType: 'MachineUnavailability',
          action: 'CREATE_UNAVAILABILITY',
          changes: { machineId, startTime, endTime, reason: body.reason },
        },
      });

      return created;
    });

    return NextResponse.json(unavailability, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
