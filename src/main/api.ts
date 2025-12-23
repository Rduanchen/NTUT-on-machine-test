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
function getStudentIdOrThrow(): string {
  const studentInfo = store.getStudentInformation();
  const id = studentInfo.id || 'unknown';
  return id;
}

// 取得當前 macAddress（必須已寫入 store）
function getMacAddressOrThrow(): string {
  const mac = (store as any).getMacAddress?.() ?? '';
  if (!mac) {
    throw new Error('Mac address is not set. Please set it before making requests.');
  }
  return mac;
}

// 取得 IP：前端若可偵測，請填入；此處用空字串代表前端無法得知，由伺服器端取得
function getIpAddress(): string {
  return '';
}

export async function fetchConfig(host: string) {
  try {
    // /api/get-config 需求：附帶 ipAddress；(可選)帶上 studentID、macAddress 以保持一致
    const studentID = getStudentIdOrThrow();
    const macAddress = getMacAddressOrThrow();
    const response = await axios.get(`${host}/api/get-config`, {
      params: {
        ipAddress: getIpAddress(),
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

export interface ActionReport {
  studentID: string;
  actionType: string;
  details?: unknown;
}

export async function sendTestResultToServer() {
  if (!store.hasConfig()) return;
  if (!store.isTestResultDirty()) return;
  let isHigher = store.getIsResultHigherThanPrevious();
  isHigher = isHigher || false;
  if (!isHigher) {
    // actionLogger.info('Test result not higher than previous, skipping upload.');
    return;
  }

  const testResult = store.getTestResult();
  const config = store.getConfig();
  const host = config.remoteHost;
  const studentInfo = store.getStudentInformation();
  const macAddress = getMacAddressOrThrow();

  try {
    const response = await axios.post(`${host}/api/post-result`, {
      studentInformation: studentInfo,
      key: config.publicKey,
      testResult,
      macAddress,
    });
    store.markTestResultSynced();
    store.updateServerAvailability(true);
    await ApiSystemInstance.processQueuedActions();
    return response.data;
  } catch (error) {
    store.updateServerAvailability(false);
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
  const macAddress = getMacAddressOrThrow();
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
    await ApiSystemInstance.processQueuedActions();
    return response;
  } catch (error) {
    handleApiError(`Failed to verify student ID: ${studentID}`, error);
    return 'offline';
  }
}

export async function sendProgramFileToServer(buffer: Buffer) {
  if (!store.hasConfig()) {
    actionLogger.info('Config unavailable while sending program file.');
    return { success: false, message: 'Config unavailable' };
  }
  const studentID = getStudentIdOrThrow();
  const macAddress = getMacAddressOrThrow();
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
    await ApiSystemInstance.processQueuedActions();
    store.updateResultHigherThanPrevious(false);
    return response.data;
  } catch (error) {
    store.updateServerAvailability(false);
    return handleApiError('Failed to send program file', error);
  }
}

// Define the expected structure for user action data
export interface UserActionData {
  [key: string]: unknown;
}

export async function logUserActionToServer(actionData: UserActionData) {
  const studentInfo = store.getStudentInformation();
  const macAddress = getMacAddressOrThrow();
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
  await ApiSystemInstance.processQueuedActions();
  const host = config.remoteHost;

  try {
    const response = await axios.post(`${host}/api/user-action-logger`, payload);
    ApiSystemInstance.processQueuedActions();
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
      await this.checkServerAlive();
    }, this.recheckIntervalMs);
  }

  private static async checkServerAlive() {
    if (!store.hasConfig()) {
      return;
    }
    const config = store.getConfig();
    const host = config.remoteHost;
    try {
      const response = await axios.get(`${host}/api/status`, { timeout: this.serverTimeoutMs });
      if (response) {
        this._isAlive = true;
        store.updateServerAvailability(true);
        await this.processQueuedActions();
      }
    } catch (_err) {
      if (this._isAlive) {
        this._isAlive = false;
        store.updateServerAvailability(false);
        actionLogger.silly('Server health check failed (server went offline).');
      }
    }
  }

  public static addLogToQueue(actionData: unknown) {
    // queue must also carry macAddress
    const macAddress = getMacAddressOrThrow();
    const studentID = getStudentIdOrThrow();
    this.userActionLogQueue.push({
      studentID,
      macAddress,
      ...(actionData && typeof actionData === 'object' ? actionData : {})
    });
  }

  private static async resolveQueuedLog() {
    if (!store.hasConfig()) {
      return;
    }
    while (this.userActionLogQueue.length > 0) {
      const actionData = this.userActionLogQueue.shift();
      const studentID = getStudentIdOrThrow();
      const macAddress = getMacAddressOrThrow();
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

  public static async processQueuedActions() {
    if (this._isSyncing) {
      await LocalProgramStore.syncToBackend();
    }
    this._isSyncing = true;
    try {
      await this.resolveQueuedLog();
      await sendTestResultToServer();
      if (store.getIsResultHigherThanPrevious()) {
        LocalProgramStore.syncToBackend();
        store.updateResultHigherThanPrevious(false);
      }
    } catch (error) {
      console.error('Error processing queued actions:', error);
    } finally {
      this._isSyncing = false;
    }
  }
}

const ApiSystemInstance = ApiSystem;
export default ApiSystemInstance;