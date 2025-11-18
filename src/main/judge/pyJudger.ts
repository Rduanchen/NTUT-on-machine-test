// import { spawn, ChildProcess } from "child_process";
// import path from "path";

// // --- 1. 介面定義 (Interfaces) ---

// /** 單個測試案例的結構 */
// interface TestCase {
//   id: string;
//   input: string;
//   output: string;
// }

// /** 執行單個測試案例後返回的結果 */
// interface TestResult {
//   id: string;
//   correct: boolean;
//   userOutput: string;
// }

// /** 測試群組的結構，包含公開與隱藏測試案例 */
// interface TestGroup {
//   title: string;
//   id: number;
//   openTestCases?: TestCase[];
//   hiddenTestCases?: TestCase[];
// }

// /** 單個測試群組的執行結果 */
// interface GroupResult {
//   title: string;
//   id: number;
//   testCasesResults: TestResult[];
//   testCaseAmount: number;
//   correctCount: number;
// }

// /** 整個測試批次執行的最終結果 */
// interface RunTestsResult {
//   groupResults: GroupResult[];
//   testCaseAmount: number;
//   correctCount: number;
// }

// /** 內部執行腳本後的原始輸出結果 */
// interface ExecutionResult {
//   actualOutput: string;
//   errorOutput: string;
//   // exitCode: null 表示被信號終止 (如超時)
//   exitCode: number | null;
// }

// // --- 2. 常量與全局狀態 ---

// // 假設執行檔路徑，需要根據實際環境調整
// // 注意：在真實的 Node.js 專案中，__dirname 來自 CommonJS 模組。
// // 若使用 ESM，需要透過 import.meta.url 或其他方式獲取。
// const PYTHON_PATH: string = path.join(__dirname, "python", "python.exe");
// const MAX_EXECUTION_TIME: number = 10000; // 10 秒超時限制 (毫秒)

// /** 當前正在執行的 Python 程序 */
// let currentPythonProcess: ChildProcess | null = null;

// /** 超時計時器 */
// let timeoutTimer: NodeJS.Timeout | null = null;

// // --- 3. 核心執行函式 ---

// /**
//  * 運行 Python 腳本並對多個測試群組進行測試。
//  * @param scriptPath 待測試的 Python 腳本路徑。
//  * @param groupedTestCases 嵌套的測試群組陣列。
//  * @returns 包含所有測試群組結果的 Promise。
//  */
// export async function runPythonTestsAPI(
//   scriptPath: string,
//   groupedTestCases: TestGroup[]
// ): Promise<RunTestsResult> {
//   const groupResults: GroupResult[] = [];
//   let testCaseAmount: number = 0;
//   let correctCount: number = 0;

//   for (const group of groupedTestCases) {
//     const testCasesResults: TestResult[] = [];
//     let groupTestCaseAmount: number = 0;
//     let groupCorrectCount: number = 0;

//     // 輔助函式，用於處理 openTestCases 或 hiddenTestCases
//     const processTestCases = async (tests: TestCase[] | undefined) => {
//       if (Array.isArray(tests)) {
//         for (const test of tests) {
//           const testResult: TestResult = await runSingleCase(scriptPath, test);
//           testCasesResults.push(testResult);

//           if (testResult.correct) {
//             groupCorrectCount++;
//             correctCount++;
//           }
//           testCaseAmount++;
//           groupTestCaseAmount++;
//         }
//       }
//     };

//     // 處理 openTestCases
//     await processTestCases(group.openTestCases);

//     // 處理 hiddenTestCases
//     await processTestCases(group.hiddenTestCases);

//     groupResults.push({
//       title: group.title,
//       id: group.id,
//       testCasesResults,
//       testCaseAmount: groupTestCaseAmount,
//       correctCount: groupCorrectCount,
//     });
//   }

//   return {
//     groupResults,
//     testCaseAmount,
//     correctCount,
//   };
// }

// /**
//  * 運行單個測試案例。
//  * @param scriptPath 待測試的 Python 腳本路徑。
//  * @param test 單個測試案例物件。
//  * @returns 包含測試結果的 Promise。
//  */
// async function runSingleCase(
//   scriptPath: string,
//   test: TestCase
// ): Promise<TestResult> {
//   try {
//     const { actualOutput, errorOutput, exitCode }: ExecutionResult =
//       await executeSingleTestInternal(
//         PYTHON_PATH,
//         scriptPath,
//         test,
//         MAX_EXECUTION_TIME
//       );

//     let isCorrect: boolean = false;
//     // 移除輸出頭尾空白後進行比對
//     let userOutputTrimmed: string = actualOutput.trim();

