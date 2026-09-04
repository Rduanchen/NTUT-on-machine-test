import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { ramStore } from './ramStore.service';
import { logger } from './logger.service';
import { fetchSecureExamConfig, healthCheck } from './api.service';
import { cryptoService } from './crypto.service';
import { connectionService } from './connection.service';
import { messageSyncService } from './message-sync.service';
import {
  examConfigSchema,
  examConfigMetaSchema,
  examConfigPayloadSchema,
  examConfigSecretSchema,
  mergeExamConfig
} from '../schemas/examConfig.schema';
import { preSettingsSchema } from '../schemas/presettings.schema';
import type { ExamConfig, IpcResponse } from '../../common/types';
import { ErrorCode } from '../../common/errorCodes';
import { environmentCheckService } from './environment-check.service';

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

      // If remoteHost exists, set URL and start services
      if (remoteHost) {
        ramStore.backendUrl = remoteHost;
        logger.info(
          `[Config] Backend URL set to ${remoteHost} via pre_settings. Starting services...`
        );
        connectionService.start();
        messageSyncService.start(remoteHost);
        return;
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

      await environmentCheckService.applyConfig(validation.data as ExamConfig);

      // Manual config means we are in pure offline mode.
      ramStore.isOfflineMode = true;
      /* A manually deployed machine behaves as if registration has closed and
       * login is open — which is what the old NOT_STARTED meant here. The
       * offline deployment path is reworked with the {meta, cipher} bundle. */
      ramStore.examStatus = 'SETUP_FINISHED';

      logger.info('[Config] Config loaded from uploaded file (Offline Mode).');
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
    ramStore.isOfflineMode = false;

    // Start services so we can connect to sockets and get exam status
    connectionService.start();
    messageSyncService.start(host);

    const result = await this.fetchAndSaveConfig(host);

    // Even if fetching config fails (e.g. not logged in yet), we started the services
    // which allows the app to redirect to /not-initialized if status is UNINITIALIZED.
    return result;
  }

  /** Check if a server is reachable and returns valid status */
  public async checkServerStatus(hostname: string): Promise<IpcResponse<void>> {
    try {
      const isUp = await healthCheck(hostname);
      if (!isUp) {
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

  /**
   * Fetch the split paper and keep both halves.
   *
   * Only the meta half is usable at this point, and that is enough: it names
   * the languages and limits the environment check needs. The other half stays
   * as ciphertext until the exam starts, so a machine can be fully prepared
   * while the questions on it remain unreadable.
   */
  public async fetchAndSaveConfig(host?: string): Promise<IpcResponse<void>> {
    const targetHost = host ?? ramStore.backendUrl;
    const response = await fetchSecureExamConfig();

    if (!response.success || !response.data) {
      ramStore.isConfigured = false;
      return {
        success: false,
        error: { code: ErrorCode.NO_RESPONSE, message: 'No response from server' }
      };
    }

    const validation = examConfigPayloadSchema.safeParse(response.data);
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

    ramStore.backendUrl = targetHost;
    await this.applyPaper(validation.data.meta, validation.data.cipher);
    logger.info('[Config] Split exam paper stored; questions remain sealed.');
    return { success: true };
  }

  /**
   * Store both halves and run the environment check off the meta half.
   *
   * If the exam key is already in hand — a paper refreshed mid-exam — the
   * questions are reassembled straight away. Otherwise `examConfig` stays null,
   * which is what keeps everything downstream from reading a paper early: not
   * a check to remember, just nothing to read.
   */
  public async applyPaper(
    meta: ReturnType<typeof examConfigMetaSchema.parse>,
    cipher: { iv: string; ciphertext: string; tag: string }
  ): Promise<void> {
    ramStore.examConfigMeta = meta;
    ramStore.examConfigCipher = cipher;
    ramStore.isConfigured = true;

    await environmentCheckService.applyMeta(meta);

    if (ramStore.examKey) {
      this.unsealPaper(ramStore.examKey);
    }
  }

  /**
   * Turn the delivered halves into the paper the rest of the app understands.
   *
   * The merged result must satisfy the existing config schema, so the judger,
   * the screens and the rule engine carry on unchanged.
   */
  public unsealPaper(examKey: string): void {
    const meta = ramStore.examConfigMeta;
    const cipher = ramStore.examConfigCipher;
    if (!meta || !cipher) throw new Error('No sealed exam paper to open');

    const secret = examConfigSecretSchema.parse(
      cryptoService.decryptExamPaper(cipher, examKey)
    );

    ramStore.examKey = examKey;
    ramStore.examConfig = mergeExamConfig(meta, secret) as ExamConfig;
    logger.info('[Config] Exam paper opened.');
  }
}

export const configService = ConfigService.getInstance();
