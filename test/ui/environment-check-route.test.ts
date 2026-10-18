import { describe, expect, it } from 'vitest';
import { getEnvironmentNavigationDecision } from '../../src/renderer/router/environment-check.guard';

describe('environment login guard', () => {
  it('allows login while waiting for the authenticated config', () => {
    expect(
      getEnvironmentNavigationDecision({
        targetName: 'login',
        status: 'IDLE',
        examStatus: 'SETUP_FINISHED',
        isVerified: false
      })
    ).toBe(true);
  });

  it('allows login while the environment check is running', () => {
    expect(
      getEnvironmentNavigationDecision({
        targetName: 'login',
        status: 'RUNNING',
        examStatus: 'SETUP_FINISHED',
        isVerified: false
      })
    ).toBe(true);
  });

  it('allows an assistant to continue after reviewing a failed check', () => {
    expect(
      getEnvironmentNavigationDecision({
        targetName: 'login',
        status: 'FAILED',
        examStatus: 'SETUP_FINISHED',
        isVerified: false
      })
    ).toBe(true);
  });

  it('allows login after the check passes', () => {
    expect(
      getEnvironmentNavigationDecision({
        targetName: 'login',
        status: 'PASSED',
        examStatus: 'SETUP_FINISHED',
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
