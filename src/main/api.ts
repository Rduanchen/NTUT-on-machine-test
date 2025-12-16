import axios from 'axios';
import { store } from './store/store';
import { Config } from './store/types';
import { actionLogger } from './system/logger';
import FormData from 'form-data';
import { LocalProgramStore } from './localProgram';
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// 提取一個通用的錯誤處理函數，避免重複程式碼，並統一不 throw error
function handleApiError(context: string, error: any) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error(`${context}: ${errorMessage}`);
  store.updateServerAvailability(false);
  return undefined;
}

export async function fetchConfig(host: string) {
  try {
    const response = await axios.get(`${host}/api/get-config`);
    actionLogger.info('Fetched config from server.');
    actionLogger.silly(response.data);
    store.updateServerAvailability(true);
    return response.data as Config;
  } catch (error) {
    return handleApiError('Failed to fetch config', error);
  }
}

export async function getServerStatus(host: string) {
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
  if (!store.hasConfig()) {
    return;
  }
  if (!store.isTestResultDirty()) {
    return;
  }
  const testResult = store.getTestResult();
  const config = store.getConfig();
  const host = config.remoteHost;
  const studentInfo = store.getStudentInformation();
  try {
    const response = await axios.post(`${host}/api/post-result`, {
      studentInformation: studentInfo,
      key: config.publicKey,
      testResult: testResult
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
  try {
    let response = await axios.post(`${hostLink}/api/is-student-valid`, {
      studentID: studentID
    });

    store.updateServerAvailability(true);
    const toStore = {
      id: response.data.info?.student_ID || '',
      name: response.data.info?.name || ''
    };
    store.updateStudentInformation(toStore);
    // 驗證成功代表網路暢通，嘗試觸發隊列處理
    await ApiSystemInstance.processQueuedActions();
    return response;
  } catch (error) {
    handleApiError(`Failed to verify student ID: ${studentID}`, error);
    return 'offline';
  }
}

export async function sendProgramFileToServer(buffer: Buffer) {
  // if (store.getIsResultHigherThanPrevious() === false) {
  //   return { success: false, message: 'Result not higher than previous' };
  // } TODO
  if (!store.hasConfig()) {
    actionLogger.info('Config unavailable while sending program file.');
    return { success: false, message: 'Config unavailable' };
  }
  const studentID = store.getStudentInformation().id;
  console.warn(store.getStudentInformation());
  const config = store.getConfig();
  const hostLink = config.remoteHost;
  try {
    const form = new FormData();
    form.append('studentID', studentID);
    form.append('file', buffer, {
      filename: `${studentID}.zip`,
      contentType: 'application/zip'
    });
    form.append('key', config.publicKey);
    const response = await axios.post(`${hostLink}/api/upload-program`, form, {
      headers: form.getHeaders(),
      maxContentLength: MAX_FILE_SIZE,
      maxBodyLength: MAX_FILE_SIZE
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
  [key: string]: unknown; // Adjust this as needed for stricter typing
}

export async function logUserActionToServer(actionData: UserActionData) {
  const studentInfo = store.getStudentInformation();
  const payload = {
    studentID: studentInfo.id,
    ...actionData
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
    // 成功發送後，觸發佇列檢查 (同樣依賴鎖機制防止迴圈)
    ApiSystemInstance.processQueuedActions();
    return response.data;
  } catch (error) {
    // 發送失敗，加入佇列並記錄 Log (不 throw)
    handleApiError('Failed to log user action', error);
    ApiSystemInstance.addLogToQueue(payload);
  }
}

export class ApiSystem {
  private static _isAlive: boolean = true;
  private static _interval: NodeJS.Timeout | null = null;
  private static recheckIntervalMs: number = 10000;
  private static serverTimeoutMs: number = 4000;
  private static userActionLogQueue: any[] = []; //FIXME: any
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
      let response = await axios.get(`${host}/api/status`, { timeout: this.serverTimeoutMs });
      if (response) {
        this._isAlive = true;
        store.updateServerAvailability(true);
        await this.processQueuedActions();
      }
    } catch (err) {
      if (this._isAlive) {
        this._isAlive = false;
        store.updateServerAvailability(false);
        actionLogger.silly('Server health check failed (server went offline).');
      }
    }
  }

  public static addLogToQueue(actionData: unknown) {
    this.userActionLogQueue.push(actionData);
  }

  private static async resolveQueuedLog() {
    if (!store.hasConfig()) {
      return;
    }
    while (this.userActionLogQueue.length > 0) {
      const actionData = this.userActionLogQueue.shift();
      const studentInfo = store.getStudentInformation();
      const payload = {
        studentID: studentInfo.id,
        ...actionData
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
    // 1. 檢查鎖：如果正在同步中，直接離開，避開無窮遞迴
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
