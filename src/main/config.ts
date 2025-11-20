import { ipcMain } from 'electron';
import { Config, updateConfig, readConfig } from './local-store/runTimeStore';
import { fetchConfig, getServerStatus } from './api';
import fs from 'fs';
import { app } from 'electron';
import path from 'path';
import { actionLogger } from './logger';

let isDev = !app.isPackaged
let isConfigLoaded = false;
let localConfigInfo = "";

export class ConfigSystem {
  
  public static setup() {
    this.getServerConfigFromLocal();
    ipcMain.handle('config:set-json', (_event, jsonFilePath: string) => {
      let file = fs.readFileSync(jsonFilePath, 'utf-8');
      let jsonString = JSON.parse(file);
      actionLogger.info('Configuration from user uploaded file');
      updateConfig(jsonString);
      isConfigLoaded = true;
      return { success: true };
    });
    ipcMain.handle('config:get-from-server', async (_event, host: string) => {
      try {
        let response = await fetchConfig(host);
        actionLogger.info('Configuration fetched from server');
        updateConfig(response);
        isConfigLoaded = true;
        return { success: true };
      } catch (error) {
        actionLogger.error('Failed to fetch config from server:', error);
        return {
          success: false,
          message: 'Failed to fetch config from server'
        };
      }
    });
    ipcMain.handle('config:server-status', async (_event, hostname: string) => {
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
        actionLogger.silly('Failed to get server status:', error);
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
  private static async getServerConfigFromLocal(){
    let configLocaltion = '';
    if (isDev) {
      configLocaltion = path.join(process.cwd(), 'config.json');
    } else {
      configLocaltion = path.join(app.getPath("userData"), 'config.json');
    }
    if (fs.existsSync(configLocaltion)){
      let jsonFile = fs.readFileSync(configLocaltion, 'utf-8');
      let jsonString = JSON.parse(jsonFile);
      const host = jsonString.remoteHost;
      try {
        let response = await fetchConfig(host);
        actionLogger.silly('Configuration fetched from server:', response);
        updateConfig(response);
        actionLogger.info('Configuration loaded from server at startup');
        isConfigLoaded = true;
      } catch (error) {
        actionLogger.warn('Failed to fetch config from server');
        isConfigLoaded = false; 
        localConfigInfo = 'Fail to fetch config from server by local config';
      }
      updateConfig(jsonString);
    } else {
      actionLogger.info('No local config file found at startup');
      isConfigLoaded = false;
      localConfigInfo = 'No local config file found';
    }
  }
}
