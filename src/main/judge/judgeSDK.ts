import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';

export interface JudgerOptions {
  pythonPath?: string;
  judgeScriptPath?: string;
}

export interface JudgeRequest {
  source_code: string;
  input?: string;
  expected_output?: string;
  time_limit?: number;
  /**
   * Optional AbortSignal to cancel the execution execution.
   * When aborted, the judge process and the user code will be killed,
   * and the promise will resolve with a "TC" (Task Canceled) status.
   */
  signal?: AbortSignal;
}

export interface JudgeResult {
  status: string;
  user_code: string;
  expected_output: string;
  execution_time: string;
  error_message: string;
  user_output: string;
  input_test_case: string;
}

export class PythonJudger {
  private pythonPath: string;
  private judgeScriptPath: string;

  constructor(options: JudgerOptions = {}) {
    this.pythonPath = options.pythonPath || 'python3';
    this.judgeScriptPath = options.judgeScriptPath || path.join(__dirname, 'main.py');
  }

  /**
   * Run the judge on a piece of code asynchronously.
   *
   * @param params The judge request parameters
   * @returns A promise that resolves to the JudgeResult
   */
  public async run(params: JudgeRequest): Promise<JudgeResult> {
    return new Promise<JudgeResult>((resolve, reject) => {
      const createTCResponse = (): JudgeResult => ({
        status: 'TC',
        user_code: params.source_code,
        expected_output: params.expected_output || '',
        execution_time: '',
        error_message: 'Task canceled',
        user_output: '',
        input_test_case: params.input || ''
      });

      // 1) If already aborted, short-circuit
      if (params.signal?.aborted) {
        return resolve(createTCResponse());
      }

      // 2) Spawn judge
      const child: ChildProcess = spawn(this.pythonPath, [this.judgeScriptPath]);
      let wasAborted = false;

      // 3) Abort handling
      if (params.signal) {
        const abortHandler = () => {
          wasAborted = true;
          child.kill(); // POSIX: SIGTERM; Windows: TerminateProcess
        };
        params.signal.addEventListener('abort', abortHandler, { once: true });
        child.on('close', () => {
          params.signal?.removeEventListener('abort', abortHandler);
        });
      }

      let stdout = '';
      let stderr = '';

      // 4) Collect output
      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('error', (err: Error) => {
        reject(new Error(`Failed to start judge process: ${err.message}`));
      });

      // 5) Exit handling
      child.on('close', (_code: number | null) => {
        if (wasAborted) {
          resolve(createTCResponse());
          return;
        }

        if (!stdout && stderr) {
          reject(new Error(`Judge script failed. Stderr: ${stderr}`));
          return;
        }

        try {
          const result: JudgeResult = JSON.parse(stdout);
          resolve(result);
        } catch (e: any) {
          reject(
            new Error(
              `Failed to parse judge output. \nError: ${e.message}\nRaw Output: ${stdout}\nStderr: ${stderr}`
            )
          );
        }
      });

      // 6) Send payload
      const payload = JSON.stringify({
        source_code: params.source_code,
        input: params.input || '',
        expected_output: params.expected_output || '',
        time_limit: params.time_limit || 2.0
      });

      if (child.stdin) {
        child.stdin.write(payload);
        child.stdin.end();
      } else {
        reject(new Error('Failed to access child stdin'));
      }
    });
  }
}
