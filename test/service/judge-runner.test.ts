import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
  execFile: vi.fn(),
  pidusage: Object.assign(vi.fn(() => new Promise(() => {})), { clear: vi.fn() }),
}));

vi.mock('child_process', () => ({ spawn: mocks.spawn, execFile: mocks.execFile }));
vi.mock('pidusage', () => ({ default: mocks.pidusage }));

function fakeChild(pid: number) {
  return Object.assign(new EventEmitter(), {
    pid,
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    stdin: { write: vi.fn(), end: vi.fn() },
    kill: vi.fn(),
  });
}

describe('Windows judge memory monitoring', () => {
  const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
  let child: ReturnType<typeof fakeChild>;
  let query: ReturnType<typeof fakeChild>;
  let runProcess: typeof import('../../src/main/judge/node-judger/runner').runProcess;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.resetModules();
    Object.defineProperty(process, 'platform', { value: 'win32' });
    child = fakeChild(123);
    query = fakeChild(456);
    mocks.spawn.mockReturnValue(child);
    mocks.execFile.mockReturnValue(query);
    ({ runProcess } = await import('../../src/main/judge/node-judger/runner'));
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    Object.defineProperty(process, 'platform', platformDescriptor);
  });

  function run(memoryLimitBytes = 128 * 1024 * 1024) {
    return runProcess({
      cmd: 'python', args: ['main.py'], input: '', cwd: '.',
      timeLimitMs: 5000, memoryLimitBytes,
    });
  }

  it('uses a bounded PowerShell query without loading the conda profile', async () => {
    const result = run();
    await vi.advanceTimersByTimeAsync(200);
    expect(mocks.execFile).toHaveBeenCalledWith(
      'powershell.exe',
      expect.arrayContaining(['-NoProfile', '-NonInteractive', '-Command',
        expect.stringContaining('Get-Process -Id 123')]),
      expect.objectContaining({ windowsHide: true, timeout: 1000, maxBuffer: 1024 }),
      expect.any(Function),
    );
    expect(mocks.pidusage).not.toHaveBeenCalled();
    child.emit('close', 0, null);
    await result;
  });

  it('keeps only one memory query in flight across sampling intervals', async () => {
    const result = run();
    await vi.advanceTimersByTimeAsync(800);
    expect(mocks.execFile).toHaveBeenCalledTimes(1);
    child.emit('close', 0, null);
    await result;
  });

  it('returns immediately on program exit and cancels the unfinished query', async () => {
    const result = run();
    await vi.advanceTimersByTimeAsync(200);
    child.emit('close', 0, null);
    await expect(result).resolves.toMatchObject({ exitCode: 0, peakMemoryBytes: 0 });
    expect(query.kill).toHaveBeenCalledTimes(1);
    expect(mocks.execFile).toHaveBeenCalledTimes(1);
    expect(mocks.pidusage).not.toHaveBeenCalled();
  });

  it('reports the highest completed sample without taking an exit sample', async () => {
    const result = run();
    await vi.advanceTimersByTimeAsync(200);
    mocks.execFile.mock.calls[0][3](null, '2048\r\n', '');
    await vi.advanceTimersByTimeAsync(200);
    mocks.execFile.mock.calls[1][3](null, '1024\r\n', '');
    await Promise.resolve();
    child.emit('close', 0, null);
    await expect(result).resolves.toMatchObject({ peakMemoryBytes: 2048, killed: false });
    expect(mocks.execFile).toHaveBeenCalledTimes(2);
  });

  it('allows another sample after a query timeout or error', async () => {
    const result = run();
    await vi.advanceTimersByTimeAsync(200);
    mocks.execFile.mock.calls[0][3](new Error('query timed out'), '', '');
    await vi.advanceTimersByTimeAsync(200);
    expect(mocks.execFile).toHaveBeenCalledTimes(2);
    child.emit('close', 0, null);
    await result;
  });

  it('still kills a program that exceeds its memory limit', async () => {
    const result = run(1024);
    await vi.advanceTimersByTimeAsync(200);
    mocks.execFile.mock.calls[0][3](null, '2048', '');
    await Promise.resolve();
    expect(mocks.spawn).toHaveBeenCalledWith('taskkill', ['/PID', '123', '/T', '/F'], expect.any(Object));
    child.emit('close', null, 'SIGKILL');
    await expect(result).resolves.toMatchObject({ killed: true, killReason: 'MLE' });
  });
});
