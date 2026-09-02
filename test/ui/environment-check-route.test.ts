import { describe, expect, it } from 'vitest';
import { getEnvironmentNavigationDecision } from '../../src/renderer/router/environment-check.guard';

describe('environment login guard', () => {
  for (const status of ['IDLE', 'RUNNING', 'FAILED'] as const) {
    it(`blocks login while status is ${status}`, () => {
      expect(
        getEnvironmentNavigationDecision({
          targetName: 'login',
          status,
          examStatus: 'NOT_STARTED',
          isVerified: false
        })
      ).toEqual({ name: 'settings' });
    });
  }

  it('allows login after the check passes', () => {
    expect(
      getEnvironmentNavigationDecision({
        targetName: 'login',
        status: 'PASSED',
        examStatus: 'NOT_STARTED',
        isVerified: false
      })
    ).toBe(true);
  });

  it('does not eject an already verified active examinee', () => {
    expect(
      getEnvironmentNavigationDecision({
        targetName: 'exam',
        status: 'FAILED',
        examStatus: 'IN_PROGRESS',
        isVerified: true
      })
    ).toBe(true);
  });
});
