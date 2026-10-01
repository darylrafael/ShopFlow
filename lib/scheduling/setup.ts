import { SetupTransitionRule } from './types';

export function getSetupTime(
  machineId: string,
  fromOpType: string | null,
  toOpType: string,
  rules: SetupTransitionRule[]
): number {
  if (fromOpType === toOpType) {
    // If the operation type hasn't changed, setup is typically 0
    // unless explicitly defined otherwise. We'll check explicit rules first.
  }

  // Filter rules that match the target operation type
  const applicableRules = rules.filter((r) => r.toOpType === toOpType);

  // Precedence 1: Exact machine, exact fromOpType
  const exactMatch = applicableRules.find(
    (r) => r.machineId === machineId && r.fromOpType === fromOpType
  );
  if (exactMatch) return exactMatch.durationMinutes;

  // Precedence 2: Exact machine, null fromOpType (global for this machine)
  const machineGlobalMatch = applicableRules.find(
    (r) => r.machineId === machineId && r.fromOpType === null
  );
  if (machineGlobalMatch) return machineGlobalMatch.durationMinutes;

  // Precedence 3: Null machine, exact fromOpType (global rule for this transition)
  const orgTransitionMatch = applicableRules.find(
    (r) => r.machineId === null && r.fromOpType === fromOpType
  );
  if (orgTransitionMatch) return orgTransitionMatch.durationMinutes;

  // Precedence 4: Null machine, null fromOpType (global default for starting this op type)
  const orgGlobalMatch = applicableRules.find(
    (r) => r.machineId === null && r.fromOpType === null
  );
  if (orgGlobalMatch) return orgGlobalMatch.durationMinutes;

  // Default: no setup time
  return 0;
}
