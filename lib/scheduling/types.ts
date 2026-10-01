export interface SchedulableJob {
  id: string;
  jobNumber: string;
  dueDate: Date;
  priority: string;
  operations: SchedulableOperation[];
}

export interface SchedulableOperation {
  id: string;
  jobId: string;
  sequenceNumber: number;
  operationType: string;
  eligibleMachineIds: string[];
  estimatedDurationMinutes: number;
}

export interface SchedulableMachine {
  id: string;
  name: string;
}

export interface MachineUnavailability {
  id: string;
  machineId: string;
  startTime: Date;
  endTime: Date | null;
}

export interface SetupTransitionRule {
  machineId: string | null;
  fromOpType: string | null;
  toOpType: string;
  durationMinutes: number;
}

export interface ProposedAssignment {
  jobOperationId: string;
  jobId: string;
  sequenceNumber: number;
  machineId: string;
  setupStart: Date;
  processingStart: Date;
  processingEnd: Date;
  operationType: string; // tracked for setup calculation of following operations
  candidateEvaluations: CandidateEvaluation[];
}

export interface CandidateEvaluation {
  machineId: string;
  setupMinutes: number;
  earliestStart: Date | null;
  completionTime: Date | null;
  feasible: boolean;
  reason?: string;
}

export interface SchedulingContext {
  jobs: SchedulableJob[];
  machines: SchedulableMachine[];
  unavailabilities: MachineUnavailability[];
  setups: SetupTransitionRule[];
  startTime: Date;
}
