import type { EnvironmentCheckStatus, EnvironmentLanguageResult } from '../../common/types';

export interface EnvironmentPresentation {
  color: 'grey' | 'info' | 'success' | 'error';
  icon: string;
  labelKey: string;
}

export interface EnvironmentEmptyState {
  icon: string;
  titleKey: string;
}

const presentations: Record<EnvironmentCheckStatus, EnvironmentPresentation> = {
  IDLE: {
    color: 'grey',
    icon: 'mdi-shield-question-outline',
    labelKey: 'examSystem.environmentCheck.status.IDLE'
  },
  RUNNING: {
    color: 'info',
    icon: 'mdi-progress-clock',
    labelKey: 'examSystem.environmentCheck.status.RUNNING'
  },
  PASSED: {
    color: 'success',
    icon: 'mdi-shield-check-outline',
    labelKey: 'examSystem.environmentCheck.status.PASSED'
  },
  FAILED: {
    color: 'error',
    icon: 'mdi-shield-alert-outline',
    labelKey: 'examSystem.environmentCheck.status.FAILED'
  }
};

export function getEnvironmentPresentation(
  status: EnvironmentCheckStatus
): EnvironmentPresentation {
  return presentations[status];
}

export function isEnvironmentDialogPersistent(status: EnvironmentCheckStatus): boolean {
  return status === 'FAILED';
}

export function getEnvironmentEmptyState(status: EnvironmentCheckStatus): EnvironmentEmptyState {
  if (status === 'IDLE') {
    return {
      icon: 'mdi-cloud-download-outline',
      titleKey: 'examSystem.environmentCheck.awaitingConfig'
    };
  }
  if (status === 'RUNNING') {
    return {
      icon: 'mdi-progress-clock',
      titleKey: 'examSystem.environmentCheck.preparingDiagnostics'
    };
  }
  if (status === 'FAILED') {
    return {
      icon: 'mdi-alert-circle-outline',
      titleKey: 'examSystem.environmentCheck.noDiagnosticResults'
    };
  }
  return {
    icon: 'mdi-code-braces',
    titleKey: 'examSystem.environmentCheck.noLanguages'
  };
}

export function summarizeEnvironmentFailures(results: EnvironmentLanguageResult[]): string[] {
  return results.filter((result) => result.status === 'failed').map((result) => result.language);
}
