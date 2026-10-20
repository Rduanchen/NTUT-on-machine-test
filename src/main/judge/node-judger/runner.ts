import { spawn, execFile, ChildProcess } from 'child_process';
import pidusage from 'pidusage';

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
  timeTakenMs: number;
  peakMemoryBytes: number;
  killed: boolean;
  killReason?: 'TLE' | 'MLE' | 'OLE' | 'ABORTED';
}

export interface RunOptions {
  cmd: string;
  args: string[];
  input: string;
  timeLimitMs: number;
  memoryLimitBytes?: number;
  cwd: string;
  abortSignal?: AbortSignal;
}

const isWindows = process.platform === 'win32';

/**
 * Kill a child process in a cross-platform way.
 * - Unix: kill the entire process group with -pid
 * - Windows: use taskkill /T /F /PID to kill the process tree
 */
function killProcessTree(child: ChildProcess): void {
  const pid = child.pid;
  if (!pid) {
    child.kill('SIGKILL');
    return;
  }

  if (isWindows) {
    // /T = kill child processes, /F = force
    try {
      spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      try { child.kill(); } catch { /* already dead */ }
    }
  } else {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      try { child.kill('SIGKILL'); } catch { /* already dead */ }
    }
  }
}

export function runProcess(options: RunOptions): Promise<RunResult> {
  const { cmd, args, input, timeLimitMs, memoryLimitBytes, cwd, abortSignal } = options;

  return new Promise((resolve) => {
    const startTime = Date.now();
    let stdoutChunks: Buffer[] = [];
    let stderrChunks: Buffer[] = [];
    let stdoutLen = 0;
    let stderrLen = 0;
    const MAX_OUTPUT_BYTES = 16 * 1024 * 1024; // 16MB limit
    let killed = false;
    let killReason: 'TLE' | 'MLE' | 'OLE' | 'ABORTED' | undefined;
    let peakMemoryBytes = 0;
    let memoryMonitorInterval: ReturnType<typeof setInterval> | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    let memorySamplePending = false;
    let cancelMemoryQuery: (() => void) | null = null;
    let finished = false;

    let child: ChildProcess;

    try {
      child = spawn(cmd, args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
        // On Unix, create a process group so we can kill the whole tree
        ...(isWindows ? {} : { detached: true }),
      });
    } catch (err: any) {
      return resolve({
        stdout: '',
        stderr: err.message || 'Failed to spawn process',
        exitCode: -1,
        signal: null,
        timeTakenMs: 0,
        peakMemoryBytes: 0,
        killed: false,
      });
    }

    const stopMemoryMonitoring = () => {
      if (memoryMonitorInterval) clearInterval(memoryMonitorInterval);
      if (cancelMemoryQuery) {
        cancelMemoryQuery();
        cancelMemoryQuery = null;
      }
    };

    const killChild = (reason: 'TLE' | 'MLE' | 'OLE' | 'ABORTED') => {
      if (!killed) {
        killed = true;
        killReason = reason;
        stopMemoryMonitoring();
        killProcessTree(child);
      }
    };

    // Abort signal listener (for manual stop)
    if (abortSignal) {
      const onAbort = () => killChild('ABORTED');
      if (abortSignal.aborted) {
        killChild('ABORTED');
      } else {
        abortSignal.addEventListener('abort', onAbort, { once: true });
      }
    }

    // Time limit
    timeoutHandle = setTimeout(() => killChild('TLE'), timeLimitMs);

    // Memory monitoring
    if (memoryLimitBytes && child.pid) {
      memoryMonitorInterval = setInterval(() => {
        if (!child.pid || killed || finished || memorySamplePending) return;
        memorySamplePending = true;

        // Loading a PowerShell profile can launch conda on every sample.
        // Query directly without a shell/profile, and bound each query's lifetime.
        const memorySample = isWindows
          ? new Promise<number>((resolveSample, rejectSample) => {
            const query = execFile('powershell.exe', [
              '-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
              `(Get-Process -Id ${child.pid} -ErrorAction Stop).WorkingSet64`,
            ], { windowsHide: true, timeout: 1000, maxBuffer: 1024 }, (error, stdout) => {
              cancelMemoryQuery = null;
              if (error) return rejectSample(error);
              const memory = Number(stdout.trim());
              if (!stdout.trim() || !Number.isFinite(memory) || memory < 0) {
                return rejectSample(new Error('Invalid process memory sample'));
              }
              resolveSample(memory);
            });
            cancelMemoryQuery = () => { query.kill(); };
          })
          : pidusage(child.pid).then((stats) => stats.memory);

        memorySample
          .then((memory) => {
            if (finished || killed) return;
            if (memory > peakMemoryBytes) {
              peakMemoryBytes = memory;
            }
            if (memory > memoryLimitBytes) {
              killChild('MLE');
            }
          })
          .catch(() => { })
          .finally(() => { memorySamplePending = false; });
      }, 200);
    }

    child.stdout!.on('data', (chunk: Buffer) => {
      if (killed) return;
      stdoutChunks.push(chunk);
      stdoutLen += chunk.length;
      if (stdoutLen > MAX_OUTPUT_BYTES) {
        killChild('OLE');
      }
    });
    
    child.stderr!.on('data', (chunk: Buffer) => {
      if (killed) return;
      stderrChunks.push(chunk);
      stderrLen += chunk.length;
      if (stderrLen > MAX_OUTPUT_BYTES) {
        killChild('OLE');
      }
    });

    try {
      child.stdin!.write(input);
      child.stdin!.end();
    } catch { /* stdin may already be closed */ }

    child.on('close', (exitCode, signal) => {
      finished = true;
      const timeTakenMs = Date.now() - startTime;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      stopMemoryMonitoring();
      if (!isWindows) pidusage.clear();
      // The process is already gone: return completed samples instead of
      // waiting for another OS query outside the execution time limit.
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
        stderr: Buffer.concat(stderrChunks).toString('utf-8'),
        exitCode, signal: signal as string | null,
        timeTakenMs, peakMemoryBytes, killed, killReason,
      });
    });

    child.on('error', (err) => {
      finished = true;
      const timeTakenMs = Date.now() - startTime;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      stopMemoryMonitoring();
      if (!isWindows) pidusage.clear();
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
        stderr: err.message, exitCode: -1, signal: null,
        timeTakenMs, peakMemoryBytes: 0, killed: false,
      });
    });
  });
}
