import { ipcMain } from 'electron';
import { ramStore } from '../services/ramStore.service';
import { messageSyncService } from '../services/message-sync.service';
import type { IpcResponse, ServerMessage } from '../../common/types';
import { ErrorCode } from '../../common/errorCodes';
import { logger } from '../services/logger.service';

interface VersionPayload {
  configVersion: number;
  messageVersion: number;
}

export function registerNotificationIpc(): void {
  ipcMain.handle('notifications:get-all', () => {
    return ramStore.notifications as ServerMessage[];
  });

  ipcMain.handle('notifications:get-versions', (): VersionPayload => {
    return {
      configVersion: ramStore.configVersion,
      messageVersion: ramStore.messageVersion
    };
  });

  ipcMain.handle('notifications:get-socket-status', () => {
    return ramStore.socketStatus;
  });

  ipcMain.handle('notifications:refresh', async (): Promise<IpcResponse<void>> => {
    try {
      await messageSyncService.manualRefresh();
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('[NotificationIPC] Manual refresh failed:', message);
      return {
        success: false,
        error: {
          code: ErrorCode.UNKNOWN_ERROR,
          message
        }
      };
    }
  });
}
