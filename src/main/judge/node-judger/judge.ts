import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';
import {
  JudgeRequest,
  JudgeResult,
  JudgeHandle,
  JudgeCallback,
  TestCase,
  TestCaseResult,
  StatusCode,
  LanguageConfig,
} from './types';
import { LANGUAGE_CONFIGS } from './languages';
import { compareOutput } from './compare';
import { runProcess, RunResult } from './runner';

export class Judge {
  private defaultTimeLimit: number;
  private defaultMemoryLimit: number | undefined;

  constructor(options?: { defaultTimeLimit?: number; defaultMemoryLimit?: number }) {
    this.defaultTimeLimit = options?.defaultTimeLimit ?? 5000;
    this.defaultMemoryLimit = options?.defaultMemoryLimit;
  }

  /**
   * Run a judge request.
   * Returns a JudgeHandle with:
   *   - pid: a unique numeric id for this judge session
   *   - stop(): aborts all remaining test case executions
   *   - promise: resolves with the JudgeResult
   *
   * Optionally accepts a callback for convenience.
   */
  public run(request: JudgeRequest, callback?: JudgeCallback): JudgeHandle {
    const sessionId = Date.now() ^ (Math.random() * 0xffffffff);
    const abortController = new AbortController();

    const promise = this._execute(request, abortController.signal);

    // Wire up callback if provided
    if (callback) {
      promise
        .then((result) => callback(null, result))
        .catch((err) => callback(err instanceof Error ? err : new Error(String(err)), null));
    }

    return {
      pid: sessionId,
      stop: () => abortController.abort(),
      promise,
    };
  }

  // ─── Core execution pipeline ──────────────────────────────────────

  private async _execute(
    request: JudgeRequest,
    abortSignal: AbortSignal,
  ): Promise<JudgeResult> {
    const config = LANGUAGE_CONFIGS[request.language];
    if (!config) {
      return this._allSubtasksWithStatus(request, 'SE', `Unsupported language: ${request.language}`);
    }

    // 1. Create a temp working directory
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'judge-'));

    try {
      // 2. Write source code to file
      const sourceFileName = request.language === 'JAVA' ? 'Main.java' : `main${config.extension}`;
      const sourcePath = path.join(workDir, sourceFileName);
      fs.writeFileSync(sourcePath, request.codeString, 'utf-8');

      // 3. Compile if needed
      if (config.needsCompilation) {
        const compileResult = await this._compile(config, sourcePath, workDir, request.compilerPath);
        if (!compileResult.success) {
          return this._allSubtasksWithStatus(request, 'CE', compileResult.stderr);
        }
      }

      // 4. Determine the executable / runnable path
      const executablePath = this._getExecutablePath(config, sourcePath, workDir, request.language);

      // 5. Run all subtasks
      const timeLimit = request.timeLimit ?? this.defaultTimeLimit;
      const memoryLimit = request.memoryLimit ?? this.defaultMemoryLimit;

      const subtaskResults: TestCaseResult[][] = [];

      for (const subtask of request.subtasks) {
        const results: TestCaseResult[] = [];

        for (const testCase of subtask) {
          // Check abort before each test case
          if (abortSignal.aborted) {
            results.push(this._makeResult('ABORTED', testCase, '', 0));
            continue;
          }

          const result = await this._runTestCase(
            config,
            executablePath,
            testCase,
            timeLimit,
            memoryLimit,
            workDir,
            request.compareMode,
            request.compilerPath,
            abortSignal,
          );
          results.push(result);
        }

        subtaskResults.push(results);
      }

      return { subtasks: subtaskResults };
    } catch (err: any) {
      return this._allSubtasksWithStatus(request, 'SE', err.message);
    } finally {
      // Cleanup temp directory
      try {
        fs.rmSync(workDir, { recursive: true, force: true });
      } catch {
        // best effort
      }
    }
  }

  // ─── Compilation ──────────────────────────────────────────────────

  private _compile(
    config: LanguageConfig,
    sourcePath: string,
    workDir: string,
    compilerPath?: string,
  ): Promise<{ success: boolean; stderr: string }> {
    return new Promise((resolve) => {
      const outputPath = path.join(workDir, 'main');
      const { cmd, args } = config.compile!(sourcePath, outputPath, compilerPath);

      const proc = spawn(cmd, args, {
        cwd: workDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30000, // 30s compile timeout
      });

      let stderr = '';
      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf-8');
      });

      proc.on('close', (code) => {
        resolve({ success: code === 0, stderr });
      });

      proc.on('error', (err) => {
        resolve({ success: false, stderr: err.message });
      });
    });
  }

  // ─── Single test case execution ───────────────────────────────────

  private async _runTestCase(
    config: LanguageConfig,
    executablePath: string,
    testCase: TestCase,
    timeLimitMs: number,
    memoryLimitBytes: number | undefined,
    workDir: string,
    compareMode: 'strict' | 'loose',
    compilerPath?: string,
    abortSignal?: AbortSignal,
  ): Promise<TestCaseResult> {
    const { cmd, args } = config.run(executablePath, compilerPath);

    let runResult: RunResult;
    try {
      runResult = await runProcess({
        cmd,
        args,
        input: testCase.input,
        timeLimitMs,
        memoryLimitBytes,
        cwd: workDir,
        abortSignal,
      });
    } catch (err: any) {
      return this._makeResult('SE', testCase, '', 0, err.message);
    }

    // Determine status code
    let statusCode: StatusCode;

    if (runResult.killed) {
      switch (runResult.killReason) {
        case 'TLE':
          statusCode = 'TLE';
          break;
        case 'MLE':
          statusCode = 'MLE';
          break;
        case 'ABORTED':
          statusCode = 'ABORTED';
          break;
        default:
          statusCode = 'RE';
      }
    } else if (runResult.exitCode !== 0) {
      statusCode = 'RE';
    } else if (compareOutput(runResult.stdout, testCase.output, compareMode)) {
      statusCode = 'AC';
    } else {
      statusCode = 'WA';
    }

    return this._makeResult(
      statusCode,
      testCase,
      runResult.stdout,
      runResult.timeTakenMs,
      runResult.stderr || undefined,
      runResult.peakMemoryBytes,
    );
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  private _getExecutablePath(
    config: LanguageConfig,
    sourcePath: string,
    workDir: string,
    language: string,
  ): string {
    if (!config.needsCompilation) {
      return sourcePath;
    }
    if (language === 'JAVA') {
      return sourcePath; // We pass Main.java, run() extracts class name
    }
    return path.join(workDir, 'main');
  }

  private _makeResult(
    statusCode: StatusCode,
    testCase: TestCase,
    userOutput: string,
    timeMs: number,
    error?: string,
    memoryBytes?: number,
  ): TestCaseResult {
    const result: TestCaseResult = {
      statusCode,
      input: testCase.input,
      expectingOutput: testCase.output,
      userOutput,
      time: `${Math.round(timeMs)}ms`,
    };
    if (memoryBytes !== undefined && memoryBytes > 0) {
      result.memory = `${Math.round(memoryBytes / 1024)}KB`;
    }
    if (error) {
      result.error = error;
    }
    return result;
  }

  private _allSubtasksWithStatus(
    request: JudgeRequest,
    statusCode: StatusCode,
    errorMsg: string,
  ): JudgeResult {
    return {
      subtasks: request.subtasks.map((subtask) =>
        subtask.map((tc) => this._makeResult(statusCode, tc, '', 0, errorMsg)),
      ),
    };
  }
}