import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { store } from '../store/store';
import { PythonJudger, JudgeResult } from './judgeSDK';

// --- 1. 介面定義 (Interfaces) ---

interface TestCase {
  id: string;
  input: string;
  output: string;
}

interface TestResult {
  id: string;
  statusCode: string;
  correct: boolean;
  userOutput: string;
  execution_time: string;
  error?: string;
}

interface TestGroup {
  title: string;
  id: number;
  openTestCases?: TestCase[];
  hiddenTestCases?: TestCase[];
}

interface GroupResult {
  title: string;
  id: number;
  testCasesResults: TestResult[];
  testCaseAmount: number;
  correctCount: number;
}

interface RunTestsResult {
  groupResults: GroupResult[];
  testCaseAmount: number;
  correctCount: number;
}

// --- 2. Python 路徑處理 ---

const getBundledPythonDir = (): string => {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'python');
  }
  return path.join(app.getAppPath(), 'resources', 'python');
};

const getPythonPath = (): string => {
  const pythonDir = getBundledPythonDir();
  const bundledCandidates =
    process.platform === 'win32'
      ? [path.join(pythonDir, 'python.exe')]
      : [
        path.join(pythonDir, 'bin', 'python3'),
        path.join(pythonDir, 'python3'),
        path.join(pythonDir, 'bin', 'python')
      ];

  for (const p of bundledCandidates) {
    if (fs.existsSync(p)) return p;
  }

  if (process.platform === 'win32') {
    throw new Error(`找不到內建 Python: ${bundledCandidates.join(', ')}`);
  }
  return 'python3';
};

// --- 3. 全域狀態 ---

const DEFAULT_MAX_EXECUTION_TIME = 25000;
let MAX_EXECUTION_TIME: number = DEFAULT_MAX_EXECUTION_TIME;

/** 當前的 AbortController，用於停止評測 */
let currentAbortController: AbortController | null = null;

/** * 新增：全域停止標記
 * 用來通知迴圈不要再執行下一個測試案例
 */
let isStopRequested = false;

const createJudger = (): PythonJudger => {
  let pythonPath = 'python3';
  try {
    pythonPath = getPythonPath();
  } catch (e) {
    pythonPath = '__missing_python__';
  }

  const judgeScriptPath = path.join(getBundledPythonDir(), 'main.py');
  console.log('Using Python Path:', pythonPath);
  console.log('Using Judge Script:', judgeScriptPath);

  return new PythonJudger({
    pythonPath,
    judgeScriptPath
  });
};

// --- 4. 核心執行函式 ---

