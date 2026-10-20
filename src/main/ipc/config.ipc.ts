import { ipcMain } from 'electron';
import { configService } from '../services/config.service';
import { healthCheck } from '../services/api.service';
import { ramStore } from '../services/ramStore.service';

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

  ipcMain.handle('config:has-backend-url', () => {
    return !!ramStore.backendUrl;
  });

  ipcMain.handle('config:is-backend-reachable', async () => {
    return !!ramStore.backendUrl && (await healthCheck(ramStore.backendUrl));
  });

  /* Whether this machine was handed a backend address before it started. */
  ipcMain.handle('config:is-pre-deployed', () => {
    return ramStore.isPreDeployed;
  });

  /* Whether this machine is running the exam without a backend at all.
   *
   * The page derivation needs it: an offline machine sent to the approval
   * screen waits for a TA it has no way to reach. */
  ipcMain.handle('config:is-offline', () => {
    return ramStore.isOfflineMode;
  });

  /* Fetch the exam key and open the paper, if the phase allows it. Idempotent,
   * so the exam page can offer it as a plain retry. */
  ipcMain.handle('config:ensure-paper', async () => {
    return configService.ensureExamPaperReadable();
  });

  /* Start the exam from the invigilator's spoken password. The unwrap happens
   * here rather than in the renderer: the key must never reach a window. */
  ipcMain.handle('config:start-with-password', async (_event, password: string) => {
    return configService.startWithPassword(password);
  });
}
