import axios from "axios";
import { Config, readConfig, readTestResult, readStudentInformation } from "./runTimeStore";

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
