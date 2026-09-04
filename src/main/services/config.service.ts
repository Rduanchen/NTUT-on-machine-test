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

  /**
   * Load an exam paper from a file, for a machine that cannot reach the
   * backend.
   *
   * Takes the same `{ meta, cipher }` the delivery endpoint returns, so there
   * is one parsing path rather than two — and so a lost memory stick is not a
   * leaked exam. The plaintext config this replaces was both a second path to
   * maintain and a way for a student to hand themselves a paper and detach
   * from every server-side control in the same gesture.
   */
  public async setConfigFromFile(jsonFilePath: string): Promise<IpcResponse<void>> {
    try {
      const fileContent = fs.readFileSync(jsonFilePath, 'utf-8');
      const json = JSON.parse(fileContent);

      const validation = examConfigPayloadSchema.safeParse(json);
      if (!validation.success) {
        const errorMsg = validation.error.issues
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join('\n');
        return {
          success: false,
          error: {
            code: ErrorCode.INVALID_CONFIG_FORMAT,
            message: `不是有效的離線佈署檔：${errorMsg}`
          }
        };
      }

      await this.applyPaper(validation.data.meta, validation.data.cipher);

      /* This machine has no backend to reach, so it stays offline for the run
       * — unless it turns out to have registered successfully at some point,
       * which is what actually decides the mode. The exam starts on the
       * invigilator's spoken password. */
      ramStore.isOfflineMode = true;
      ramStore.examStatus = 'SETUP_FINISHED';

      logger.info('[Config] Offline deployment bundle loaded; questions remain sealed.');
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
   * Start the exam from the password the invigilator reads out.
   *
   * The path that needs no backend at all. A machine holding the ciphertext can
   * begin on a spoken password, which is what stops a backend outage from
   * preventing the exam starting — the one moment in the whole run that cannot
   * absorb a delay.
   *
   * Not a fallback with a switch to flip. It is always available, because the
   * moment it is needed is the moment nothing can be switched.
   */
  public async startWithPassword(password: string): Promise<IpcResponse<void>> {
    const meta = ramStore.examConfigMeta;
    if (!meta || !ramStore.examConfigCipher) {
      return {
        success: false,
        error: { code: ErrorCode.INVALID_CONFIG_FORMAT, message: '本機尚未取得考卷' }
      };
    }

    let examKey: string;
    try {
      examKey = cryptoService.unwrapExamKey(meta.wrappedExamKey, password);
    } catch {
      /* Authenticated encryption: a wrong password fails to authenticate rather
       * than producing a wrong key, so this cannot half-open the paper. */
      return {
        success: false,
        error: { code: ErrorCode.INVALID_CONFIG_FORMAT, message: '口令不正確' }
      };
    }

    try {
      this.unsealPaper(examKey);
    } catch (error) {
      logger.error('[Config] Password was correct but the paper would not open:', error);
      return {
        success: false,
        error: { code: ErrorCode.INVALID_CONFIG_FORMAT, message: '考卷無法開啟，請通知監考人員' }
      };
    }

    ramStore.examStatus = 'IN_PROGRESS';
    logger.info('[Config] Exam started from the invigilator password.');
    return { success: true };
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
