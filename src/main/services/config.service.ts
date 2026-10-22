import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { ramStore } from './ramStore.service';
import { logger } from './logger.service';
import { fetchExamKey, fetchSecureExamConfig, healthCheck } from './api.service';
import { cryptoService } from './crypto.service';
import { connectionService } from './connection.service';
import { messageSyncService } from './message-sync.service';
import {
  examConfigMetaSchema,
  backendExamConfigSchema,
  examConfigPayloadSchema,
  examConfigSecretSchema,
  mergeExamConfig
} from '../schemas/examConfig.schema';
import { preSettingsSchema } from '../schemas/presettings.schema';
import type { ExamConfig, IpcResponse } from '../../common/types';
import { ErrorCode } from '../../common/errorCodes';
import { environmentCheckService } from './environment-check.service';
import { prepareOfflineBundle } from './offline-bundle.service';

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
        /* Deployed, and therefore never to be asked for a backend address.
         *
         * This flag used to stay false until a paper had actually been
         * fetched, and the settings page is the startup route — so a machine
         * with a perfectly good `pre_settings.json` sat on a form asking for
         * the address it had already been given. Worse, the one thing that
         * would have moved it on, a connection-status event, is emitted from
         * here: before `createWindow()`, with no renderer to receive it. */
        ramStore.isPreDeployed = true;
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
   * Accepts the backend's exported `{ meta, cipher }` bundle or the plain
   * config.json accepted by its examConfigSchema. A plain config is sealed in
   * memory before entering the same offline path.
   */
  public async setConfigFromFile(jsonFilePath: string): Promise<IpcResponse<void>> {
    try {
      const fileContent = fs.readFileSync(jsonFilePath, 'utf-8');
      const json = JSON.parse(fileContent);

      let validation = examConfigPayloadSchema.safeParse(json);
      if (!validation.success && json && typeof json === 'object' && 'testTitle' in json) {
        const plain = backendExamConfigSchema.safeParse(json);
        if (plain.success) {
          validation = examConfigPayloadSchema.safeParse(prepareOfflineBundle(plain.data));
        } else {
          return {
            success: false,
            error: {
              code: ErrorCode.INVALID_CONFIG_FORMAT,
              message: `設定檔與後端格式不符：${plain.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('\n')}`
            }
          };
        }
      }
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

      /* This machine has no backend to reach, so it stays offline for the run
       * — unless it turns out to have registered successfully at some point,
       * which is what actually decides the mode. The exam starts on the
       * invigilator's spoken password. */
      ramStore.isOfflineMode = true;
      await this.applyPaper(validation.data.meta, validation.data.cipher);
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

    // Diagnostics are advisory. Running compilers for every language can take
    // a while; loading the sealed paper must not wait for that check to finish.
    if (ramStore.isOfflineMode) {
      void environmentCheckService.applyMeta(meta).catch((error) => {
        logger.error('[Config] Offline environment check failed:', error);
      });
    }

    if (ramStore.examKey) {
      this.unsealPaper(ramStore.examKey);
      return;
    }

    /* A paper that arrives while the exam is already running is opened now,
     * not on the next phase change — there may not be another one. */
    await this.ensureExamPaperReadable();
  }

  /**
   * Make sure this machine can read the paper it is holding, if it is allowed to.
   *
   * Idempotent, and safe to call from anywhere: it does nothing when there is
   * no sealed paper, when the key is already in hand, when the machine is
   * offline, or when the exam has not started.
   *
   * The exam key used to be fetched only from the phase-change handler, which
   * fires on a *transition* into IN_PROGRESS. A machine that re-enters mid-exam
   * never sees that transition — `/user/exam/status` is public, so the phase
   * was already IN_PROGRESS before it logged in — and so it kept both sealed
   * halves and no key. `examConfig` stayed null and the exam page rendered
   * empty with nothing to explain it.
   */
  public async ensureExamPaperReadable(): Promise<IpcResponse<void>> {
    if (ramStore.examKey && ramStore.examConfig) return { success: true };
    if (ramStore.isOfflineMode) {
      return {
        success: false,
        error: { code: ErrorCode.NO_RESPONSE, message: '本機為離線模式，請以監考口令開考' }
      };
    }
    if (ramStore.examStatus !== 'IN_PROGRESS') return { success: true };

    if (!ramStore.examConfigMeta || !ramStore.examConfigCipher) {
      const fetched = await this.fetchAndSaveConfig();
      if (!fetched.success) return fetched;
    }

    if (ramStore.examKey) {
      /* Halves refreshed under a key already in hand — reassemble and stop. */
      this.unsealPaper(ramStore.examKey);
      return { success: true };
    }

    const response = await fetchExamKey();
    if (!response.success || !response.data?.examKey) {
      logger.warn('[Config] The exam has started but the key could not be fetched.');
      return {
        success: false,
        error: {
          code: response.error?.code ?? ErrorCode.NO_RESPONSE,
          message: response.error?.message ?? '無法向伺服器取得考卷金鑰'
        }
      };
    }

    try {
      this.unsealPaper(response.data.examKey);
    } catch (error) {
      logger.error('[Config] The exam key was accepted but the paper would not open:', error);
      return {
        success: false,
        error: { code: ErrorCode.INVALID_CONFIG_FORMAT, message: '考卷無法開啟，請通知監考人員' }
      };
    }

    return { success: true };
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