//     if (exitCode === 0) {
//       // 成功退出，比對輸出
//       if (userOutputTrimmed === test.output.trim()) {
//         isCorrect = true;
//       }
//     }

//     if (errorOutput) {
//       // 如果有標準錯誤輸出，通常視為執行失敗 (例如編譯錯誤或運行時錯誤)
//       userOutputTrimmed += `\n[運行錯誤] ${errorOutput.trim()}`;
//     }

//     if (exitCode === null) {
//       console.warn(`測試 ${test.id} 被外部終止或超時。`);
//       // 超時錯誤的訊息已經在內部函式中加入，這裡只需確保正確返回
//     }

//     return {
//       id: test.id,
//       correct: isCorrect,
//       userOutput: userOutputTrimmed,
//     };
//   } catch (error: any) {
//     // 啟動失敗或致命錯誤
//     console.error(`啟動或執行腳本錯誤 (Test ${test.id}):`, error);
//     return {
//       id: test.id,
//       correct: false,
//       userOutput: `執行失敗：${error.message}`,
//     };
//   }
// }

// /**
//  * 內部函式：執行單個測試案例的 Python 程序。
//  * @param pythonPath Python 執行檔的路徑。
//  * @param scriptPath 待執行的腳本路徑。
//  * @param test 測試案例物件。
//  * @param timeoutMs 超時時間（毫秒）。
//  * @returns 包含原始輸出和退出碼的 Promise。
//  */
// function executeSingleTestInternal(
//   pythonPath: string,
//   scriptPath: string,
//   test: TestCase,
//   timeoutMs: number
// ): Promise<ExecutionResult> {
//   return new Promise((resolve, reject) => {
//     let actualOutput: string = "";
//     let errorOutput: string = "";

//     try {
//       const proc: ChildProcess = spawn(pythonPath, [scriptPath], {
//         // 'pipe' for stdin, stdout, stderr
//         stdio: ["pipe", "pipe", "pipe"],
//       });
//       currentPythonProcess = proc;

//       // 設定超時計時器
//       timeoutTimer = setTimeout(() => {
//         if (proc) {
//           stopProgram(proc); // 強制停止程序
//           resolve({
//             actualOutput: actualOutput + "\n[執行超時，已強制停止]",
//             errorOutput: "超時錯誤",
//             exitCode: null, // 使用 null 表示超時終止
//           });
//         }
//       }, timeoutMs);

//       // 寫入輸入數據並結束 stdin
//       proc.stdin!.write(test.input);
//       proc.stdin!.end();

//       // 監聽 stdout 輸出
//       proc.stdout!.on("data", (data) => {
//         actualOutput += data.toString();
//       });

//       // 監聽 stderr 輸出
//       proc.stderr!.on("data", (data) => {
//         errorOutput += data.toString();
//       });

//       // 程序關閉事件 (正常退出或被信號終止)
//       proc.on("close", (code: number | null) => {
//         if (timeoutTimer) {
//           clearTimeout(timeoutTimer);
//           timeoutTimer = null;
//         }
//         currentPythonProcess = null;
//         resolve({
//           actualOutput: actualOutput,
//           errorOutput: errorOutput,
//           exitCode: code,
//         });
//       });

//       // 啟動程序錯誤事件
//       proc.on("error", (err: Error) => {
//         if (timeoutTimer) clearTimeout(timeoutTimer);
//         currentPythonProcess = null;
//         reject(err);
//       });
//     } catch (e) {
//       reject(e);
//     }
//   });
// }

// /**
//  * 外部函式：強制停止當前正在運行的 Python 程序 (如果存在)。
//  * @param proc 要停止的程序實例 (可選，預設為全局 currentPythonProcess)。
//  * @returns 是否成功停止程序。
//  */
// export function stopProgram(
//   proc: ChildProcess | null = currentPythonProcess
// ): boolean {
//   if (proc && !proc.killed) {
//     console.warn("⚠️ 正在強制停止程序...");

//     // 優先清除計時器
//     if (timeoutTimer) {
//       clearTimeout(timeoutTimer);
//       timeoutTimer = null;
//     }

//     // 嘗試溫和終止
//     proc.kill("SIGTERM");

//     // 等待 500ms 後，如果還沒結束則強制終止
//     setTimeout(() => {
//       if (proc && !proc.killed) {
//         proc.kill("SIGKILL");
//         console.warn("程序已使用 SIGKILL 強制終止。");
//       }
//       // 清除全局引用
//       if (currentPythonProcess === proc) {
//         currentPythonProcess = null;
//       }
//     }, 500);
//     return true;
//   }
//   return false;
// }


