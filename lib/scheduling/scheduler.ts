import {
  SchedulingContext,
  ProposedAssignment,
  MachineUnavailability,
  CandidateEvaluation
} from './types';
import { getSetupTime } from './setup';

export function generateSchedule(context: SchedulingContext): ProposedAssignment[] {
  const assignments: ProposedAssignment[] = [];
  
  // Track state for machines and jobs
  const machineStates = new Map<string, { lastEndTime: Date; lastOpType: string | null }>();
  for (const m of context.machines) {
    machineStates.set(m.id, { lastEndTime: context.startTime, lastOpType: null });
  }

  const jobAvailability = new Map<string, Date>();
  for (const j of context.jobs) {
    jobAvailability.set(j.id, context.startTime);
  }

  // SA-EDD: Sort jobs by due date (EDD), tie-break by job number for determinism
  const sortedJobs = [...context.jobs].sort((a, b) => {
    const diff = a.dueDate.getTime() - b.dueDate.getTime();
    if (diff !== 0) return diff;
    return a.jobNumber.localeCompare(b.jobNumber);
  });

  // Pre-sort unavailabilities for the feasibility checker
  const unavailabilitiesByMachine = new Map<string, MachineUnavailability[]>();
  for (const m of context.machines) {
    unavailabilitiesByMachine.set(m.id, []);
  }
  for (const u of context.unavailabilities) {
    const list = unavailabilitiesByMachine.get(u.machineId);
    if (list) list.push(u);
  }
  for (const list of unavailabilitiesByMachine.values()) {
    list.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  }

  function findEarliestFeasibleBlock(
    machineId: string,
    minStart: Date,
    requiredDurationMs: number
  ): Date {
    const list = unavailabilitiesByMachine.get(machineId) || [];
    let candidateStart = minStart.getTime();

    for (const u of list) {
      const candidateEnd = candidateStart + requiredDurationMs;
      const uStart = u.startTime.getTime();
      const uEnd = u.endTime ? u.endTime.getTime() : Infinity;

      // Intersection check
      if (candidateStart < uEnd && candidateEnd > uStart) {
        candidateStart = uEnd;
        if (candidateStart === Infinity) return new Date(Infinity);
      }
    }

    return new Date(candidateStart);
  }

  for (const job of sortedJobs) {
    const sortedOps = [...job.operations].sort((a, b) => a.sequenceNumber - b.sequenceNumber);

    for (const op of sortedOps) {
      const jobAvail = jobAvailability.get(job.id)!;
      
      let bestMachineId: string | null = null;
      let bestStart: Date | null = null;
      let bestEnd: Date | null = null;
      let bestSetupTimeMs = 0;
      const candidateEvaluations: CandidateEvaluation[] = [];

      // Ensure deterministic order for tie-breaking
      const eligibleMachines = [...op.eligibleMachineIds].sort((a, b) => a.localeCompare(b));

      for (const machineId of eligibleMachines) {
        if (!machineStates.has(machineId)) {
          candidateEvaluations.push({
            machineId,
            setupMinutes: 0,
            earliestStart: null,
            completionTime: null,
            feasible: false,
            reason: 'Machine is not available in the scheduling context.',
          });
          continue;
        }
        
        const mState = machineStates.get(machineId)!;
        
        const setupMinutes = getSetupTime(machineId, mState.lastOpType, op.operationType, context.setups);
        const setupTimeMs = setupMinutes * 60000;
        const processingTimeMs = op.estimatedDurationMinutes * 60000;
        const totalDurationMs = setupTimeMs + processingTimeMs;

        const minStart = jobAvail.getTime() > mState.lastEndTime.getTime() ? jobAvail : mState.lastEndTime;
        
        const candidateStart = findEarliestFeasibleBlock(machineId, minStart, totalDurationMs);
        if (candidateStart.getTime() === Infinity) {
          candidateEvaluations.push({
            machineId,
            setupMinutes,
            earliestStart: null,
            completionTime: null,
            feasible: false,
            reason: 'Machine has an open-ended unavailability window.',
          });
          continue;
        }

        const candidateEnd = new Date(candidateStart.getTime() + totalDurationMs);
        candidateEvaluations.push({
          machineId,
          setupMinutes,
          earliestStart: candidateStart,
          completionTime: candidateEnd,
          feasible: true,
        });

        if (!bestEnd || candidateEnd.getTime() < bestEnd.getTime()) {
          bestEnd = candidateEnd;
          bestStart = candidateStart;
          bestMachineId = machineId;
          bestSetupTimeMs = setupTimeMs;
        }
      }

      if (!bestMachineId || !bestStart || !bestEnd) {
        throw new Error(`Cannot schedule operation ${op.sequenceNumber} for job ${job.jobNumber}. No feasible machine block found.`);
      }

      // Record assignment
      assignments.push({
        jobOperationId: op.id,
        jobId: job.id,
        sequenceNumber: op.sequenceNumber,
        machineId: bestMachineId,
        setupStart: bestStart,
        processingStart: new Date(bestStart.getTime() + bestSetupTimeMs),
        processingEnd: bestEnd,
        operationType: op.operationType,
        candidateEvaluations,
      });

      // Update state
      machineStates.set(bestMachineId, {
        lastEndTime: bestEnd,
        lastOpType: op.operationType
      });
      jobAvailability.set(job.id, bestEnd);
    }
  }

  return assignments;
}
