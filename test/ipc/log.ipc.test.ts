import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ipcMain } from 'electron';
import { registerLogIpc } from '../../src/main/ipc/log.ipc';
import { logServerEvent } from '../../src/main/services/logger.service';

vi.mock('../../src/main/services/logger.service', () => ({
  logServerEvent: vi.fn(),
}));

describe('log.ipc', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerLogIpc();
  });

  const invoke = (channel: string, ...args: any[]) => {
    return (ipcMain as any)._invokeHandler(channel, {}, ...args);
  };

  it('log:server-event', async () => {
    const result = await invoke('log:server-event', 'ACTION_TYPE', 'Message text', { detail: 1 });
    expect(logServerEvent).toHaveBeenCalledWith('ACTION_TYPE', 'Message text', { detail: 1 });
    expect(result).toEqual({ success: true });
  });
});
