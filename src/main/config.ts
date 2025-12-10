import { ipcMain } from 'electron';
import { store } from './store/store';
import { ApiSystem, fetchConfig, getServerStatus } from './api';
import fs from 'fs';
import { app } from 'electron';
import path from 'path';
import { actionLogger } from './system/logger';

let isDev = !app.isPackaged;
let isConfigLoaded = false;
let localConfigInfo = '';

export class ConfigSystem {
  public static setup() {
    this.getServerConfigFromLocal();
    ipcMain.handle('config:set-json', (_event, jsonFilePath: string) => {
      let file = fs.readFileSync(jsonFilePath, 'utf-8');
      let jsonString = JSON.parse(file);
      actionLogger.info('Configuration from user uploaded file');
      store.updateConfig(jsonString);
      ApiSystem.processQueuedActions();
      isConfigLoaded = true;
      return { success: true };
    });
    ipcMain.handle('config:get-from-server', async (_event, host: string) => {
      console.log('Fetching config from server at host:', host);
      try {
        let response = await fetchConfig(host);
        if (response) {
          store.updateServerAvailability(true);
        }
        console.log('Configuration fetched from server:', response);
        actionLogger.info('Configuration fetched from server');
        store.updateConfig(response);

        // ApiSystem.setup();
        ApiSystem.processQueuedActions();
        isConfigLoaded = true;
        return { success: true };
      } catch (error) {
        actionLogger.error('Failed to fetch config from server');
        return {
          success: false,
          message: 'Failed to fetch config from server'
        };
      }
    });
    ipcMain.handle('config:server-status', async (_event, hostname: string) => {
      try {
        let response = await getServerStatus(hostname);
        console.log('Server status response:', response);
        if (response.success !== true) {
          return {
            success: false,
            message: 'Server status not ok'
          };
        }
        return { success: true, data: response };
      } catch (error) {
        return { success: false, message: 'Failed to fetch server status' };
      }
    });
    ipcMain.handle('config:setup-complete', () => {
      return isConfigLoaded;
    });
    ipcMain.handle('config:local-config-status', () => {
      return localConfigInfo;
    });
  }
  private static async getServerConfigFromLocal() {
    let configLocaltion = '';
    if (isDev) {
      configLocaltion = path.join(process.cwd(), 'config.json');
    } else {
      configLocaltion = path.join(app.getPath('userData'), 'config.json');
    }

    if (fs.existsSync(configLocaltion)) {
      let jsonFile = fs.readFileSync(configLocaltion, 'utf-8');
      let jsonString = JSON.parse(jsonFile);
      const host = jsonString.remoteHost;
      let reply = await this.fechConfigFromServer(host);
      if (reply.success) {
        actionLogger.warn('Local config file loaded at startup');
        isConfigLoaded = true;
        localConfigInfo = 'Local config file loaded successfully';
        ApiSystem.processQueuedActions();
      } else {
        actionLogger.error('Failed to load config from server at startup, using local config file');
        store.updateConfig(jsonString);
        isConfigLoaded = false;
        localConfigInfo = 'Failed to load config from server, using local config file';
        ApiSystem.processQueuedActions();
      }
    } else {
      actionLogger.info('No local config file found at startup');
      isConfigLoaded = false;
      localConfigInfo = 'No local config file found';
    }
  }
  private static async fechConfigFromServer(host: string) {
    try {
      let response = await fetchConfig(host);
      if (!response) {
        return { success: false, message: 'No response from server' };
      }
      store.updateConfig(response);
      ApiSystem.processQueuedActions();
      return { success: true };
    } catch (error) {
      return { success: false, message: 'Failed to fetch config from server' };
    }
  }
}
