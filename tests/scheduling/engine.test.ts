import { describe, it, expect } from 'vitest';
import { generateSchedule } from '../../lib/scheduling/scheduler';
import { validateSchedule } from '../../lib/scheduling/validation';
import { SchedulingContext, SchedulableJob, SchedulableMachine, SetupTransitionRule, MachineUnavailability } from '../../lib/scheduling/types';

describe('Phase 1A SA-EDD Scheduling Engine', () => {
  const startTime = new Date('2026-09-01T08:00:00.000Z');

  it('generates a valid schedule respecting precedence and EDD', () => {
    const machines: SchedulableMachine[] = [{ id: 'm1', name: 'Mill' }];
    
    const jobs: SchedulableJob[] = [
      {
        id: 'job-1',
        jobNumber: 'J1',
        dueDate: new Date('2026-09-02T08:00:00.000Z'),
        priority: 'normal',
        operations: [
          { id: 'op-1-1', jobId: 'job-1', sequenceNumber: 10, operationType: 'mill', eligibleMachineIds: ['m1'], estimatedDurationMinutes: 60 }
        ]
      },
      {
        id: 'job-2', // Due EARLIER than job-1, should be scheduled first!
        jobNumber: 'J2',
        dueDate: new Date('2026-09-01T12:00:00.000Z'),
        priority: 'normal',
        operations: [
          { id: 'op-2-1', jobId: 'job-2', sequenceNumber: 10, operationType: 'mill', eligibleMachineIds: ['m1'], estimatedDurationMinutes: 60 },
          { id: 'op-2-2', jobId: 'job-2', sequenceNumber: 20, operationType: 'mill', eligibleMachineIds: ['m1'], estimatedDurationMinutes: 60 }
        ]
      }
    ];

    const context: SchedulingContext = {
      jobs,
      machines,
      unavailabilities: [],
      setups: [],
      startTime
    };

    const schedule = generateSchedule(context);
    
    // Validate the schedule
    const violations = validateSchedule(schedule, context);
    expect(violations).toHaveLength(0);

    // Job 2 should be scheduled first due to EDD
    const j2Op1 = schedule.find(s => s.jobOperationId === 'op-2-1')!;
    expect(j2Op1.setupStart.getTime()).toBe(startTime.getTime());
    
    // Precedence: op-2-2 must start after op-2-1
    const j2Op2 = schedule.find(s => s.jobOperationId === 'op-2-2')!;
    expect(j2Op2.setupStart.getTime()).toBe(j2Op1.processingEnd.getTime());

    // Job 1 should be scheduled last
    const j1Op1 = schedule.find(s => s.jobOperationId === 'op-1-1')!;
    expect(j1Op1.setupStart.getTime()).toBe(j2Op2.processingEnd.getTime());
  });

  it('respects machine unavailability and setup times', () => {
    const machines: SchedulableMachine[] = [{ id: 'm1', name: 'Mill' }];
    
    const unavailabilities: MachineUnavailability[] = [
      { id: 'u1', machineId: 'm1', startTime: new Date('2026-09-01T08:30:00.000Z'), endTime: new Date('2026-09-01T09:30:00.000Z') }
    ];

    const setups: SetupTransitionRule[] = [
      { machineId: null, fromOpType: 'mill', toOpType: 'drill', durationMinutes: 30 }
    ];

    const jobs: SchedulableJob[] = [
      {
        id: 'job-1',
        jobNumber: 'J1',
        dueDate: new Date('2026-09-02T08:00:00.000Z'),
        priority: 'normal',
        operations: [
          { id: 'op-1-1', jobId: 'job-1', sequenceNumber: 10, operationType: 'mill', eligibleMachineIds: ['m1'], estimatedDurationMinutes: 60 },
          { id: 'op-1-2', jobId: 'job-1', sequenceNumber: 20, operationType: 'drill', eligibleMachineIds: ['m1'], estimatedDurationMinutes: 60 }
        ]
      }
    ];

    const context: SchedulingContext = { jobs, machines, unavailabilities, setups, startTime };
    const schedule = generateSchedule(context);
    const violations = validateSchedule(schedule, context);
    expect(violations).toHaveLength(0);

    const op1 = schedule.find(s => s.jobOperationId === 'op-1-1')!;
    // Required duration: 60 mins. If starts at 08:00, ends at 09:00. But unavail [08:30-09:30] intersects!
    // So it should advance to 09:30.
    expect(op1.setupStart.getTime()).toBe(new Date('2026-09-01T09:30:00.000Z').getTime());
    expect(op1.processingEnd.getTime()).toBe(new Date('2026-09-01T10:30:00.000Z').getTime());

    const op2 = schedule.find(s => s.jobOperationId === 'op-1-2')!;
    // Setup time 30 mins because mill -> drill
    expect(op2.setupStart.getTime()).toBe(op1.processingEnd.getTime());
    expect(op2.processingStart.getTime()).toBe(op2.setupStart.getTime() + 30 * 60000);
    expect(op2.processingEnd.getTime()).toBe(op2.processingStart.getTime() + 60 * 60000);
  });
});
