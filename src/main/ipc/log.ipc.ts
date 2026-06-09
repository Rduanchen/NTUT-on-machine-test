import { ipcMain } from 'electron';
import { logServerEvent } from '../services/logger.service';

/**
 * Log IPC Handlers
 *
 * Channels:
 * - log:server-event → Send a specific event to the server log queue
 */
export function registerLogIpc(): void {
  ipcMain.handle('log:server-event', (_event, actionType: string, message: string, details?: any) => {
    logServerEvent(actionType, message, details);
    return { success: true };
  });
}
