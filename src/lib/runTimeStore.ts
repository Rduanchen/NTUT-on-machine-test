import { ipcMain } from "electron";

let testResult: { [key: string]: any } = {};
let studentInformation: {
  studentID: string;
} = { studentID: "" };
let config: Config = {
  testTitle: "北科大計算機程式設計期中考",
  description: "the test will be start at 18:00 and end at 20:00",
  publicKey:
    "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCvad2H5XaTO0FYatEIyStVdcRTDoM63dD6LMbjC6ILtd5zuXi8vcYKKpu5zsfPZCMAdWUxXl1bx2JvVRaPGeB0zfZo2MU1xPp8fF6ivoagSPueoQH6zhlZ1+1ayg8lmhxf05UFLEAynM38MjHnv9+2VWUgSWPFKMPIK6JAW5AIzwIDAQAB",
  remoteHost: "140.124.131.95",
  testTime: {
    startTime: "2023-11-13T10:30:00Z",
    endTime: "2023-11-13T12:30:00Z",
    forceQuit: true,
  },
  puzzles: [
    {
      id: "1",
      name: "Sum Two Numbers",
      language: "Python",
      testCases: [
        {
          title: "Group1",
          id: 1,
          openTestCases: [
            { id: "1-1", input: "2\n3\n", output: "5" },
            { id: "1-2", input: "10\n20\n", output: "30" },
          ],
          hiddenTestCases: [
            { id: "1-3", input: "1\n2\n", output: "3" },
            { id: "1-4", input: "0\n0\n", output: "0" },
          ],
        },
        {
          title: "Group2",
          id: 2,
          openTestCases: [{ id: "2-1", input: "5\n7\n", output: "12" }],
          hiddenTestCases: [{ id: "2-2", input: "100\n200\n", output: "300" }],
        },
      ],
    },
    {
      id: "2",
      name: "Multiply Two Numbers",
      language: "Python",
      testCases: [
        {
          title: "Group1",
          id: 1,
          openTestCases: [
            { id: "1-1", input: "2\n3\n", output: "6" },
            { id: "1-2", input: "10\n20\n", output: "200" },
          ],
          hiddenTestCases: [
            { id: "1-3", input: "1\n2\n", output: "2" },
            { id: "1-4", input: "0\n0\n", output: "0" },
          ],
        },
        {
          title: "Group2",
          id: 2,
          openTestCases: [{ id: "2-1", input: "5\n7\n", output: "35" }],
          hiddenTestCases: [
            { id: "2-2", input: "100\n200\n", output: "20000" },
          ],
        },
      ],
    },
    {
      id: "3",
      name: "Minus Two Numbers",
      language: "Python",
      testCases: [
        {
          title: "Group1",
          id: 1,
          openTestCases: [
            { id: "1-1", input: "2\n3\n", output: "-1" },
            { id: "1-2", input: "10\n20\n", output: "-10" },
          ],
          hiddenTestCases: [
            { id: "1-3", input: "1\n2\n", output: "-1" },
            { id: "1-4", input: "0\n0\n", output: "0" },
          ],
        },
        {
          title: "Group2",
          id: 2,
          openTestCases: [{ id: "2-1", input: "5\n7\n", output: "-2" }],
          hiddenTestCases: [{ id: "2-2", input: "100\n200\n", output: "-100" }],
        },
      ],
    },
  ],
};

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

// 整體 config 物件
export interface Config {
  testTitle: string;
  description: string;
  publicKey: string;
  remoteHost: string;
  testTime: TestTime;
  puzzles: Puzzle[];
}

function updateConfig(newConfig: Config) {
  config = newConfig;
}

function readConfig() {
  return config;
}

function appendTestResult(index: string, newResult: any) {
  testResult[index] = newResult;
}

function readTestResult() {
  return testResult;
}

function updateStudentInformation(newInfo: any) {
  studentInformation = newInfo;
}

function readStudentInformation() {
  return studentInformation;
}

export class Store {
  constructor() {
    ipcMain.handle("store:read-test-result", async () => {
      return readTestResult();
    });
    ipcMain.handle("store:get-puzzle-info", () => {
      return config.puzzles.map((puzzle) => {
        return { id: puzzle.id, name: puzzle.name, language: puzzle.language };
      });
    });
    ipcMain.handle(
      "store:update-student-information",
      async (_event, newInfo: any) => {
        updateStudentInformation(newInfo);
        return { success: true };
      }
    );
    ipcMain.handle("store:read-student-information", async () => {
      return readStudentInformation();
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
};
