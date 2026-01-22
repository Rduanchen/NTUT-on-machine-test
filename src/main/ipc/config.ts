// config_system.ts
import { ipcMain } from 'electron';
import { ConfigService } from '../service/config.service';

export class ConfigSystem {
    public static async setup() {
        // 啟動時初始化
        await ConfigService.initFromLocalPreSettings();

        // IPC handlers
        ipcMain.handle('config:set-json', async (_event, jsonFilePath: string) => {
            return ConfigService.setConfigFromFile(jsonFilePath);
        });

        ipcMain.handle('config:get-from-server', async (_event, host: string) => {
            return ConfigService.setConfigFromServer(host);
        });

        ipcMain.handle('config:server-status', async (_event, hostname: string) => {
            return ConfigService.checkServerStatus(hostname);
        });

        ipcMain.handle('config:setup-complete', () => {
            return ConfigService.isConfigLoaded();
        });

        ipcMain.handle('config:local-config-status', () => {
            return ConfigService.initFromLocalPreSettings();
        });
    }
}