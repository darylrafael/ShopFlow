import { describe, it, expect, beforeAll } from 'vitest';
import prisma from '../../lib/prisma';
import { generateAndPersistSchedule } from '../../lib/services/schedulingService';
import { createJobFromProduct } from '../../lib/services/jobService';

describe('Phase 1A Scheduling Service Integration', () => {
  let orgId: string;
  let productId: string;

  beforeAll(async () => {
    // We assume the seed has run and "Development Org" exists.
    const org = await prisma.organization.findFirst({ where: { name: 'Development Org' } });
    if (!org) throw new Error('Org not found. Did you run the seed?');
    orgId = org.id;

    // Create a product for testing
    const p = await prisma.product.create({
      data: {
        orgId,
        name: 'Integration Test Product',
        operationTemplates: {
          create: [
            { sequenceNumber: 10, operationType: 'mill', eligibleMachineTypes: ['mill'], estimatedDurationMinutes: 60 },
            { sequenceNumber: 20, operationType: 'drill', eligibleMachineTypes: ['drill'], estimatedDurationMinutes: 30 },
          ],
        },
      },
    });
    productId = p.id;
  });

  it('generates a schedule from database state and persists it', async () => {
    // 1. Create jobs to be scheduled
    const job1 = await createJobFromProduct({
      orgId,
      jobNumber: `SCHED-1-${Math.random().toString(36).substring(2, 8)}`,
      customerName: 'Customer A',
      productId,
      quantity: 1,
      dueDate: new Date(Date.now() + 86400000), // Tomorrow
    });

    const job2 = await createJobFromProduct({
      orgId,
      jobNumber: `SCHED-2-${Math.random().toString(36).substring(2, 8)}`,
      customerName: 'Customer B',
      productId,
      quantity: 1,
      dueDate: new Date(Date.now() + 2 * 86400000), // Day after tomorrow
    });

    await prisma.job.updateMany({
      where: { id: { in: [job1.id, job2.id] } },
      data: { status: 'released', releaseDate: new Date() },
    });

    // 2. Invoke the scheduling service
    const schedule = await generateAndPersistSchedule(orgId, 'Manual Trigger');

    expect(schedule).toBeDefined();
    expect(schedule.status).toBe('active');
    expect(schedule.algorithm).toBe('SA-EDD');
    expect(schedule.version).toBeGreaterThan(0);

    // 3. Verify schedule assignments were persisted
    const assignments = await prisma.scheduleAssignment.findMany({
      where: { scheduleId: schedule.id },
      include: { jobOperation: true },
    });

    // We have at least 2 jobs * 2 ops = 4 assignments (plus whatever was already in DB, since it schedules all active jobs)
    expect(assignments.length).toBeGreaterThanOrEqual(4);

    const job1Assignments = assignments.filter(a => a.jobOperation.jobId === job1.id);
    const job2Assignments = assignments.filter(a => a.jobOperation.jobId === job2.id);

    expect(job1Assignments.length).toBe(2);
    expect(job2Assignments.length).toBe(2);

    // Verify precedence
    const j1Op1 = job1Assignments.find(a => a.jobOperation.sequenceNumber === 10)!;
    const j1Op2 = job1Assignments.find(a => a.jobOperation.sequenceNumber === 20)!;
    expect(j1Op1).toBeDefined();
    expect(j1Op2).toBeDefined();
    expect(j1Op2.setupStart.getTime()).toBeGreaterThanOrEqual(j1Op1.processingEnd.getTime());

    // 4. Verify previous active schedule (if any) was superseded
    // If we run it again:
    const newSchedule = await generateAndPersistSchedule(orgId, 'Manual Trigger 2');
    expect(newSchedule.version).toBe(schedule.version + 1);

    const oldSchedule = await prisma.schedule.findUnique({ where: { id: schedule.id } });
    expect(oldSchedule!.status).toBe('superseded');
  });
});
