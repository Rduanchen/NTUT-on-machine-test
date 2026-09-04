import { describe, expect, it } from 'vitest';
import { getEnvironmentNavigationDecision } from '../../src/renderer/router/environment-check.guard';

describe('environment login guard', () => {
  it('allows login while waiting for the authenticated config', () => {
    expect(
      getEnvironmentNavigationDecision({
        targetName: 'login',
        status: 'IDLE',
        examStatus: 'NOT_STARTED',
        isVerified: false
      })
    ).toBe(true);
  });

  it('blocks login only while a loaded config is actively being checked', () => {
    expect(
      getEnvironmentNavigationDecision({
        targetName: 'login',
        status: 'RUNNING',
        examStatus: 'NOT_STARTED',
        isVerified: false
      })
    ).toEqual({ name: 'settings' });
  });

  it('allows an assistant to continue after reviewing a failed check', () => {
    expect(
      getEnvironmentNavigationDecision({
        targetName: 'login',
        status: 'FAILED',
        examStatus: 'NOT_STARTED',
        isVerified: false
      })
    ).toBe(true);
  });

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