export async function runPythonTestsAPI(
  scriptPath: string,
  groupedTestCases: TestGroup[]
): Promise<RunTestsResult> {
  console.log(`Test Groups: ...`);

  // 重置停止狀態
  isStopRequested = false;

  const groupResults: GroupResult[] = [];
  let testCaseAmount = 0;
  let correctCount = 0;

  MAX_EXECUTION_TIME = store.getConfig().maxExecutionTime || DEFAULT_MAX_EXECUTION_TIME;
  const timeLimitSeconds = MAX_EXECUTION_TIME / 1000;
  // const timeLimitSeconds = 5; // 暫時固定為 5 秒測試

  const judger = createJudger();

  // [修改 1] 外層迴圈檢查停止標記
  for (const group of groupedTestCases) {
    if (isStopRequested) break;

    const testCasesResults: TestResult[] = [];
    let groupTestCaseAmount = 0;
    let groupCorrectCount = 0;

    const processTestCases = async (tests?: TestCase[]) => {
      if (!Array.isArray(tests)) return;

      for (const test of tests) {
        // [修改 2] 內層迴圈檢查停止標記：如果使用者按了停止，直接跳出迴圈
        if (isStopRequested) break;

        const result = await runSingleCase(judger, scriptPath, test, timeLimitSeconds);
        testCasesResults.push(result);

        // 如果該案例是因為「手動停止」而結束的，我們也應該在這裡 break
        if (result.statusCode === 'STOP') {
          break;
        }

        if (result.correct) {
          groupCorrectCount++;
          correctCount++;
        }
        groupTestCaseAmount++;
        testCaseAmount++;
      }
    };

    await processTestCases(group.openTestCases);
    await processTestCases(group.hiddenTestCases);

    // 如果沒有執行任何測試（因為剛開始就被停止），可能不想 push 空結果，
    // 但為了介面顯示一致，保留 push，但結果會是空的
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

async function runSingleCase(
  judger: PythonJudger,
  scriptPath: string,
  test: TestCase,
  timeLimitSeconds: number
): Promise<TestResult> {
  // 檢查是否已經被要求停止
  if (isStopRequested) {
    return {
      id: test.id,
      statusCode: 'STOP',
      correct: false,
      userOutput: '',
      execution_time: '',
      error: 'Tests stopped by user.'
    };
  }

  let sourceCode = '';
  try {
    sourceCode = fs.readFileSync(scriptPath, 'utf-8');
  } catch (err: any) {
    return {
      id: test.id,
      statusCode: 'ER',
      correct: false,
      userOutput: '',
      execution_time: '',
      error: `無法讀取待測試檔案：${err.message}`
    };
  }

  currentAbortController = new AbortController();
  const { signal } = currentAbortController;

  let timeoutTimer: NodeJS.Timeout | null = null;

  try {
    // 逾時計時
    timeoutTimer = setTimeout(() => {
      // 這是逾時觸發的 abort，不是使用者按停止
      currentAbortController?.abort();
    }, timeLimitSeconds * 1000);

    const payload = {
      source_code: sourceCode,
      input: test.input,
      expected_output: test.output,
      time_limit: timeLimitSeconds,
      signal
    };

    // 執行
    const judgeResult: JudgeResult = await judger.run({
      source_code: sourceCode,
      input: test.input,
      expected_output: test.output,
      time_limit: timeLimitSeconds,
      signal
    });

    const statusCode = judgeResult.status || 'ER';
    const correct = statusCode.includes('AC');
    const userOutput = judgeResult.user_output ?? '';
    const execution_time = judgeResult.execution_time ?? '';
    const error = statusCode === 'AC' ? undefined : judgeResult.error_message;

    return {
      id: test.id,
      statusCode,
      correct,
      userOutput,
      execution_time,
      error
    };
  } catch (error: any) {
    // [修改 3] 捕捉錯誤時，區分是「手動停止」還是「系統/Python錯誤」

    // 情況 A: 使用者按了停止
    if (isStopRequested) {
      return {
        id: test.id,
        statusCode: 'STOP',
        correct: false,
        userOutput: '',
        execution_time: '',
        error: 'Execution stopped by user.'
      };
    }

    // 情況 B: AbortError 但 isStopRequested 為 false -> 代表是 setTimeout 觸發的 TLE
    if (error.name === 'AbortError' || error.code === 'ABORT_ERR') {
      return {
        id: test.id,
        statusCode: 'TLE',
        correct: false,
        userOutput: '',
        execution_time: `${timeLimitSeconds * 1000}ms`,
        error: 'Time Limit Exceeded (System Timeout)'
      };
    }

    // 情況 C: 其他錯誤 (Python 找不到, 權限不足等)
    const message =
      error?.code === 'ENOENT'
        ? `執行失敗：找不到 Python 直譯器或 Script。`
        : `執行失敗：${error?.message || '未知錯誤'}`;

    return {
      id: test.id,
      statusCode: 'ER',
      correct: false,
      userOutput: '',
      execution_time: '',
      error: message
    };
  } finally {
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
    }
    currentAbortController = null;
  }
}

/**
 * 停止目前的評測程序。
 */
export function stopProgram(): boolean {
  // [修改 4] 設定停止標記
  isStopRequested = true;

  if (currentAbortController) {
    currentAbortController.abort(); // 這會觸發 runSingleCase 的 catch block
    currentAbortController = null;
    return true;
  }
  return false;
}
