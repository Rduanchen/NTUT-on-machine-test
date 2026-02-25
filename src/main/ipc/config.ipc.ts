import { ipcMain } from 'electron';
import { configService } from '../services/config.service';

/**
 * Config IPC Handlers
 *
 * Channels:
 * - config:set-json          → Upload config from file
 * - config:get-from-server   → Fetch config from server URL
 * - config:server-status     → Check if server is reachable
 * - config:setup-complete    → Check if config is loaded
 */
export function registerConfigIpc(): void {
  ipcMain.handle('config:set-json', async (_event, jsonFilePath: string) => {
    return configService.setConfigFromFile(jsonFilePath);
  });

  ipcMain.handle('config:get-from-server', async (_event, host: string) => {
    return configService.setConfigFromServer(host);
  });

  ipcMain.handle('config:server-status', async (_event, hostname: string) => {
    return configService.checkServerStatus(hostname);
  });

  ipcMain.handle('config:setup-complete', () => {
    return configService.isConfigLoaded();
  });
}
