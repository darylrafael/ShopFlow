import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getDevelopmentOrgId } from '@/lib/orgContext';


export async function GET() {
  try {
    const orgId = await getDevelopmentOrgId();
    const machines = await prisma.machine.findMany({
      where: { orgId },
      include: {
        unavailabilities: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(machines);
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const orgId = await getDevelopmentOrgId();
    const body = await request.json();
    
    if (!body.name || !body.type || !Array.isArray(body.capabilities) || body.capabilities.length === 0) {
      return NextResponse.json({ error: 'Invalid input. capabilities must be a non-empty array.' }, { status: 400 });
    }

    const machine = await prisma.$transaction(async (tx) => {
      const created = await tx.machine.create({
        data: {
          orgId,
          name: body.name,
          type: body.type,
          capabilities: body.capabilities,
        },
      });

      await tx.activityLog.create({
        data: {
          orgId,
          entityId: created.id,
          entityType: 'Machine',
          action: 'CREATE_MACHINE',
          changes: { name: created.name, type: created.type, capabilities: created.capabilities },
        },
      });

      return created;
    });

    return NextResponse.json(machine, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