import { spawn, ChildProcess } from "child_process";
import path from "path";

// --- 1. 介面定義 (Interfaces) ---

/** 單個測試案例的結構 */
interface TestCase {
  id: string;
  input: string;
  output: string;
}

/** 執行單個測試案例後返回的結果 */
interface TestResult {
  id: string;
  correct: boolean;
  userOutput: string;
}

/** 測試群組的結構，包含公開與隱藏測試案例 */
interface TestGroup {
  title: string;
  id: number;
  openTestCases?: TestCase[];
  hiddenTestCases?: TestCase[];
}

/** 單個測試群組的執行結果 */
interface GroupResult {
  title: string;
  id: number;
  testCasesResults: TestResult[];
  testCaseAmount: number;
  correctCount: number;
}

/** 整個測試批次執行的最終結果 */
interface RunTestsResult {
  groupResults: GroupResult[];
  testCaseAmount: number;
  correctCount: number;
}

/** 內部執行腳本後的原始輸出結果 */
interface ExecutionResult {
  actualOutput: string;
  errorOutput: string;
  // exitCode: null 表示被信號終止 (如超時)
  exitCode: number | null;
}

// --- 2. 常量與全局狀態 ---

/**
 * 根據作業系統決定 Python 執行檔路徑。
 * 'win32' -> Windows
 * 'darwin' -> macOS
 */
const getPythonPath = (): string => {
  switch (process.platform) {
    case "win32":
      // 在 Windows 上，使用打包的嵌入式 Python
      return path.join(__dirname, "python", "python.exe");
    case "darwin":
      // 在 macOS 上，直接使用 'python3' 命令。
      // 如果 'python3' 不在系統 PATH 中，spawn 會觸發錯誤，這符合需求。
      return "python3";
    case "linux":
      // 在 Linux 上，也通常使用 'python3'
      return "python3";
    default:
      // 其他作業系統的預設值
      console.warn(`不支援的作業系統: ${process.platform}，將嘗試使用 'python3'。`);
      return "python3";
  }
};

const PYTHON_PATH: string = getPythonPath();
const MAX_EXECUTION_TIME: number = 10000; // 10 秒超時限制 (毫秒)

/** 當前正在執行的 Python 程序 */
let currentPythonProcess: ChildProcess | null = null;

/** 超時計時器 */
let timeoutTimer: NodeJS.Timeout | null = null;

// --- 3. 核心執行函式 ---

/**
 * 運行 Python 腳本並對多個測試群組進行測試。
 * @param scriptPath 待測試的 Python 腳本路徑。
 * @param groupedTestCases 嵌套的測試群組陣列。
 * @returns 包含所有測試群組結果的 Promise。
 */
export async function runPythonTestsAPI(
  scriptPath: string,
  groupedTestCases: TestGroup[]
): Promise<RunTestsResult> {
  const groupResults: GroupResult[] = [];
  let testCaseAmount: number = 0;
  let correctCount: number = 0;

  for (const group of groupedTestCases) {
    const testCasesResults: TestResult[] = [];
    let groupTestCaseAmount: number = 0;
    let groupCorrectCount: number = 0;

    // 輔助函式，用於處理 openTestCases 或 hiddenTestCases
    const processTestCases = async (tests: TestCase[] | undefined) => {
      if (Array.isArray(tests)) {
        for (const test of tests) {
          const testResult: TestResult = await runSingleCase(scriptPath, test);
          testCasesResults.push(testResult);

          if (testResult.correct) {
            groupCorrectCount++;
            correctCount++;
          }
          testCaseAmount++;
          groupTestCaseAmount++;
        }
      }
    };

    // 處理 openTestCases
    await processTestCases(group.openTestCases);

    // 處理 hiddenTestCases
    await processTestCases(group.hiddenTestCases);

    groupResults.push({
      title: group.title,
      id: group.id,
      testCasesResults,
      testCaseAmount: groupTestCaseAmount,
      correctCount: groupCorrectCount,
    });
  }

  return {
    groupResults,
    testCaseAmount,
    correctCount,
  };
}

/**
 * 運行單個測試案例。
 * @param scriptPath 待測試的 Python 腳本路徑。
 * @param test 單個測試案例物件。
 * @returns 包含測試結果的 Promise。
 */
