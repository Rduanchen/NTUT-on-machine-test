import { ipcMain } from 'electron';
import type { EnvironmentCheckReport, IpcResponse } from '../../common/types';
import { environmentCheckService } from '../services/environment-check.service';
import { ramStore } from '../services/ramStore.service';
import { getMainWindow } from '../system/windowManager';

export function registerEnvironmentCheckIpc(): void {
  ramStore.on('environmentCheckReport', (report: EnvironmentCheckReport) => {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return;
    win.webContents?.send('environment-check:updated', report);
  });

  ipcMain.handle(
    'environment-check:get-report',
    (): IpcResponse<EnvironmentCheckReport> => ({
      success: true,
      data: environmentCheckService.getReport()
    })
  );

  ipcMain.handle(
    'environment-check:retry',
    async (): Promise<IpcResponse<EnvironmentCheckReport>> => {
      try {
        return { success: true, data: await environmentCheckService.retry() };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'ENVIRONMENT_CHECK_FAILED',
            message: error instanceof Error ? error.message : '無法重新執行環境檢查'
          }
        };
      }
    }
  );
}
