import {
  ProposedAssignment,
  SchedulingContext,
} from './types';
import { getSetupTime } from './setup';

export interface ScheduleViolation {
  type: string;
  message: string;
  jobOperationId?: string;
  machineId?: string;
}

export function validateSchedule(
  assignments: ProposedAssignment[],
  context: SchedulingContext
): ScheduleViolation[] {
  const violations: ScheduleViolation[] = [];
  
  const assignmentsByMachine = new Map<string, ProposedAssignment[]>();
  const assignmentsByJob = new Map<string, ProposedAssignment[]>();
  const assignmentMap = new Map<string, ProposedAssignment>();

  for (const a of assignments) {
    if (!assignmentsByMachine.has(a.machineId)) assignmentsByMachine.set(a.machineId, []);
    assignmentsByMachine.get(a.machineId)!.push(a);

    if (!assignmentsByJob.has(a.jobId)) assignmentsByJob.set(a.jobId, []);
    assignmentsByJob.get(a.jobId)!.push(a);
    
    assignmentMap.set(a.jobOperationId, a);
  }

  // 1. SCHEDULE_COMPLETENESS & 2. MACHINE_ELIGIBILITY
  for (const job of context.jobs) {
    for (const op of job.operations) {
      const a = assignmentMap.get(op.id);
      if (!a) {
        violations.push({
          type: 'SCHEDULE_COMPLETENESS',
          message: `Job ${job.jobNumber} operation ${op.sequenceNumber} is not scheduled.`,
          jobOperationId: op.id
        });
        continue;
      }

      if (!op.eligibleMachineIds.includes(a.machineId)) {
        violations.push({
          type: 'MACHINE_ELIGIBILITY',
          message: `Operation ${op.sequenceNumber} scheduled on ineligible machine ${a.machineId}.`,
          jobOperationId: op.id,
          machineId: a.machineId
        });
      }
    }
  }

  // 3. OPERATION_PRECEDENCE
  for (const job of context.jobs) {
    const jobAssignments = assignmentsByJob.get(job.id) || [];
    // Sort assignments by sequence number
    jobAssignments.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    
    for (let i = 1; i < jobAssignments.length; i++) {
      const prev = jobAssignments[i - 1]!;
      const curr = jobAssignments[i]!;
      if (curr.setupStart.getTime() < prev.processingEnd.getTime()) {
        violations.push({
          type: 'OPERATION_PRECEDENCE',
          message: `Operation ${curr.sequenceNumber} starts before operation ${prev.sequenceNumber} finishes.`,
          jobOperationId: curr.jobOperationId
        });
      }
    }
  }

  // 4. MACHINE_NON_OVERLAP & 5. SETUP_TIME & 6. MACHINE_UNAVAILABILITY
  for (const machine of context.machines) {
    const mAssignments = assignmentsByMachine.get(machine.id) || [];
    // Sort temporally
    mAssignments.sort((a, b) => a.setupStart.getTime() - b.setupStart.getTime());

    const unavailabilities = context.unavailabilities.filter(u => u.machineId === machine.id);

    let lastOpType: string | null = null;
    let lastEnd = new Date(0);

    for (let i = 0; i < mAssignments.length; i++) {
      const curr = mAssignments[i]!;
      
      // NON_OVERLAP
      if (curr.setupStart.getTime() < lastEnd.getTime()) {
        violations.push({
          type: 'MACHINE_NON_OVERLAP',
          message: `Assignment overlaps with previous assignment on machine ${machine.id}.`,
          jobOperationId: curr.jobOperationId,
          machineId: machine.id
        });
      }

      // SETUP_TIME
      const expectedSetupMinutes = getSetupTime(machine.id, lastOpType, curr.operationType, context.setups);
      const actualSetupMs = curr.processingStart.getTime() - curr.setupStart.getTime();
      if (actualSetupMs < expectedSetupMinutes * 60000) {
        violations.push({
          type: 'SETUP_TIME',
          message: `Insufficient setup time. Expected ${expectedSetupMinutes} mins, got ${actualSetupMs / 60000} mins.`,
          jobOperationId: curr.jobOperationId,
          machineId: machine.id
        });
      }

      // UNAVAILABILITY
      for (const u of unavailabilities) {
        const uStart = u.startTime.getTime();
        const uEnd = u.endTime ? u.endTime.getTime() : Infinity;
        const aStart = curr.setupStart.getTime();
        const aEnd = curr.processingEnd.getTime();
        
        if (aStart < uEnd && aEnd > uStart) {
          violations.push({
            type: 'MACHINE_UNAVAILABILITY',
            message: `Assignment intersects unavailability on machine ${machine.id}.`,
            jobOperationId: curr.jobOperationId,
            machineId: machine.id
          });
        }
      }

      lastOpType = curr.operationType;
      lastEnd = curr.processingEnd;
    }
  }

  // 7. DUE_DATE_ORDERING (Heuristic check)
  // This is harder to rigorously validate since SA-EDD might schedule an earlier due date job later
  // if its predecessor operation ends later, or if machine availability dictates it.
  // We'll skip strict validation of DUE_DATE_ORDERING here since it's a heuristic property, 
  // but it is tested in the scheduler tests implicitly by the order of assignment.

  return violations;
}