async function runSingleCase(
  scriptPath: string,
  test: TestCase
): Promise<TestResult> {
  try {
    const { actualOutput, errorOutput, exitCode }: ExecutionResult =
      await executeSingleTestInternal(
        PYTHON_PATH,
        scriptPath,
        test,
        MAX_EXECUTION_TIME
      );

    let isCorrect: boolean = false;
    // 移除輸出頭尾空白後進行比對
    let userOutputTrimmed: string = actualOutput.trim();

    if (exitCode === 0) {
      // 成功退出，比對輸出
      if (userOutputTrimmed === test.output.trim()) {
        isCorrect = true;
      }
    }

    if (errorOutput) {
      // 如果有標準錯誤輸出，通常視為執行失敗 (例如編譯錯誤或運行時錯誤)
      userOutputTrimmed += `\n[運行錯誤] ${errorOutput.trim()}`;
    }

    if (exitCode === null) {
      console.warn(`測試 ${test.id} 被外部終止或超時。`);
      // 超時錯誤的訊息已經在內部函式中加入，這裡只需確保正確返回
    }

    return {
      id: test.id,
      correct: isCorrect,
      userOutput: userOutputTrimmed,
    };
  } catch (error: any) {
    // 啟動失敗或致命錯誤
    console.error(`啟動或執行腳本錯誤 (Test ${test.id}):`, error);
    // 如果是因為找不到 python3，錯誤訊息會類似 "spawn python3 ENOENT"
    const errorMessage = error.code === 'ENOENT'
      ? `執行失敗：找不到 Python 直譯器 (${PYTHON_PATH})，請確認已安裝並設定環境變數。`
      : `執行失敗：${error.message}`;

    return {
      id: test.id,
      correct: false,
      userOutput: errorMessage,
    };
  }
}

/**
 * 內部函式：執行單個測試案例的 Python 程序。
 * @param pythonPath Python 執行檔的路徑。
 * @param scriptPath 待執行的腳本路徑。
 * @param test 測試案例物件。
 * @param timeoutMs 超時時間（毫秒）。
 * @returns 包含原始輸出和退出碼的 Promise。
 */
function executeSingleTestInternal(
  pythonPath: string,
  scriptPath: string,
  test: TestCase,
  timeoutMs: number
): Promise<ExecutionResult> {
  return new Promise((resolve, reject) => {
    let actualOutput: string = "";
    let errorOutput: string = "";

    try {
      const proc: ChildProcess = spawn(pythonPath, [scriptPath], {
        // 'pipe' for stdin, stdout, stderr
        stdio: ["pipe", "pipe", "pipe"],
      });
      currentPythonProcess = proc;

      // 設定超時計時器
      timeoutTimer = setTimeout(() => {
        if (proc) {
          stopProgram(proc); // 強制停止程序
          resolve({
            actualOutput: actualOutput + "\n[執行超時，已強制停止]",
            errorOutput: "超時錯誤",
            exitCode: null, // 使用 null 表示超時終止
          });
        }
      }, timeoutMs);

      // 寫入輸入數據並結束 stdin
      proc.stdin!.write(test.input);
      proc.stdin!.end();

      // 監聽 stdout 輸出
      proc.stdout!.on("data", (data) => {
        actualOutput += data.toString();
      });

      // 監聽 stderr 輸出
      proc.stderr!.on("data", (data) => {
        errorOutput += data.toString();
      });

      // 程序關閉事件 (正常退出或被信號終止)
      proc.on("close", (code: number | null) => {
        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
          timeoutTimer = null;
        }
        currentPythonProcess = null;
        resolve({
          actualOutput: actualOutput,
          errorOutput: errorOutput,
          exitCode: code,
        });
      });

      // 啟動程序錯誤事件
      proc.on("error", (err: Error) => {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        currentPythonProcess = null;
        reject(err);
      });
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * 外部函式：強制停止當前正在運行的 Python 程序 (如果存在)。
 * @param proc 要停止的程序實例 (可選，預設為全局 currentPythonProcess)。
 * @returns 是否成功停止程序。
 */
export function stopProgram(
  proc: ChildProcess | null = currentPythonProcess
): boolean {
  if (proc && !proc.killed) {
    console.warn("⚠️ 正在強制停止程序...");

    // 優先清除計時器
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
      timeoutTimer = null;
    }

    // 嘗試溫和終止
    proc.kill("SIGTERM");

    // 等待 500ms 後，如果還沒結束則強制終止
    setTimeout(() => {
      if (proc && !proc.killed) {
        proc.kill("SIGKILL");
        console.warn("程序已使用 SIGKILL 強制終止。");
      }
      // 清除全局引用
      if (currentPythonProcess === proc) {
        currentPythonProcess = null;
      }
    }, 500);
    return true;
  }
  return false;
}