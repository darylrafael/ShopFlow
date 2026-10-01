import { PrismaClient } from '@prisma/client';
import { createJobFromProduct } from '../lib/services/jobService';
import { hashPassword } from '../lib/auth/crypto';

const prisma = new PrismaClient();

async function getOrCreateMachine(orgId: string, name: string, type: string, capabilities: string[]) {
  const existing = await prisma.machine.findFirst({ where: { orgId, name } });
  return existing ?? prisma.machine.create({ data: { orgId, name, type, capabilities } });
}

async function getOrCreateProduct(
  orgId: string,
  sku: string,
  name: string,
  operations: Array<{
    sequenceNumber: number;
    operationType: string;
    eligibleMachineTypes: string[];
    estimatedDurationMinutes: number;
    description: string;
  }>,
) {
  const product = await prisma.product.upsert({
    where: { orgId_sku: { orgId, sku } },
    update: { name },
    create: { orgId, name, sku },
  });

  for (const operation of operations) {
    await prisma.operationTemplate.upsert({
      where: { productId_sequenceNumber: { productId: product.id, sequenceNumber: operation.sequenceNumber } },
      update: operation,
      create: { productId: product.id, ...operation },
    });
  }

  return product;
}

async function createReleasedJob(
  orgId: string,
  productId: string,
  jobNumber: string,
  customerName: string,
  quantity: number,
  priority: 'low' | 'normal' | 'high' | 'urgent',
  dueHoursFromNow: number,
) {
  const existing = await prisma.job.findUnique({ where: { orgId_jobNumber: { orgId, jobNumber } } });
  const job = existing ?? await createJobFromProduct({
    orgId,
    jobNumber,
    customerName,
    productId,
    quantity,
    priority,
    dueDate: new Date(Date.now() + dueHoursFromNow * 60 * 60 * 1000),
  });

  if (job.status === 'draft') {
    await prisma.job.update({ where: { id: job.id }, data: { status: 'released', releaseDate: new Date() } });
  }
}

export async function main() {
  console.log('Seeding clean ShopFlow demo data...');

  const org = await prisma.organization.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: { name: 'Development Org' },
    create: { id: '00000000-0000-0000-0000-000000000001', name: 'Development Org' },
  });

  await prisma.user.upsert({
    where: { email: 'planner@shopflow.local' },
    update: { orgId: org.id, name: 'Demo Planner', role: 'owner' },
    create: {
      orgId: org.id,
      email: 'planner@shopflow.local',
      name: 'Demo Planner',
      role: 'owner',
      passwordHash: await hashPassword('ShopFlowDemo!2026'),
      emailVerifiedAt: new Date(),
    },
  });

  const productA = await getOrCreateProduct(org.id, 'AW-100', 'Aluminum Widget', [
    { sequenceNumber: 10, operationType: 'mill', eligibleMachineTypes: ['mill'], estimatedDurationMinutes: 45, description: 'Face and profile milling' },
    { sequenceNumber: 20, operationType: 'drill', eligibleMachineTypes: ['drill'], estimatedDurationMinutes: 15, description: 'Drill four mounting holes' },
  ]);
  const productB = await getOrCreateProduct(org.id, 'SB-200', 'Steel Bracket', [
    { sequenceNumber: 10, operationType: 'mill', eligibleMachineTypes: ['mill'], estimatedDurationMinutes: 75, description: 'Heavy roughing and finishing' },
    { sequenceNumber: 20, operationType: 'drill', eligibleMachineTypes: ['drill'], estimatedDurationMinutes: 30, description: 'Drill and countersink holes' },
  ]);

  const haas = await getOrCreateMachine(org.id, 'Haas VF-2', 'Mill', ['mill']);
  const mazak = await getOrCreateMachine(org.id, 'Mazak Nexus', 'Mill', ['mill']);
  const okuma = await getOrCreateMachine(org.id, 'Okuma Genos', 'Mill', ['mill']);
  const brother = await getOrCreateMachine(org.id, 'Brother Speedio', 'Drill', ['drill']);

  const setupRules = [
    { machineId: null, fromOpType: null, toOpType: 'mill', durationMinutes: 30 },
    { machineId: null, fromOpType: 'mill', toOpType: 'drill', durationMinutes: 15 },
  ];
  for (const rule of setupRules) {
    const exists = await prisma.setupTransition.findFirst({ where: { orgId: org.id, ...rule } });
    if (!exists) await prisma.setupTransition.create({ data: { orgId: org.id, ...rule } });
  }

  const downtimeStart = new Date(Date.now() + 6 * 60 * 60 * 1000);
  const downtimeEnd = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const existingDowntime = await prisma.machineUnavailability.findFirst({ where: { machineId: mazak.id, reason: 'Planned maintenance' } });
  if (!existingDowntime) {
    await prisma.machineUnavailability.create({
      data: { machineId: mazak.id, startTime: downtimeStart, endTime: downtimeEnd, reason: 'Planned maintenance' },
    });
  }

  await createReleasedJob(org.id, productA.id, 'JOB-1001', 'TechCorp', 50, 'urgent', 10);
  await createReleasedJob(org.id, productB.id, 'JOB-1002', 'Apex Robotics', 20, 'high', 18);
  await createReleasedJob(org.id, productA.id, 'JOB-1003', 'Northstar Medical', 35, 'normal', 30);
  await createReleasedJob(org.id, productB.id, 'JOB-1004', 'Delta Industrial', 15, 'normal', 48);
  await createReleasedJob(org.id, productA.id, 'JOB-1005', 'BrightWorks', 80, 'low', 72);

  console.log(`Demo data ready: ${[haas, mazak, okuma, brother].length} machines and 5 released jobs.`);
}

if (process.argv.some((arg) => arg.includes('seed.ts'))) {
  main()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
