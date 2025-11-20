import axios from "axios";
import { Config, readConfig, readTestResult, readStudentInformation, updateServerAvailability } from "./runTimeStore";

export async function fetchConfig(host: string) {
  try {
    const response = await axios.get(`${host}/api/get-config`);
    return response.data as Config;
  } catch (error) {
    console.error("Failed to fetch config:", error);
    throw error;
  }
}

export async function getServerStatus(host: string) {
  console.log("Host in getServerStatus:", `${host}/api/status`);
  try {
    const response = await axios.get(`${host}/api/status`);
    console.log("Response in getServerStatus:", response.data);
    return response.data;
  } catch (error) {
    console.error("Failed to fetch server status:", error);
    throw error;
  }
}

export enum LocalActionType {
  START_TEST = "START_TEST",
  CLOSE_WINDOW = "CLOSE_WINDOW",
  JUDGE_SUBMISSION = "JUDGE_SUBMISSION",
  EXPORT_ZIP = "EXPORT_ZIP",
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


  console.log("Sending test result to server at:", `${host}/api/post-result`);
  try {
    const response = await axios.post(`${host}/api/post-result`, {
      studentInformation: studentInfo,
      key: config.publicKey,
      testResult: testResult
    });
    console.log("Response from sending test result to server:", response.data);
    return response.data;
  } catch (error) {
    console.error("Failed to send test result to server:", error);
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
    console.error("Failed to verify student ID from server:", error);
    throw error;
  }
}


export async function logUserActionToServer(actionData: any) {
  const config = readConfig();
  const host = config.remoteHost;
  console.log("Logging user action to server at:", `${host}/api/user-action-logger`);
  try {
    const response = await axios.post(`${host}/api/user-action-logger`, actionData);
    console.log("Response from logging user action to server:", response.data);
    return response.data;
  } catch (error) {
    console.error("Failed to log user action to server:", error);
    throw error;
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
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }    
  }

  private static startHealthCheck() {
    if (this._interval) return; 
    
    this._interval = setInterval(() => {
      this.checkServerAlive();
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
        console.log("[ApiSystem] Server is DOWN.");
      }
    } catch (err) {
      if (this._isAlive) {
        this._isAlive = false;
        updateServerAvailability(false);
        console.log("[ApiSystem] Server is DOWN.");
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
