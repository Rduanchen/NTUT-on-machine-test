import { spawn, ChildProcess } from 'child_process';
import pidusage, { Stat as PidUsageStat } from 'pidusage';

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
  timeTakenMs: number;
  peakMemoryBytes: number;
  killed: boolean;
  killReason?: 'TLE' | 'MLE' | 'ABORTED';
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
    let killed = false;
    let killReason: 'TLE' | 'MLE' | 'ABORTED' | undefined;
    let peakMemoryBytes = 0;
    let memoryMonitorInterval: ReturnType<typeof setInterval> | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

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

    const killChild = (reason: 'TLE' | 'MLE' | 'ABORTED') => {
      if (!killed) {
        killed = true;
        killReason = reason;
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
        if (!child.pid || killed) return;
        pidusage(child.pid)
          .then((stats: PidUsageStat) => {
            if (stats.memory > peakMemoryBytes) {
              peakMemoryBytes = stats.memory;
            }
            if (memoryLimitBytes && stats.memory > memoryLimitBytes) {
              killChild('MLE');
            }
          })
          .catch(() => { });
      }, 20);
    }

    child.stdout!.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr!.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

    try {
      child.stdin!.write(input);
      child.stdin!.end();
    } catch { /* stdin may already be closed */ }

    child.on('close', (exitCode, signal) => {
      const timeTakenMs = Date.now() - startTime;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (memoryMonitorInterval) clearInterval(memoryMonitorInterval);

      if (child.pid && !killed) {
        pidusage(child.pid)
          .then((stats: PidUsageStat) => {
            if (stats.memory > peakMemoryBytes) peakMemoryBytes = stats.memory;
          })
          .catch(() => { })
          .finally(() => {
            pidusage.clear();
            resolve({
              stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
              stderr: Buffer.concat(stderrChunks).toString('utf-8'),
              exitCode, signal: signal as string | null,
              timeTakenMs, peakMemoryBytes, killed, killReason,
            });
          });
      } else {
        pidusage.clear();
        resolve({
          stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
          stderr: Buffer.concat(stderrChunks).toString('utf-8'),
          exitCode, signal: signal as string | null,
          timeTakenMs, peakMemoryBytes, killed, killReason,
        });
      }
    });

    child.on('error', (err) => {
      const timeTakenMs = Date.now() - startTime;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (memoryMonitorInterval) clearInterval(memoryMonitorInterval);
      pidusage.clear();
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
        stderr: err.message, exitCode: -1, signal: null,
        timeTakenMs, peakMemoryBytes: 0, killed: false,
      });
    });
  });
}