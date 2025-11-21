import axios from "axios";
import { Config, readConfig, readTestResult, readStudentInformation, updateServerAvailability } from "./local-store/runTimeStore";
import { actionLogger } from "./logger";

export async function fetchConfig(host: string) {
  try {
    const response = await axios.get(`${host}/api/get-config`);
    actionLogger.info("Fetched config from server:");
    actionLogger.silly(response.data);
    return response.data as Config;
  } catch (error) {
    // actionLogger.silly("Failed to fetch config:", error);
    throw error;
  }
}

export async function getServerStatus(host: string) {
  try {
    const response = await axios.get(`${host}/api/status`);
    return response.data;
  } catch (error) {
    actionLogger.silly("Failed to get server status:", error);
    throw error;
  }
}


export interface actionReport {
  studentID: string;
  actionType: string;
  details?: any;
}

export async function sendTestResultToServer() {
  const testResult = readTestResult();
  const config = readConfig();
  const host = config.remoteHost;
  const studentInfo = readStudentInformation();
  try {
    const response = await axios.post(`${host}/api/post-result`, {
      studentInformation: studentInfo,
      key: config.publicKey,
      testResult: testResult
    });
    actionLogger.info("Response from sending test result to server:", response.data);
    return response.data;
  } catch (error) {
    throw error;
  }
}


export async function verifyStudentIDFromServer(studentID: string){
  const config = readConfig();
  const hostLink = config.remoteHost;
  try {
    let response = await axios.post(`${hostLink}/api/is-student-valid`, {
      studentID: studentID,
    });
    return response;
  } catch (error) {
    actionLogger.error("Failed to verify student ID from server: studentID =", studentID, error);
    throw error;
  }
}


export async function logUserActionToServer(actionData: any) {
  try {
    const config = readConfig();
    const host = config.remoteHost;
    const studentInfo = readStudentInformation();
    const payload = {
      studentID: studentInfo.id,
      ...actionData
    };
    try {
      const response = await axios.post(`${host}/api/user-action-logger`, payload);
      return response.data;
    } catch (error) {
      throw error;
    }
  } catch (error) {
    // actionLogger.error("Failed to log user action to server:", error);
    // throw error;
  }
}


export class ApiSystem {
  private static _isAlive: boolean = true;
  private static _interval: NodeJS.Timeout | null = null;
  private static recheckIntervalMs: number = 3000;
  private static serverTimeoutMs: number = 2000;

  public static setup() {
    // 啟動健康檢查（每 3 秒）
    this.startHealthCheck();
  }

  public static onremove() {
    console.log("ApiSystem onremove called");
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }    
  }

  private static startHealthCheck() {
    if (this._interval) return; 
    
    this._interval = setInterval( async () => {
      await this.checkServerAlive();
    }, this.recheckIntervalMs);
  }

  private static async checkServerAlive() {
    const config = readConfig();
    const host = config.remoteHost; 
    try {
      let response = await axios.get(`${host}/api/status`, { timeout: this.serverTimeoutMs });
      this._isAlive = response.data.success;
      if (this._isAlive) {
        this._isAlive = true;
        updateServerAvailability(true);
        await this.processQueuedActions();
      } else {
        this._isAlive = false;
        updateServerAvailability(false);
      }
    } catch (err) {
      if (this._isAlive) {
        this._isAlive = false;
        updateServerAvailability(false);
      }
    }
  }

  public static async processQueuedActions() {
    // 你在這裡實作：
    // - 讀出 queue 中的 request
    // - 逐個重送
    // 這裡我不動它，只保留呼叫流程
  }
}
