import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getDevelopmentOrgId } from '@/lib/orgContext';


export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const orgId = await getDevelopmentOrgId();
    const body = await request.json();
    
    // Verify machine belongs to org
    const existing = await prisma.machine.findFirst({
      where: { id, orgId },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Machine not found' }, { status: 404 });
    }

    if (body.capabilities && (!Array.isArray(body.capabilities) || body.capabilities.length === 0)) {
      return NextResponse.json({ error: 'capabilities must be a non-empty array' }, { status: 400 });
    }

    const machine = await prisma.$transaction(async (tx) => {
      const updated = await tx.machine.update({
        where: { id },
        data: {
          name: body.name !== undefined ? body.name : undefined,
          type: body.type !== undefined ? body.type : undefined,
          capabilities: body.capabilities !== undefined ? body.capabilities : undefined,
        },
      });

      await tx.activityLog.create({
        data: {
          orgId,
          entityId: updated.id,
          entityType: 'Machine',
          action: 'UPDATE_MACHINE',
          changes: body,
        },
      });

      return updated;
    });

    return NextResponse.json(machine);
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
