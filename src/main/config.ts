import { ipcMain } from 'electron';
import { Config, updateConfig, readConfig } from './local-store/runTimeStore';
import { ApiSystem, fetchConfig, getServerStatus } from './api';
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
      console.log('Fetching config from server at host:', host);
      try {
        let response = await fetchConfig(host);
        console.log('Configuration fetched from server:', response);
        actionLogger.info('Configuration fetched from server');
        ApiSystem.setup();
        updateConfig(response);
        isConfigLoaded = true;
        return { success: true };
      } catch (error) {
        actionLogger.error('Failed to fetch config from server');
        // actionLogger.silly(error);
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
        // actionLogger.silly('Failed to get server status:', error);
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
        ApiSystem.setup();
        actionLogger.info('Configuration loaded from server at startup');
        isConfigLoaded = true;
      } catch (error) {
        actionLogger.warn('Local config file found but fail to fetch from server, using local config');
        isConfigLoaded = false; 
        updateConfig(jsonString);
        localConfigInfo = 'Fail to fetch config from server by local config';
      }
    } else {
      actionLogger.info('No local config file found at startup');
      isConfigLoaded = false;
      localConfigInfo = 'No local config file found';
    }
  }
}
