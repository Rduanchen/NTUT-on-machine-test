import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { ramStore } from './ramStore.service';
import { logger } from './logger.service';
import { fetchExamConfig } from './api.service';
import { connectionService } from './connection.service';
import { messageSyncService } from './message-sync.service';
import { examConfigSchema } from '../schemas/examConfig.schema';
import { preSettingsSchema } from '../schemas/presettings.schema';
import type { ExamConfig, IpcResponse } from '../../common/types';
import { ErrorCode } from '../../common/errorCodes';

/**
 * Config Service - Handles ExamConfig loading
 *
 * Startup flow:
 * 1. Check resources/pre_settings.json
 * 2. If remoteHost exists → try fetch from server
 * 3. If config valid → save to RAM, mark configured
 * 4. If fails → show settings page for manual setup
 *
 * Also provides:
 * - setConfigFromFile(): manual JSON upload
 * - setConfigFromServer(): fetch from URL
 */

class ConfigService {
  private static instance: ConfigService;
  private constructor() {}

  public static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  // ─── Startup Flow ────────────────────────────────────────────

  /** Called on app startup. Tries to load config from pre_settings.json */
  public async initFromPreSettings(): Promise<void> {
    const configLocation = app.isPackaged
      ? path.join(process.resourcesPath, 'pre_settings.json')
      : path.join(app.getAppPath(), 'resources', 'pre_settings.json');

    // Check if pre_settings.json exists
    if (!fs.existsSync(configLocation)) {
      logger.info('[Config] No pre_settings.json found. Showing settings page.');
      ramStore.isConfigured = false;
      return;
    }

    // Read and validate pre_settings.json
    try {
      const jsonFile = fs.readFileSync(configLocation, 'utf-8');
      const json = JSON.parse(jsonFile);

      const validation = preSettingsSchema.safeParse(json);
      if (!validation.success) {
        logger.error('[Config] pre_settings.json format is invalid:', validation.error);
        ramStore.isConfigured = false;
        return;
      }

      const preSettings = validation.data;
      const remoteHost = preSettings.remoteHost;

      // If remoteHost exists, try to fetch config from server
      if (remoteHost) {
        ramStore.backendUrl = remoteHost;
        const result = await this.fetchAndSaveConfig(remoteHost);
        if (result.success) {
          logger.info('[Config] Config loaded from server via pre_settings.');
          connectionService.start();
          messageSyncService.start(remoteHost);
          return;
        }
        logger.warn('[Config] Failed to fetch config from server. Waiting for manual setup.');
      }

      ramStore.isConfigured = false;
    } catch (error) {
      logger.error('[Config] Error reading pre_settings.json:', error);
      ramStore.isConfigured = false;
    }
  }

  // ─── Manual Config Setup ──────────────────────────────────────

  /** Set config from uploaded JSON file path */
  public async setConfigFromFile(jsonFilePath: string): Promise<IpcResponse<void>> {
    try {
      const fileContent = fs.readFileSync(jsonFilePath, 'utf-8');
      const json = JSON.parse(fileContent);

      const validation = examConfigSchema.safeParse(json);
      if (!validation.success) {
        const errorMsg = validation.error.issues
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join('\n');
        return {
          success: false,
          error: {
            code: ErrorCode.INVALID_CONFIG_FORMAT,
            message: `Invalid config format: ${errorMsg}`
          }
        };
      }

      ramStore.examConfig = validation.data as ExamConfig;
      logger.info('[Config] Config loaded from uploaded file.');
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: { code: ErrorCode.INVALID_CONFIG_FORMAT, message }
      };
    }
  }

  /** Set config from server URL */
  public async setConfigFromServer(host: string): Promise<IpcResponse<void>> {
    ramStore.backendUrl = host;
    const result = await this.fetchAndSaveConfig(host);

    if (result.success) {
      connectionService.start();
      messageSyncService.start(host);
    }
    return result;
  }

  /** Check if a server is reachable and returns valid status */
  public async checkServerStatus(hostname: string): Promise<IpcResponse<void>> {
    try {
      const response = await fetchExamConfig(hostname);
      if (!response.success) {
        return {
          success: false,
          error: { code: ErrorCode.SERVER_STATUS_NOT_OK, message: 'Cannot reach server' }
        };
      }
      return { success: true };
    } catch {
      return {
        success: false,
        error: { code: ErrorCode.SERVER_STATUS_NOT_OK, message: 'Server unreachable' }
      };
    }
  }

  /** Check if config has been loaded */
  public isConfigLoaded(): boolean {
    return ramStore.isConfigured;
  }

  // ─── Internal Helpers ─────────────────────────────────────────

  private async fetchAndSaveConfig(host: string): Promise<IpcResponse<void>> {
    const response = await fetchExamConfig(host);

    if (!response.success || !response.data) {
      ramStore.isConfigured = false;
      return {
        success: false,
        error: { code: ErrorCode.NO_RESPONSE, message: 'No response from server' }
      };
    }

    const validation = examConfigSchema.safeParse(response.data);
    if (!validation.success) {
      ramStore.isConfigured = false;
      const errorMsg = validation.error.issues
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join('\n');
      return {
        success: false,
        error: {
          code: ErrorCode.INVALID_CONFIG_FORMAT,
          message: `Config from server is invalid: ${errorMsg}`
        }
      };
    }

    ramStore.examConfig = validation.data as ExamConfig;
    ramStore.backendUrl = host;
    logger.info('[Config] Config saved to RAM from server.');
    return { success: true };
  }
}

export const configService = ConfigService.getInstance();
