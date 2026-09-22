import { PrismaClient } from '@prisma/client';
import { createJobFromProduct } from '../lib/services/jobService';

const prisma = new PrismaClient();

export async function main() {
  console.log('Seeding database...');

  // 1. Upsert Development Organization
  // We don't have a unique constraint on name, so we find first or create
  let org = await prisma.organization.findFirst({
    where: { name: 'Development Org' }
  });
  if (!org) {
    org = await prisma.organization.create({
      data: { name: 'Development Org' }
    });
  }
  const orgId = org.id;

  // 2. Upsert Products (Using [orgId, sku] unique constraint)
  const productA = await prisma.product.upsert({
    where: { orgId_sku: { orgId, sku: 'AW-100' } },
    update: {},
    create: {
      orgId,
      name: 'Aluminum Widget',
      sku: 'AW-100',
    }
  });

  // 3. Upsert Operation Templates
  // Sequence 10
  await prisma.operationTemplate.upsert({
    where: { productId_sequenceNumber: { productId: productA.id, sequenceNumber: 10 } },
    update: { operationType: 'mill', eligibleMachineTypes: ['mill'], estimatedDurationMinutes: 45 },
    create: {
      productId: productA.id,
      sequenceNumber: 10,
      operationType: 'mill',
      eligibleMachineTypes: ['mill'],
      estimatedDurationMinutes: 45,
      description: 'Face and profile milling'
    }
  });

  // Sequence 20
  await prisma.operationTemplate.upsert({
    where: { productId_sequenceNumber: { productId: productA.id, sequenceNumber: 20 } },
    update: { operationType: 'drill', eligibleMachineTypes: ['drill'], estimatedDurationMinutes: 15 },
    create: {
      productId: productA.id,
      sequenceNumber: 20,
      operationType: 'drill',
      eligibleMachineTypes: ['drill'],
      estimatedDurationMinutes: 15,
      description: 'Drill 4x 5mm holes'
    }
  });

  // 4. Upsert Machines (Find first by name/org)
  let mill = await prisma.machine.findFirst({ where: { orgId, name: 'Haas VF-2' } });
  if (!mill) {
    mill = await prisma.machine.create({
      data: { orgId, name: 'Haas VF-2', type: 'Mill', capabilities: ['mill', 'drill'] }
    });
  }

  let lathe = await prisma.machine.findFirst({ where: { orgId, name: 'Mazak Nexus' } });
  if (!lathe) {
    lathe = await prisma.machine.create({
      data: { orgId, name: 'Mazak Nexus', type: 'Lathe', capabilities: ['turn', 'drill'] }
    });
  }

  // 5. Upsert Global Setup Transitions
  // null -> 'mill'
  const trans1Key = { orgId, machineId: null, fromOpType: null, toOpType: 'mill' };
  
  // To avoid null unique query issues in Prisma Client, use findFirst
  const setup1 = await prisma.setupTransition.findFirst({
    where: trans1Key
  });
  if (!setup1) {
    await prisma.setupTransition.create({
      data: { ...trans1Key, durationMinutes: 30 }
    });
  }

  const trans2Key = { orgId, machineId: null, fromOpType: 'mill', toOpType: 'drill' };
  const setup2 = await prisma.setupTransition.findFirst({
    where: trans2Key
  });
  if (!setup2) {
    await prisma.setupTransition.create({
      data: { ...trans2Key, durationMinutes: 15 }
    });
  }
  
  // 6. Create Job (using domain service) - skip if exists
  const existingJob = await prisma.job.findUnique({
    where: { orgId_jobNumber: { orgId, jobNumber: 'JOB-1000' } }
  });
  if (!existingJob) {
    const jobDueDate = new Date();
    jobDueDate.setDate(jobDueDate.getDate() + 7);

    await createJobFromProduct({
      orgId,
      jobNumber: 'JOB-1000',
      customerName: 'TechCorp',
      productId: productA.id,
      quantity: 50,
      priority: 'normal',
      dueDate: jobDueDate,
    });
  }

  console.log('Database seeded successfully (upsert mode)!');
}

if (process.argv.some(arg => arg.includes('seed.ts'))) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
