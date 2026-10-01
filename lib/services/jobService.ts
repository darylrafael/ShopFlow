import prisma from '../prisma';

export async function createJobFromProduct(data: {
  orgId: string;
  jobNumber: string;
  customerName: string;
  productId: string;
  quantity: number;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  dueDate: Date;
}) {
  return prisma.$transaction(async (tx) => {
    // 1. Validate product exists and get its operation templates
    const product = await tx.product.findFirst({
      where: { id: data.productId, orgId: data.orgId },
      include: {
        operationTemplates: {
          orderBy: { sequenceNumber: 'asc' },
        },
      },
    });

    if (!product) {
      throw new Error(`Product not found`);
    }

    // 2. Create the job
    const job = await tx.job.create({
      data: {
        orgId: data.orgId,
        jobNumber: data.jobNumber,
        customerName: data.customerName,
        productId: data.productId,
        quantity: data.quantity,
        priority: data.priority || 'normal',
        dueDate: data.dueDate,
        status: 'draft',
      },
    });

    // 3. Automatically generate job_operations from the product's templates
    // According to Phase 0 domain rules, we MUST NOT include scheduling fields here.
    if (product.operationTemplates.length > 0) {
      const jobOperationsData = product.operationTemplates.map((template) => ({
        jobId: job.id,
        sequenceNumber: template.sequenceNumber,
        operationType: template.operationType,
      }));

      // Let's fetch all machines for this org to map types -> IDs
      const allOrgMachines = await tx.machine.findMany({
        where: { orgId: data.orgId },
      });

      const finalJobOps = jobOperationsData.map((opData, index) => {
        const template = product.operationTemplates[index]!;
        const matchingMachineIds = allOrgMachines
          .filter((m) =>
            m.capabilities.some((cap) => template.eligibleMachineTypes.includes(cap))
          )
          .map((m) => m.id);

        return {
          ...opData,
          eligibleMachineIds: matchingMachineIds,
          estimatedDurationMinutes: template.estimatedDurationMinutes,
          status: 'pending' as const,
        };
      });

      await tx.jobOperation.createMany({
        data: finalJobOps,
      });
    }

    // Log the activity
    await tx.activityLog.create({
      data: {
        orgId: data.orgId,
        entityId: job.id,
        entityType: 'Job',
        action: 'CREATE_JOB_WITH_OPERATIONS',
        changes: { jobNumber: job.jobNumber, operationsCount: product.operationTemplates.length },
      },
    });

    return job;
  });
}
