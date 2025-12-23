import axios from 'axios';
import { store } from './store/store';
import { Config } from './store/types';
import { actionLogger } from './system/logger';
import FormData from 'form-data';
import { LocalProgramStore } from './localProgram';
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function handleApiError(context: string, error: any) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error(`${context}: ${errorMessage}`);
  store.updateServerAvailability(false);
  return undefined;
}

// 取得當前 studentID（必須已寫入 store）
function getStudentId(): string {
  const studentInfo = store.getStudentInformation();
  const id = studentInfo.id || 'unknown';
  return id;
}

// 取得當前 macAddress（必須已寫入 store）
function getMacAddress(): string {
  const mac = (store as any).getMacAddress?.() ?? '';
  if (!mac) {
    throw new Error('Mac address is not set. Please set it before making requests.');
  }
  return mac;
}

export async function fetchConfig(host: string) {
  try {
    // /api/get-config 需求：附帶 ipAddress；(可選)帶上 studentID、macAddress 以保持一致
    const studentID = getStudentId();
    const macAddress = getMacAddress();
    const response = await axios.get(`${host}/api/get-config`, {
      params: {
        studentID,
        macAddress,
      },
    });
    actionLogger.info('Fetched config from server.');
    actionLogger.silly(response.data);
    store.updateServerAvailability(true);
    return response.data as Config;
  } catch (error) {
    return handleApiError('Failed to fetch config', error);
  }
}

export async function getServerStatus(host: string) {
  // /api/status 可不帶 studentID / macAddress
  try {
    const response = await axios.get(`${host}/api/status`);
    store.updateServerAvailability(true);
    return response.data;
  } catch (error) {
    return handleApiError('Failed to get server status', error);
  }
}

export async function sendTestResultToServer() {
  if (!store.hasConfig()) return;
  const testResult = store.getTestResult();
  const config = store.getConfig();
  const host = config.remoteHost;
  const studentInfo = store.getStudentInformation();
  const macAddress = getMacAddress();

  try {
    console.dir({ studentInfo, testResult, macAddress }, { depth: null });
    const response = await axios.post(`${host}/api/post-result`, {
      studentInformation: studentInfo,
      studentID: studentInfo.id,
      key: config.publicKey,
      testResult,
      macAddress,
    });
    store.markTestResultSynced();
    store.updateServerAvailability(true);
    ApiSystemInstance.clearPendingTestResult();
    return response.data;
  } catch (error) {
    ApiSystemInstance.markPendingTestResult();
    return handleApiError('Failed to send test result', error);
  }
}

export async function verifyStudentIDFromServer(studentID: string): Promise<any> {
  if (!store.hasConfig()) {
    actionLogger.info('Config unavailable while verifying student ID.');
    return undefined;
  }
  console.warn(`Verifying student ID: ${studentID} with server...`);
  const config = store.getConfig();
  const hostLink = config.remoteHost;
  const macAddress = getMacAddress();
  try {
    const response = await axios.post(`${hostLink}/api/is-student-valid`, {
      studentID,
      macAddress,
    });

    store.updateServerAvailability(true);
    const toStore = {
      id: response.data.info?.student_ID || '',
      name: response.data.info?.name || '',
    };
    store.updateStudentInformation(toStore);
    return response;
  } catch (error) {
    handleApiError(`Failed to verify student ID: ${studentID}`, error);
    return 'offline';
  }
}

export async function sendProgramFileToServer(buffer: Buffer) {
  if (!store.hasConfig()) {
    return { success: false, message: 'Config unavailable' };
  }

  let isHigher = store.getIsResultHigherThanPrevious();
  isHigher = isHigher || false;
  if (!isHigher) {
    return { success: true, message: 'No need to upload program file' };
  }

  const studentID = getStudentId();
  const macAddress = getMacAddress();
  const config = store.getConfig();
  const hostLink = config.remoteHost;

  try {
    const form = new FormData();
    form.append('studentID', studentID);
    form.append('macAddress', macAddress);
    form.append('file', buffer, {
      filename: `${studentID}.zip`,
      contentType: 'application/zip',
    });
    form.append('key', config.publicKey);
    const response = await axios.post(`${hostLink}/api/upload-program`, form, {
      headers: form.getHeaders(),
      maxContentLength: MAX_FILE_SIZE,
      maxBodyLength: MAX_FILE_SIZE,
    });
    store.updateServerAvailability(true);
    store.updateResultHigherThanPrevious(false);
    ApiSystemInstance.clearPendingProgramFile();
    return response.data;
  } catch (error) {
    ApiSystemInstance.markPendingProgramFile(buffer);
    return handleApiError('Failed to send program file', error);
  }
}

// Define the expected structure for user action data
export interface UserActionData {
  [key: string]: unknown;
}

export async function logUserActionToServer(actionData: UserActionData) {
  const studentInfo = store.getStudentInformation();
  const macAddress = getMacAddress();
  const payload = {
    studentID: studentInfo.id,
    macAddress,
    ...actionData,
  };

  if (!store.hasConfig()) {
    ApiSystemInstance.addLogToQueue(payload);
    return;
  }
  const config = store.getConfig();
  const host = config.remoteHost;

  try {
    const response = await axios.post(`${host}/api/user-action-logger`, payload);
    return response.data;
  } catch (error) {
    handleApiError('Failed to log user action', error);
    ApiSystemInstance.addLogToQueue(payload);
  }
}

