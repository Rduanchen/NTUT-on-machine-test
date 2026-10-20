import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ipcMain } from 'electron';
import { registerNotificationIpc } from '../../src/main/ipc/notification.ipc';
import { ramStore } from '../../src/main/services/ramStore.service';
import { messageSyncService } from '../../src/main/services/message-sync.service';
import { logger } from '../../src/main/services/logger.service';

vi.mock('../../src/main/services/ramStore.service', () => ({
  ramStore: {
    notifications: [],
    configVersion: 0,
    messageVersion: 0,
    socketStatus: 'DISCONNECTED',
  }
}));

vi.mock('../../src/main/services/message-sync.service', () => ({
  messageSyncService: {
    manualRefresh: vi.fn(),
  }
}));

vi.mock('../../src/main/services/logger.service', () => ({
  logger: {
    error: vi.fn(),
  }
}));

describe('notification.ipc', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerNotificationIpc();
  });

  const invoke = (channel: string, ...args: any[]) => {
    return (ipcMain as any)._invokeHandler(channel, {}, ...args);
  };

  it('notifications:get-all', async () => {
    ramStore.notifications = [{ id: 'n1', content: 'test' }] as any;
    const result = await invoke('notifications:get-all');
    expect(result).toEqual([{ id: 'n1', content: 'test' }]);
  });

  it('notifications:get-versions', async () => {
    ramStore.configVersion = 5;
    ramStore.messageVersion = 10;
    const result = await invoke('notifications:get-versions');
    expect(result).toEqual({ configVersion: 5, messageVersion: 10 });
  });

  it('notifications:get-socket-status', async () => {
    ramStore.socketStatus = 'CONNECTED' as any;
    const result = await invoke('notifications:get-socket-status');
    expect(result).toEqual('CONNECTED');
  });

  describe('notifications:refresh', () => {
    it('success', async () => {
      vi.mocked(messageSyncService.manualRefresh).mockResolvedValueOnce();
      const result = await invoke('notifications:refresh');
      expect(messageSyncService.manualRefresh).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('error handling with Error instance', async () => {
      const err = new Error('Refresh failed');
      vi.mocked(messageSyncService.manualRefresh).mockRejectedValueOnce(err);
      const result = await invoke('notifications:refresh');
      expect(logger.error).toHaveBeenCalledWith('[NotificationIPC] Manual refresh failed:', 'Refresh failed');
      expect(result).toEqual({
        success: false,
        error: {
          code: 'UNKNOWN_ERROR',
          message: 'Refresh failed'
        }
      });
    });

    it('error handling with string error', async () => {
      vi.mocked(messageSyncService.manualRefresh).mockRejectedValueOnce('Some string error');
      const result = await invoke('notifications:refresh');
      expect(logger.error).toHaveBeenCalledWith('[NotificationIPC] Manual refresh failed:', 'Some string error');
      expect(result).toEqual({
        success: false,
        error: {
          code: 'UNKNOWN_ERROR',
          message: 'Some string error'
        }
      });
    });
  });
});
