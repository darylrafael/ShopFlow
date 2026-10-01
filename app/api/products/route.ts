import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { getDevelopmentOrgId } from '@/lib/orgContext';
import { ValidationError } from '@/lib/errors';

export async function GET() {
  try {
    const orgId = await getDevelopmentOrgId();
    const products = await prisma.product.findMany({
      where: { orgId },
      include: {
        operationTemplates: {
          orderBy: { sequenceNumber: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(products);
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const orgId = await getDevelopmentOrgId();
    const body = await request.json();

    if (!body.name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    // Validate operation templates if provided
    if (!body.operationTemplates || !Array.isArray(body.operationTemplates) || body.operationTemplates.length === 0) {
      return NextResponse.json({ error: 'At least one operation template is required' }, { status: 400 });
    }

    type OpTemplateInput = {
      operationType?: unknown;
      eligibleMachineTypes?: unknown;
      estimatedDurationMinutes?: unknown;
      description?: unknown;
    };

    const templatesData = body.operationTemplates.map((t: OpTemplateInput, idx: number) => {
      if (typeof t.operationType !== 'string' || !Array.isArray(t.eligibleMachineTypes) || t.eligibleMachineTypes.length === 0 || typeof t.estimatedDurationMinutes !== 'number' || t.estimatedDurationMinutes <= 0) {
        throw new ValidationError(`Invalid operation template at index ${idx}. Requires operationType, non-empty eligibleMachineTypes, and positive estimatedDurationMinutes.`);
      }
      return {
        sequenceNumber: (idx + 1) * 10,
        operationType: t.operationType,
        eligibleMachineTypes: t.eligibleMachineTypes,
        estimatedDurationMinutes: t.estimatedDurationMinutes,
        description: typeof t.description === 'string' ? t.description : null,
      };
    });

    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          orgId,
          name: body.name,
          sku: body.sku,
          operationTemplates: {
            create: templatesData,
          },
        },
        include: {
          operationTemplates: true,
        },
      });

      await tx.activityLog.create({
        data: {
          orgId,
          entityId: created.id,
          entityType: 'Product',
          action: 'CREATE_PRODUCT',
          changes: { name: created.name, sku: created.sku, templateCount: templatesData.length },
        }
      });

      return created;
    });

    return NextResponse.json(product, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    // Handle expected conflict for unique SKU/name if needed, Prisma code P2002
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'A product with this SKU or Name already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
