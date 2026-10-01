import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getDevelopmentOrgId } from '@/lib/orgContext';


export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; uid: string }> }
) {
  try {
    const { id: machineId, uid } = await params;
    const orgId = await getDevelopmentOrgId();

    // Verify machine belongs to org
    const existingMachine = await prisma.machine.findFirst({
      where: { id: machineId, orgId },
    });

    if (!existingMachine) {
      return NextResponse.json({ error: 'Machine not found' }, { status: 404 });
    }

    // Verify unavailability exists and belongs to this machine
    const existingUnavailability = await prisma.machineUnavailability.findFirst({
      where: { id: uid, machineId },
    });

    if (!existingUnavailability) {
      return NextResponse.json({ error: 'Unavailability not found' }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.machineUnavailability.delete({
        where: { id: uid },
      });

      await tx.activityLog.create({
        data: {
          orgId,
          entityId: uid,
          entityType: 'MachineUnavailability',
          action: 'DELETE_UNAVAILABILITY',
          changes: { machineId },
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
