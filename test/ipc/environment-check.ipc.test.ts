import { EventEmitter } from 'events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcMain } from 'electron';
import { registerEnvironmentCheckIpc } from '../../src/main/ipc/environment-check.ipc';
import { ramStore } from '../../src/main/services/ramStore.service';
import { environmentCheckService } from '../../src/main/services/environment-check.service';
import { getMainWindow } from '../../src/main/system/windowManager';

vi.mock('electron', () => {
  const handlers: Record<string, (...args: unknown[]) => unknown> = {};
  return {
    ipcMain: {
      handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
        handlers[channel] = handler;
      }),
      _invokeHandler: (channel: string, event: unknown, ...args: unknown[]) =>
        handlers[channel](event, ...args)
    }
  };
});

vi.mock('../../src/main/services/ramStore.service', () => ({
  ramStore: Object.assign(new EventEmitter(), { environmentCheckReport: { status: 'IDLE' } })
}));
vi.mock('../../src/main/services/environment-check.service', () => ({
  environmentCheckService: { getReport: vi.fn(), retry: vi.fn() }
}));
vi.mock('../../src/main/system/windowManager', () => ({ getMainWindow: vi.fn() }));

describe('environment-check IPC', () => {
  const invoke = (channel: string) => (ipcMain as any)._invokeHandler(channel, {});
  const report = { status: 'PASSED', requiredLanguages: [] } as any;
  const send = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    ramStore.removeAllListeners();
    vi.mocked(getMainWindow).mockReturnValue({
      isDestroyed: () => false,
      webContents: { send }
    } as any);
    vi.mocked(environmentCheckService.getReport).mockReturnValue(report);
    vi.mocked(environmentCheckService.retry).mockResolvedValue(report);
    registerEnvironmentCheckIpc();
  });

  it('returns the latest trusted report and retries through the service', async () => {
    expect(await invoke('environment-check:get-report')).toEqual({ success: true, data: report });
    expect(await invoke('environment-check:retry')).toEqual({ success: true, data: report });
  });

  it('forwards report updates to the renderer', () => {
    ramStore.emit('environmentCheckReport', report);
    expect(send).toHaveBeenCalledWith('environment-check:updated', report);
  });

  it('returns a typed retry error', async () => {
    vi.mocked(environmentCheckService.retry).mockRejectedValueOnce(new Error('missing config'));
    expect(await invoke('environment-check:retry')).toMatchObject({
      success: false,
      error: { code: 'ENVIRONMENT_CHECK_FAILED' }
    });
  });
});