export class ApiSystem {
  private static _isAlive: boolean = true;
  private static _interval: NodeJS.Timeout | null = null;
  private static recheckIntervalMs: number = 10000;
  private static serverTimeoutMs: number = 4000;
  private static userActionLogQueue: any[] = [];
  private static _isSyncing: boolean = false;
  private static _pendingTestResult: boolean = false;
  private static _pendingProgramFile: Buffer | null = null;

  public static setup() {
    this.startHealthCheck();
  }

  public static onRemove() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }

  private static startHealthCheck() {
    if (this._interval) return;

    this._interval = setInterval(async () => {
      await this.checkServerAlive({ triggerFlush: false });
    }, this.recheckIntervalMs);
  }

  /**
   * External entry for other services to trigger a re-check when they believe server recovered.
   * Will flush queues only if server is confirmed alive and not currently syncing.
   */
  public static async recheckServerStatus() {
    if (this._isSyncing) {
      actionLogger.silly('Recheck skipped: currently syncing queued actions.');
      return;
    }
    await this.checkServerAlive({ triggerFlush: true });
  }

  private static async checkServerAlive(opts: { triggerFlush: boolean }) {
    if (!store.hasConfig()) {
      return;
    }
    const config = store.getConfig();
    const host = config.remoteHost;
    try {
      const response = await axios.get(`${host}/api/status`, { timeout: this.serverTimeoutMs });
      if (response) {
        const wasAlive = this._isAlive;
        this._isAlive = true;
        store.updateServerAvailability(true);

        // Only flush when explicitly requested AND not already syncing
        const hasPending =
          this.userActionLogQueue.length > 0 ||
          this._pendingTestResult ||
          !!this._pendingProgramFile;
        if (opts.triggerFlush && hasPending && !this._isSyncing) {
          await this.processQueuedActions();
        } else if (opts.triggerFlush && !hasPending) {
          actionLogger.silly('Recheck: server alive, no pending queue to flush.');
        } else if (!opts.triggerFlush && !wasAlive && this._isAlive) {
          actionLogger.silly('Health check detected recovery; waiting for explicit recheck to flush.');
        }
      }
    } catch (_err) {
      const wasAlive = this._isAlive;
      this._isAlive = false;
      store.updateServerAvailability(false);
      if (wasAlive) {
        actionLogger.silly('Server health check failed (server went offline).');
      }
    }
  }

  public static addLogToQueue(actionData: unknown) {
    // queue must also carry macAddress
    const macAddress = getMacAddress();
    const studentID = getStudentId();
    this.userActionLogQueue.push({
      studentID,
      macAddress,
      ...(actionData && typeof actionData === 'object' ? actionData : {}),
    });
  }

  private static async resolveQueuedLog() {
    if (!store.hasConfig()) {
      return;
    }
    while (this.userActionLogQueue.length > 0) {
      const actionData = this.userActionLogQueue.shift();
      const studentID = getStudentId();
      const macAddress = getMacAddress();
      const payload = {
        studentID,
        macAddress,
        ...(actionData && typeof actionData === 'object' ? actionData : {}),
      };
      const config = store.getConfig();
      const host = config.remoteHost;

      try {
        await axios.post(`${host}/api/user-action-logger`, payload);
      } catch (error) {
        this.userActionLogQueue.unshift(actionData);
        handleApiError('Failed to resolve queued log', error);
        break;
      }
    }
  }

  private static async flushPendingTestResult() {
    if (!this._pendingTestResult) return;
    try {
      await sendTestResultToServer();
      this._pendingTestResult = false;
    } catch (error) {
      handleApiError('Failed to flush pending test result', error);
    }
  }

  private static async flushPendingProgramFile() {
    if (!this._pendingProgramFile) return;
    try {
      await sendProgramFileToServer(this._pendingProgramFile);
      this._pendingProgramFile = null;
    } catch (error) {
      handleApiError('Failed to flush pending program file', error);
    }
  }

  public static async processQueuedActions() {
    if (this._isSyncing) {
      // Guard to avoid concurrent flush attempts
      return;
    }
    if (!this._isAlive) {
      actionLogger.silly('Skip processing queue: server not alive.');
      return;
    }

    this._isSyncing = true;
    try {
      // Order: user actions -> test result -> program file
      await this.resolveQueuedLog();
      await this.flushPendingTestResult();
      await this.flushPendingProgramFile();

      // Local program sync after program upload and when higher score flagged
      if (store.getIsResultHigherThanPrevious()) {
        await LocalProgramStore.syncToBackend();
        store.updateResultHigherThanPrevious(false);
      }
    } catch (error) {
      console.error('Error processing queued actions:', error);
    } finally {
      this._isSyncing = false;
    }
  }

  public static markPendingTestResult() {
    this._pendingTestResult = true;
  }

  public static clearPendingTestResult() {
    this._pendingTestResult = false;
  }

  public static markPendingProgramFile(buffer: Buffer) {
    this._pendingProgramFile = buffer;
  }

  public static clearPendingProgramFile() {
    this._pendingProgramFile = null;
  }
}

const ApiSystemInstance = ApiSystem;
export default ApiSystemInstance;

// Helper export for external callers
export async function recheckServerStatus() {
  return ApiSystem.recheckServerStatus();
}