import prisma from '../prisma';
import { generateSchedule } from '../scheduling/scheduler';
import { validateSchedule } from '../scheduling/validation';
import {
  SchedulingContext,
  SchedulableJob,
  SchedulableMachine,
  MachineUnavailability,
  SetupTransitionRule
} from '../scheduling/types';

const PRIORITY_WEIGHTS: Record<string, number> = {
  low: 1,
  normal: 2,
  high: 3,
  urgent: 4,
};

export async function generateAndPersistSchedule(orgId: string, triggerReason: string) {
  return prisma.$transaction(async (tx) => {
    // 1. Fetch current active jobs and their operations
    const jobs = await tx.job.findMany({
      where: {
        orgId,
        status: { in: ['released', 'in_progress'] },
      },
      include: {
        jobOperations: {
          where: { status: 'pending' },
          orderBy: { sequenceNumber: 'asc' },
        },
      },
    });

    const schedulableJobs: SchedulableJob[] = jobs
      .filter((j) => j.jobOperations.length > 0)
      .map((j) => ({
        id: j.id,
        jobNumber: j.jobNumber,
        dueDate: j.dueDate,
        priority: j.priority,
        operations: j.jobOperations.map((op) => ({
          id: op.id,
          jobId: j.id,
          sequenceNumber: op.sequenceNumber,
          operationType: op.operationType,
          eligibleMachineIds: op.eligibleMachineIds,
          estimatedDurationMinutes: op.estimatedDurationMinutes,
        })),
      }));

    if (schedulableJobs.length === 0) {
      throw new Error('No schedulable jobs found.');
    }

    // 2. Fetch machines
    const machines = await tx.machine.findMany({
      where: { orgId },
    });
    const schedulableMachines: SchedulableMachine[] = machines.map((m) => ({
      id: m.id,
      name: m.name,
    }));

    // 3. Fetch unavailabilities
    const machineIds = machines.map((m) => m.id);
    const unavailabilities = await tx.machineUnavailability.findMany({
      where: { machineId: { in: machineIds } },
    });
    const schedulableUnavailabilities: MachineUnavailability[] = unavailabilities.map((u) => ({
      id: u.id,
      machineId: u.machineId,
      startTime: u.startTime,
      endTime: u.endTime,
    }));

    // 4. Fetch setup transitions
    const setups = await tx.setupTransition.findMany({
      where: { orgId },
    });
    const schedulableSetups: SetupTransitionRule[] = setups.map((s) => ({
      machineId: s.machineId,
      fromOpType: s.fromOpType,
      toOpType: s.toOpType,
      durationMinutes: s.durationMinutes,
    }));

    const startTime = new Date(); // Start scheduling from now

    const context: SchedulingContext = {
      jobs: schedulableJobs,
      machines: schedulableMachines,
      unavailabilities: schedulableUnavailabilities,
      setups: schedulableSetups,
      startTime,
    };

    // 5. Generate schedule
    const assignments = generateSchedule(context);

    // 6. Validate
    const violations = validateSchedule(assignments, context);
    if (violations.length > 0) {
      console.error('Schedule validation failed:', violations);
      throw new Error(`Schedule validation failed with ${violations.length} violations.`);
    }

    // 7. Compute metrics
    let totalSetupMinutes = 0;
    let minStart = new Date('2999-12-31').getTime();
    let maxEnd = new Date(0).getTime();
    
    const jobEnds = new Map<string, number>();

    for (const a of assignments) {
      totalSetupMinutes += (a.processingStart.getTime() - a.setupStart.getTime()) / 60000;
      if (a.setupStart.getTime() < minStart) minStart = a.setupStart.getTime();
      if (a.processingEnd.getTime() > maxEnd) maxEnd = a.processingEnd.getTime();
      
      const currentJobEnd = jobEnds.get(a.jobId) || 0;
      if (a.processingEnd.getTime() > currentJobEnd) {
        jobEnds.set(a.jobId, a.processingEnd.getTime());
      }
    }

    let numLateJobs = 0;
    let weightedTardiness = 0;
    for (const j of schedulableJobs) {
      const end = jobEnds.get(j.id);
      if (end && end > j.dueDate.getTime()) {
        numLateJobs++;
        const tardinessMinutes = (end - j.dueDate.getTime()) / 60000;
        weightedTardiness += tardinessMinutes * (PRIORITY_WEIGHTS[j.priority] ?? 1);
      }
    }

    const makespanMinutes = maxEnd > minStart ? Math.ceil((maxEnd - minStart) / 60000) : 0;

    const machineUtilization: Record<string, number> = {};
    for (const machine of machines) {
      const machineAssignments = assignments.filter((a) => a.machineId === machine.id);
      const busyMinutes = machineAssignments.reduce(
        (total, assignment) => total + (assignment.processingEnd.getTime() - assignment.setupStart.getTime()) / 60000,
        0,
      );
      machineUtilization[machine.id] = makespanMinutes > 0
        ? Math.round((busyMinutes / makespanMinutes) * 10000) / 100
        : 0;
    }

    // 8. Handle existing active schedule
    const activeSchedule = await tx.schedule.findFirst({
      where: { orgId, status: 'active' },
    });

    if (activeSchedule) {
      await tx.schedule.update({
        where: { id: activeSchedule.id },
        data: { status: 'superseded' },
      });
    }

    const nextVersion = activeSchedule ? activeSchedule.version + 1 : 1;

    // 9. Persist new schedule
    const schedule = await tx.schedule.create({
      data: {
        orgId,
        version: nextVersion,
        status: 'active',
        triggerReason,
        algorithm: 'SA-EDD',
        weightedTardiness: Math.round(weightedTardiness * 100) / 100,
        totalSetupMinutes: Math.ceil(totalSetupMinutes),
        makespanMinutes,
        numLateJobs,
        machineUtilization,
        previousVersionId: activeSchedule ? activeSchedule.id : null,
      },
    });

    // 10. Persist assignments
    if (assignments.length > 0) {
      await tx.scheduleAssignment.createMany({
        data: assignments.map((a) => ({
          scheduleId: schedule.id,
          jobOperationId: a.jobOperationId,
          machineId: a.machineId,
          setupStart: a.setupStart,
          processingStart: a.processingStart,
          processingEnd: a.processingEnd,
          candidateAnalysis: a.candidateEvaluations.map((candidate) => ({
            machineId: candidate.machineId,
            setupMinutes: candidate.setupMinutes,
            earliestStart: candidate.earliestStart?.toISOString() ?? null,
            completionTime: candidate.completionTime?.toISOString() ?? null,
            feasible: candidate.feasible,
            reason: candidate.reason ?? null,
          })),
        })),
      });
    }

    return schedule;
  });
}

