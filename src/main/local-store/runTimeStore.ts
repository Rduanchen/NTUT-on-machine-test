import { ipcMain } from 'electron';
import { verifyStudentIDFromServer } from '../api';
import { getMainWindow } from "../windowsManager";
import { actionLogger } from '../logger';


let config: Config;
let isStudentInfoVerified = false;

// 單一 Test Case
export interface TestCase {
  id: string;
  input: string;
  output: string;
}

// Test Case Group
export interface TestCaseGroup {
  title: string;
  id: number;
  openTestCases: TestCase[];
  hiddenTestCases: TestCase[];
}

// Puzzle
export interface Puzzle {
  id: string;
  name: string;
  language: string;
  testCases: TestCaseGroup[];
}

// Test time settings
export interface TestTime {
  startTime: string; // ISO timestamp
  endTime: string; // ISO timestamp
  forceQuit: boolean;
}

export interface AccessableUser {
  id: string;
  name: string;
}

// 整體 config 物件
export interface Config {
  testTitle: string;
  description: string;
  publicKey: string;
  remoteHost: string;
  accessableUsers: AccessableUser[];
  testTime: TestTime;
  puzzles: Puzzle[];
}

function updateConfig(newConfig: Config) {
  config = newConfig;
}

function readConfig() {
  return config;
}


let testResult: { [key: string]: any } = {};

function appendTestResult(index: string, newResult: any) {
  testResult[index] = newResult;
}

function readTestResult() {
  return testResult;
}

let studentInformation: {
  name: string;
  id: string;
} = { name: '', id: '' };

function updateStudentInformation(newInfo: any) {
  studentInformation = newInfo;
}

function readStudentInformation() {
  return studentInformation;
}

let isServerAvailable = false;

function updateServerAvailability(status: boolean) {
  isServerAvailable = status;
  const win = getMainWindow();
  if (!win || win.isDestroyed()) {
    return;
  }

  const contents = win.webContents;
  if (!contents || contents.isDestroyed()) {
    return;
  }

  try {
    contents.send('store:availability-updated', isServerAvailable);
  } catch (error) {
    actionLogger.warn('Unable to notify renderer about server availability.', error);
  }
}

function getServerAvailability() {
  return isServerAvailable;
}


class ConfigStore {
  public static setup() {
    ipcMain.handle('store:read-test-result', async () => {
      return readTestResult();
    });
    ipcMain.handle('store:get-puzzle-info', () => {
      return config.puzzles.map((puzzle) => {
        return { id: puzzle.id, name: puzzle.name, language: puzzle.language };
      });
    });
    ipcMain.handle('store:update-student-information', async (_event, newInfo: any) =>  {  
      const config = readConfig();
      try {
        actionLogger.info(`User are trying to verify student ID: ${newInfo.studentID}`);
        let re = await verifyStudentIDFromServer(newInfo.studentID)  
        if (re.data.isValid == true) {
          updateStudentInformation(re.data.info);
          isStudentInfoVerified = true;
        } else {
          return { success: false, message: "Student ID not found" };
        }
      } catch (error) {
        const userFound = config.accessableUsers.find((user) => user.id === newInfo.studentID);
        if (userFound) {
          updateStudentInformation(userFound);
          isStudentInfoVerified = true;
          return { success: true };
        }
        actionLogger.error('Error verifying student ID:', error);
        return { success: false, message: "Error verifying student ID" };
      }
      actionLogger.info('Student information updated:', newInfo);
      isStudentInfoVerified = true;
      return { success: true };
    });
    ipcMain.handle('store:is-student-info-verified', async () => {
      return isStudentInfoVerified;
    });
    ipcMain.handle('store:read-student-information', async () => {
      return readStudentInformation();
    });
    ipcMain.handle('config:get-test-info', async () => {
      return {
        testTitle: config.testTitle,
        description: config.description,
        testTime: config.testTime
      };
    });
  }
}

export {
  updateConfig,
  readConfig,
  appendTestResult,
  readTestResult,
  updateStudentInformation,
  readStudentInformation,
  updateServerAvailability,
  getServerAvailability,
  ConfigStore
};
