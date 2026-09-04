import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ramStore } from '../../src/main/services/ramStore.service';

describe('environment report RAM lifecycle', () => {
  beforeEach(() => ramStore.clear());

  it('starts idle, emits updates, and resets without persistence', () => {
    expect(ramStore.environmentCheckReport.status).toBe('IDLE');
    const listener = vi.fn();
    ramStore.on('environmentCheckReport', listener);
    const report = {
      ...ramStore.environmentCheckReport,
      status: 'RUNNING' as const,
      configFingerprint: 'C',
      requiredLanguages: ['C' as const],
      startedAt: new Date().toISOString(),
      message: 'running'
    };

    ramStore.environmentCheckReport = report;
    expect(listener).toHaveBeenCalledWith(report);
    ramStore.clear();
    expect(ramStore.environmentCheckReport.status).toBe('IDLE');
    ramStore.off('environmentCheckReport', listener);
  });
});