export async function getCurrentSchedule(
  orgId: string,
  range?: { from?: Date; to?: Date },
) {
  const schedule = await prisma.schedule.findFirst({
    where: { orgId, status: 'active' },
    include: {
      scheduleAssignments: {
        where: {
          ...(range?.from || range?.to
            ? {
                ...(range.from ? { processingEnd: { gt: range.from } } : {}),
                ...(range.to ? { setupStart: { lt: range.to } } : {}),
              }
            : {}),
        },
        include: {
          machine: true,
          jobOperation: {
            include: { job: { include: { product: true } } },
          },
        },
        orderBy: { setupStart: 'asc' },
      },
    },
  });

  if (!schedule) return null;

  const organizationMachines = await prisma.machine.findMany({
    where: { orgId },
    select: { id: true, name: true },
  });
  const machineNames = new Map(organizationMachines.map((machine) => [machine.id, machine.name]));

  const assignments = schedule.scheduleAssignments.map((assignment) => ({
    id: assignment.id,
    jobOperationId: assignment.jobOperationId,
    jobId: assignment.jobOperation.jobId,
    jobNumber: assignment.jobOperation.job.jobNumber,
    customerName: assignment.jobOperation.job.customerName,
    priority: assignment.jobOperation.job.priority,
    jobStatus: assignment.jobOperation.job.status,
    dueDate: assignment.jobOperation.job.dueDate,
    operationType: assignment.jobOperation.operationType,
    sequenceNumber: assignment.jobOperation.sequenceNumber,
    machineId: assignment.machineId,
    machineName: assignment.machine.name,
    setupStart: assignment.setupStart,
    processingStart: assignment.processingStart,
    processingEnd: assignment.processingEnd,
    eligibleMachineIds: assignment.jobOperation.eligibleMachineIds,
    eligibleMachineNames: Array.from(new Set(
      assignment.jobOperation.eligibleMachineIds.map((machineId) => machineNames.get(machineId) ?? machineId),
    )),
    estimatedDurationMinutes: assignment.jobOperation.estimatedDurationMinutes,
    setupMinutes: Math.round((assignment.processingStart.getTime() - assignment.setupStart.getTime()) / 60000),
    processingMinutes: Math.round((assignment.processingEnd.getTime() - assignment.processingStart.getTime()) / 60000),
    candidateAnalysis: (() => {
      type CandidateDisplay = Record<string, unknown> & { machineId: string; machineName: string; completionTime?: unknown };
      const candidates: CandidateDisplay[] = Array.isArray(assignment.candidateAnalysis)
        ? assignment.candidateAnalysis.map((candidate) => {
            const item = candidate as Record<string, unknown>;
            const machineId = String(item['machineId'] ?? '');
            return { ...item, machineId, machineName: machineNames.get(machineId) ?? machineId };
          })
        : [];
      const byName = new Map<string, CandidateDisplay>();
      for (const candidate of candidates) {
        const current = byName.get(candidate.machineName);
        const candidateEnd = typeof candidate.completionTime === 'string' ? Date.parse(candidate.completionTime) : Infinity;
        const currentEnd = current && typeof current.completionTime === 'string' ? Date.parse(current.completionTime) : Infinity;
        if (!current || candidateEnd < currentEnd) byName.set(candidate.machineName, candidate);
      }
      return Array.from(byName.values()).sort((a, b) => {
        const aEnd = typeof a.completionTime === 'string' ? Date.parse(a.completionTime) : Infinity;
        const bEnd = typeof b.completionTime === 'string' ? Date.parse(b.completionTime) : Infinity;
        return aEnd - bEnd;
      });
    })(),
  }));

  const enrichedAssignments = assignments.map((assignment) => {
    const predecessor = assignments
      .filter((candidate) => candidate.jobId === assignment.jobId && candidate.sequenceNumber < assignment.sequenceNumber)
      .sort((a, b) => b.sequenceNumber - a.sequenceNumber)[0];
    return {
      ...assignment,
      predecessorOperation: predecessor?.operationType ?? null,
      predecessorCompletedAt: predecessor?.processingEnd ?? null,
    };
  });

  const jobs = Array.from(new Map(enrichedAssignments.map((assignment) => [assignment.jobId, {
    id: assignment.jobId,
    jobNumber: assignment.jobNumber,
    customerName: assignment.customerName,
    priority: assignment.priority,
    status: assignment.jobStatus,
    dueDate: assignment.dueDate,
  }])).values());

  const machines = Array.from(new Map(enrichedAssignments.map((assignment) => [assignment.machineId, {
    id: assignment.machineId,
    name: assignment.machineName,
  }])).values());

  return {
    schedule: {
      id: schedule.id,
      version: schedule.version,
      status: schedule.status,
      triggerReason: schedule.triggerReason,
      algorithm: schedule.algorithm,
      weightedTardiness: schedule.weightedTardiness,
      totalSetupMinutes: schedule.totalSetupMinutes,
      makespanMinutes: schedule.makespanMinutes,
      numLateJobs: schedule.numLateJobs,
      machineUtilization: schedule.machineUtilization,
      createdAt: schedule.createdAt,
    },
    assignments: enrichedAssignments,
    jobs,
    machines,
  };
}
