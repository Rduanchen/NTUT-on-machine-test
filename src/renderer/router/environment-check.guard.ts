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
  if (context.targetName !== 'login') return true;
  if (context.status === 'PASSED') return true;
  return { name: 'settings' };
}
