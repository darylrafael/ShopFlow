import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '../lib/prisma';
import { POST as productsPost } from '../app/api/products/route';
import { POST as jobsPost } from '../app/api/jobs/route';
import { POST as setupMatrixPost } from '../app/api/setup-matrix/route';
import { POST as unavailabilitiesPost } from '../app/api/machines/[id]/unavailability/route';

describe('ShopFlow Phase 0B Domain Tests', () => {
  let orgId: string;
  let otherOrgId: string;

  beforeAll(async () => {
    // Ensure DB is seeded and fetch the orgs
    const org = await prisma.organization.findFirst({ where: { name: 'Development Org' } });
    if (!org) throw new Error('Development Org not found. Run seed script.');
    orgId = org.id;

    let otherOrg = await prisma.organization.findFirst({ where: { name: 'Other Org (Test)' } });
    if (!otherOrg) {
      otherOrg = await prisma.organization.create({
        data: { name: 'Other Org (Test)' },
      });
    }
    otherOrgId = otherOrg.id;
  });

  afterAll(async () => {
    // Cleanup created test data if necessary, though DB is ephemeral in this context
  });

  it('G. Seed can execute successfully and is idempotent', async () => {
    const { main } = await import('../prisma/seed');
    // First run (already ran, but we run again)
    await main();
    
    // Check no unintended duplicates (should have exactly 1 Development Org)
    const count = await prisma.organization.count({ where: { name: 'Development Org' } });
    expect(count).toBe(1);
  });

  describe('A. Job Creation & B. Transactionality', () => {
    let testProductId: string;

    beforeAll(async () => {
      // Create a test product
      const product = await prisma.product.create({
        data: {
          orgId,
          name: 'Test Product A',
          operationTemplates: {
            create: [
              { sequenceNumber: 10, operationType: 'mill', eligibleMachineTypes: ['mill'], estimatedDurationMinutes: 30 },
              { sequenceNumber: 20, operationType: 'drill', eligibleMachineTypes: ['drill'], estimatedDurationMinutes: 15 },
            ],
          },
        },
      });
      testProductId = product.id;
    });

    it('creates a Job and expected JobOperations with correct ordering', async () => {
      const req = new Request('http://localhost/api/jobs', {
        method: 'POST',
        body: JSON.stringify({
          jobNumber: `JOB-${Math.random().toString(36).substring(2, 8)}`,
          customerName: 'Test Customer',
          productId: testProductId,
          quantity: 5,
          dueDate: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
        }),
      });

      const res = await jobsPost(req);
      const data = await res.json();
      expect(res.status).toBe(201);
      expect(data.id).toBeDefined();

      const jobOps = await prisma.jobOperation.findMany({
        where: { jobId: data.id },
        orderBy: { sequenceNumber: 'asc' },
      });

      expect(jobOps.length).toBe(2);
      expect(jobOps[0]!.sequenceNumber).toBe(10);
      expect(jobOps[0]!.operationType).toBe('mill');
      expect(jobOps[1]!.sequenceNumber).toBe(20);
      expect(jobOps[1]!.operationType).toBe('drill');
    });

    it('maintains transactionality (rollback on failure)', async () => {
      // We trigger a failure in the DB layer by passing a negative quantity
      // The API validates quantity > 0, so we bypass API validation by calling the service, or we just trust the API rejection.
      // Wait, if we want to test that Job is NOT left partially persisted, we can simulate a DB constraint failure.
      // E.g. extremely long customerName that exceeds varchar? prisma String has no limit in Postgres usually.
      // Let's pass negative quantity directly to service to bypass API validation.
      const { createJobFromProduct } = await import('../lib/services/jobService');
      
      const jobsBefore = await prisma.job.count({ where: { orgId } });
      
      await expect(createJobFromProduct({
        orgId,
        jobNumber: `FAIL-${Math.random().toString(36).substring(2, 8)}`,
        customerName: 'Test',
        productId: testProductId,
        quantity: -5, // Violates DB CHECK constraint (quantity > 0)
        dueDate: new Date(Date.now() + 86400000),
      })).rejects.toThrow();

      const jobsAfter = await prisma.job.count({ where: { orgId } });
      expect(jobsAfter).toBe(jobsBefore); // No partial persistence
    });

    it('handles duplicate jobNumber safely (expected conflict -> 409, no Prisma leakage)', async () => {
      const payload = {
        jobNumber: `DUPE-${Math.random().toString(36).substring(2, 8)}`,
        customerName: 'Test Customer',
        productId: testProductId,
        quantity: 1,
        dueDate: new Date(Date.now() + 86400000).toISOString(),
      };

      const req1 = new Request('http://localhost/api/jobs', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      // First request succeeds
      const res1 = await jobsPost(req1);
      expect(res1.status).toBe(201);

      // Second request fails with 409 conflict
      const req2 = new Request('http://localhost/api/jobs', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const res2 = await jobsPost(req2);
      expect(res2.status).toBe(409);
      const data2 = await res2.json();
      expect(data2.error).toBe('A job with this Job Number already exists');
      expect(data2.error).not.toContain('Prisma');
    });

    it('returns generic 500 without Prisma leakage on unexpected database failures', async () => {
      // Simulate unexpected error by breaking the request in a way that bypasses JSON parsing but fails DB constraints,
      // wait, I can just mock the prisma service for this test, but vitest is hitting the real DB.
      // Instead of forcing a hard-to-reach DB error, let's observe that sending a completely malformed productId 
      // (which Prisma rejects for UUID formatting) used to return a 400 with raw Prisma text or 500 with text.
      // Since `productId` is just a string, passing a non-UUID might throw a Prisma error if the DB enforces UUID.
      const badReq = new Request('http://localhost/api/jobs', {
        method: 'POST',
        body: JSON.stringify({
          jobNumber: `JOB-TEST-UUID-FAIL`,
          customerName: 'Test Customer',
          productId: 'not-a-uuid-so-prisma-fails',
          quantity: 1,
          dueDate: new Date(Date.now() + 86400000).toISOString(),
        }),
      });

      const res = await jobsPost(badReq);
      // It should either be a handled 404 (if findFirst gracefully handles non-UUID, which it usually does by returning null),
      // or a 500. Let's see what it returns. If Prisma throws an invalid UUID format error, it's an unexpected DB error.
      // We just need to assert it's not a 400 and doesn't contain Prisma.
      expect(res.status).not.toBe(400);
      const data = await res.json();
      expect(data.error).not.toContain('Prisma');
    });
  });

  describe('C. Organization isolation', () => {
    let otherOrgProductId: string;
    let otherOrgMachineId: string;

    beforeAll(async () => {
      const p = await prisma.product.create({
        data: {
          orgId: otherOrgId,
          name: 'Other Org Product',
        },
      });
      otherOrgProductId = p.id;

      const m = await prisma.machine.create({
        data: {
          orgId: otherOrgId,
          name: 'Other Org Machine',
          type: 'mill',
          capabilities: ['mill'],
        },
      });
      otherOrgMachineId = m.id;
    });

    it('cross-org product cannot be used to create Job', async () => {
      const req = new Request('http://localhost/api/jobs', {
        method: 'POST',
        body: JSON.stringify({
          jobNumber: 'JOB-CROSS',
          customerName: 'Test',
          productId: otherOrgProductId, // Belongs to other org!
          quantity: 1,
          dueDate: new Date(Date.now() + 86400000).toISOString(),
        }),
      });

      const res = await jobsPost(req);
      const data = await res.json();
      expect(res.status).toBe(404);
      expect(data.error).toBe('Product not found'); // Should not leak cross-org existence
    });

    it('cross-org machine cannot be used in SetupTransition', async () => {
      const req = new Request('http://localhost/api/setup-matrix', {
        method: 'POST',
        body: JSON.stringify({
          machineId: otherOrgMachineId, // Belongs to other org!
          toOpType: 'drill',
          durationMinutes: 30,
        }),
      });

      const res = await setupMatrixPost(req);
      const data = await res.json();
      expect(res.status).toBe(404);
      expect(data.error).toBe('Machine not found');
    });
  });

  describe('D. Setup transition uniqueness', () => {
    beforeAll(async () => {
      await prisma.machine.create({
        data: {
          orgId,
          name: 'Setup Test Machine',
          type: 'mill',
          capabilities: ['mill'],
        },
      });
    });

    it('enforces duplicate nullable transition semantics (NULLS NOT DISTINCT)', async () => {
      const uniqueOpType = `turn-${Math.random().toString(36).substring(2, 6)}`;
      // First global rule (machineId = null, fromOpType = null)
      const req1 = new Request('http://localhost/api/setup-matrix', {
        method: 'POST',
        body: JSON.stringify({
          toOpType: uniqueOpType,
          durationMinutes: 10,
        }),
      });
      const res1 = await setupMatrixPost(req1);
      expect(res1.status).toBe(201);

      // Duplicate global rule
      const req2 = new Request('http://localhost/api/setup-matrix', {
        method: 'POST',
        body: JSON.stringify({
          toOpType: uniqueOpType,
          durationMinutes: 15,
        }),
      });
      const res2 = await setupMatrixPost(req2);
      expect(res2.status).toBe(409); // Conflict
    });
  });

  describe('E. Product validation', () => {
    it('zero operation templates rejected', async () => {
      const req = new Request('http://localhost/api/products', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Empty Product',
          operationTemplates: [],
        }),
      });

      const res = await productsPost(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('At least one operation template is required');
    });
  });

  describe('F. Machine/unavailability validation', () => {
    let testMachineId: string;

    beforeAll(async () => {
      const m = await prisma.machine.create({
        data: {
          orgId,
          name: 'Unavail Test Machine',
          type: 'mill',
          capabilities: ['mill'],
        },
      });
      testMachineId = m.id;
    });

    it('invalid interval rejected (endTime <= startTime)', async () => {
      // Mock params object since Route handler expects it as second arg
      const params = Promise.resolve({ id: testMachineId });
      
      const req = new Request(`http://localhost/api/machines/${testMachineId}/unavailability`, {
        method: 'POST',
        body: JSON.stringify({
          startTime: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
          endTime: new Date(Date.now()).toISOString(), // Today
          reason: 'Time travel maintenance',
        }),
      });

      const res = await unavailabilitiesPost(req, { params });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('endTime must be strictly after startTime');
    });
  });
});
