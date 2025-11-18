import { ipcMain } from 'electron';
import { Config, updateConfig, readConfig } from './runTimeStore';
import { fetchConfig, getServerStatus } from './api';
import fs from 'fs';

export class ConfigSystem {
  public static setup() {
    ipcMain.handle('config:set-json', (_event, jsonFilePath: string) => {
      let file = fs.readFileSync(jsonFilePath, 'utf-8');
      let jsonString = JSON.parse(file);
      updateConfig(jsonString);
      console.log('Config updated:', readConfig());
      return { success: true };
    });
    ipcMain.handle('config:get-from-server', async (_event, host: string) => {
      try {
        let response = await fetchConfig(host);
        console.log('Config fetched from server:', response);
        updateConfig(response);
        return { success: true };
      } catch (error) {
        console.error('Failed to fetch config from server:', error);
        return {
          success: false,
          messeage: 'Failed to fetch config from server'
        };
      }
    });
    ipcMain.handle('config:server-status', async (_event, hostname: string) => {
      // const host = readConfig().remoteHost;
      console.log('Checking server status for host:', hostname);
      try {
        let response = await getServerStatus(hostname);
        if (response.status !== true) {
          return {
            success: false,
            message: 'Server status not ok'
          };
        }
        return { success: true, data: response };
      } catch (error) {
        console.error('Failed to fetch server status:', error);
        return { success: false, message: 'Failed to fetch server status' };
      }
    });
  }
}
