import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';

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

/**
 * 取得「python 資料夾」根目錄。
 * - dev: <appPath>/src/main/judge/python
 * - packaged: <resourcesPath>/python   (對應 electron-builder extraResources.to: python)
 */
const getBundledPythonDir = (): string => {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'python');
  }
  return path.join(app.getAppPath(), 'src', 'main', 'judge', 'python');
};

/**
 * 取得 python 執行檔路徑（優先使用內建 interpreter；找不到才 fallback 到系統 python3）
 */
const getPythonPath = (): string => {
  const pythonDir = getBundledPythonDir();

  // 依平台推定內建 python 的位置（請依你的 python 資料夾實際結構調整）
  const bundledCandidates =
    process.platform === 'win32'
      ? [path.join(pythonDir, 'python.exe')]
      : [
        // 常見：<pythonDir>/bin/python3
        path.join(pythonDir, 'bin', 'python3'),
        // 有些包是 python3 在根目錄
        path.join(pythonDir, 'python3'),
        // 也可能是 python 在 bin
        path.join(pythonDir, 'bin', 'python')
      ];

  for (const p of bundledCandidates) {
    if (fs.existsSync(p)) return p;
  }

  // fallback（可選）：若你希望「一定要用內建」那就直接 throw
  if (process.platform === 'win32') {
    // windows 沒內建基本上就一定失敗，拋出讓外層顯示更清楚訊息
    throw new Error(`找不到內建 Python: ${bundledCandidates.join(', ')}`);
  }

  // mac/linux fallback 到系統 python3
  return 'python3';
};

let PYTHON_PATH: string;
try {
  PYTHON_PATH = getPythonPath();
} catch (e) {
  // 讓後續錯誤訊息能顯示出來
  PYTHON_PATH = '__missing_python__';
}

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
  // 每次執行前重新解析一次，避免 packaged/dev 狀態或路徑變動造成問題
  try {
    PYTHON_PATH = getPythonPath();
  } catch (e) {
    PYTHON_PATH = '__missing_python__';
  }

  const groupResults: GroupResult[] = [];
  let testCaseAmount: number = 0;
  let correctCount: number = 0;

  for (const group of groupedTestCases) {
    const testCasesResults: TestResult[] = [];
    let groupTestCaseAmount: number = 0;
    let groupCorrectCount: number = 0;

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

    await processTestCases(group.openTestCases);
    await processTestCases(group.hiddenTestCases);

    groupResults.push({
      title: group.title,
      id: group.id,
      testCasesResults,
      testCaseAmount: groupTestCaseAmount,
      correctCount: groupCorrectCount
    });
  }

  return {
    groupResults,
    testCaseAmount,
    correctCount
  };
}

async function runSingleCase(scriptPath: string, test: TestCase): Promise<TestResult> {
  try {
    if (PYTHON_PATH === '__missing_python__') {
      throw Object.assign(new Error('Missing bundled python'), { code: 'ENOENT' });
    }

    const { actualOutput, errorOutput, exitCode }: ExecutionResult =
      await executeSingleTestInternal(PYTHON_PATH, scriptPath, test, MAX_EXECUTION_TIME);

    let isCorrect: boolean = false;
    let userOutputTrimmed: string = actualOutput.trim();

    if (exitCode === 0) {
      if (userOutputTrimmed === test.output.trim()) {
        isCorrect = true;
      }
    }

    if (errorOutput) {
      userOutputTrimmed += `\n[運行錯誤] ${errorOutput.trim()}`;
    }

    if (exitCode === null) {
      console.warn(`測試 ${test.id} 被外部終止或超時。`);
    }

    return {
      id: test.id,
      correct: isCorrect,
      userOutput: userOutputTrimmed
    };
  } catch (error: any) {
    console.error(`啟動或執行腳本錯誤 (Test ${test.id}):`, error);

    const errorMessage =
      error.code === 'ENOENT'
        ? `執行失敗：找不到 Python 直譯器 (${PYTHON_PATH})。打包後請確認 extraResources 已包含 python，且 mac/linux 需有可執行權限(chmod +x)。`
        : `執行失敗：${error.message}`;

    return {
      id: test.id,
      correct: false,
      userOutput: errorMessage
    };
  }
}

function executeSingleTestInternal(
  pythonPath: string,
  scriptPath: string,
  test: TestCase,
  timeoutMs: number
): Promise<ExecutionResult> {
  return new Promise((resolve, reject) => {
    let actualOutput: string = '';
    let errorOutput: string = '';

    try {
      const proc: ChildProcess = spawn(pythonPath, [scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      currentPythonProcess = proc;

      timeoutTimer = setTimeout(() => {
        if (proc) {
          stopProgram(proc);
          resolve({
            actualOutput: actualOutput + '\n[執行超時，已強制停止]',
            errorOutput: '超時錯誤',
            exitCode: null
          });
        }
      }, timeoutMs);

      proc.stdin!.write(test.input);
      proc.stdin!.end();

      proc.stdout!.on('data', (data) => {
        actualOutput += data.toString();
      });

      proc.stderr!.on('data', (data) => {
        errorOutput += data.toString();
      });

      proc.on('close', (code: number | null) => {
        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
          timeoutTimer = null;
        }
        currentPythonProcess = null;
        resolve({
          actualOutput,
          errorOutput,
          exitCode: code
        });
      });

      proc.on('error', (err: Error) => {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        currentPythonProcess = null;
        reject(err);
      });
    } catch (e) {
      reject(e);
    }
  });
}

export function stopProgram(proc: ChildProcess | null = currentPythonProcess): boolean {
  if (proc && !proc.killed) {
    console.warn('⚠️ 正在強制停止程序...');

    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
      timeoutTimer = null;
    }

    proc.kill('SIGTERM');

    setTimeout(() => {
      if (proc && !proc.killed) {
        proc.kill('SIGKILL');
        console.warn('程序已使用 SIGKILL 強制終止。');
      }
      if (currentPythonProcess === proc) {
        currentPythonProcess = null;
      }
    }, 500);

    return true;
  }
  return false;
}