import type { EnvironmentCheckStatus, ExamState } from '../../common/types';

export interface EnvironmentNavigationContext {
  targetName: string | symbol | null | undefined;
  status: EnvironmentCheckStatus;
  examStatus: ExamState;
  isVerified: boolean;
}

export function getEnvironmentNavigationDecision(
  context: EnvironmentNavigationContext
): true | { name: 'settings' } {
  // Diagnostics are advisory; phase and identity guards own admission.
  void context;
  return true;
}
