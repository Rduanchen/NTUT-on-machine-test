import { describe, expect, it } from 'vitest';
import {
  getEnvironmentPresentation,
  isEnvironmentDialogPersistent,
  summarizeEnvironmentFailures
} from '../../src/renderer/components/environment-check.presentation';

describe('environment check presentation', () => {
  it('maps every state to a stable visual identity', () => {
    expect(getEnvironmentPresentation('IDLE')).toMatchObject({
      color: 'grey',
      icon: 'mdi-shield-question-outline'
    });
    expect(getEnvironmentPresentation('RUNNING')).toMatchObject({
      color: 'info',
      icon: 'mdi-progress-clock'
    });
    expect(getEnvironmentPresentation('PASSED')).toMatchObject({
      color: 'success',
      icon: 'mdi-shield-check-outline'
    });
    expect(getEnvironmentPresentation('FAILED')).toMatchObject({
      color: 'error',
      icon: 'mdi-shield-alert-outline'
    });
  });

  it('keeps failed dialogs persistent and summarizes failed languages', () => {
    expect(isEnvironmentDialogPersistent('FAILED')).toBe(true);
    expect(
      summarizeEnvironmentFailures([
        { language: 'C', status: 'failed' },
        { language: 'Java', status: 'passed' }
      ] as any)
    ).toEqual(['C']);
  });
});
