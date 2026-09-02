import { spawn, type ChildProcess } from 'child_process';
import type {
  EnvironmentDiagnosticKind,
  EnvironmentDiagnosticResult,
  EnvironmentLanguageResult,
  EnvironmentToolResult
} from '../../../common/types';
import { Judge } from './judge';
import type {
  EnvironmentDiagnosticProfile,
  EnvironmentLanguageProfile,
  EnvironmentToolProbe
} from './environment-profiles';

const MAX_DETAIL_LENGTH = 4_000;
const TOOL_TIMEOUT_MS = 5_000;

function truncate(value: string): string {
  const normalized = value.trim();
  return normalized.length <= MAX_DETAIL_LENGTH
    ? normalized
    : `${normalized.slice(0, MAX_DETAIL_LENGTH)}…`;
}

function terminate(child: ChildProcess): void {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    killer.unref();
  } else {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      try {
        child.kill('SIGKILL');
      } catch {
        /* already exited */
      }
    }
  }
}

export async function probeEnvironmentTool(
  probe: EnvironmentToolProbe,
  signal: AbortSignal
): Promise<EnvironmentToolResult> {
  return new Promise((resolve) => {
    let settled = false;
    let output = '';
    let child: ChildProcess;
    const finish = (result: EnvironmentToolResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      resolve(result);
    };
    const onAbort = (): void => {
      terminate(child);
      finish({ tool: probe.name, status: 'failed', version: null, summary: '檢查已取消' });
    };
    const timer = setTimeout(() => {
      terminate(child);
      finish({
        tool: probe.name,
        status: 'failed',
        version: null,
        summary: `版本檢查逾時（${TOOL_TIMEOUT_MS}ms）`
      });
    }, TOOL_TIMEOUT_MS);

    try {
      child = spawn(probe.command, probe.args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        ...(process.platform === 'win32' ? {} : { detached: true })
      });
    } catch (error) {
      finish({
        tool: probe.name,
        status: 'failed',
        version: null,
        summary: truncate(String(error))
      });
      return;
    }

    signal.addEventListener('abort', onAbort, { once: true });
    const append = (chunk: Buffer): void => {
      if (output.length < MAX_DETAIL_LENGTH + 1) output += chunk.toString('utf8');
    };
    child.stdout?.on('data', append);
    child.stderr?.on('data', append);
    child.on('error', (error) =>
      finish({
        tool: probe.name,
        status: 'failed',
        version: null,
        summary: truncate(error.message)
      })
    );
    child.on('close', (code) => {
      const version = truncate(output);
      const passed = code === 0 && version.length > 0;
      finish({
        tool: probe.name,
        status: passed ? 'passed' : 'failed',
        version: passed ? version.split(/\r?\n/)[0] : null,
        summary: passed ? version : version || `無法執行 ${probe.command}（exit ${String(code)}）`
      });
    });
    if (signal.aborted) onAbort();
  });
}

function parseMetric(value?: string): number | null {
  if (!value) return null;
  const match = value.match(/([0-9.]+)/);
  if (!match) return null;
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return null;
  return value.toLowerCase().includes('kb') ? Math.round(number * 1024) : Math.round(number);
}

export async function runEnvironmentDiagnostic(
  profile: EnvironmentLanguageProfile,
  kind: EnvironmentDiagnosticKind,
  signal: AbortSignal
): Promise<EnvironmentDiagnosticResult> {
  const diagnostic: EnvironmentDiagnosticProfile = profile[kind];
  const expectedStatus = kind === 'smoke' ? 'AC' : kind.toUpperCase();
  const judge = new Judge();
  const handle = judge.run({
    language: profile.judgeLanguage,
    codeString: diagnostic.source,
    compareMode: 'strict',
    timeLimit: diagnostic.timeLimitMs,
    memoryLimit: diagnostic.memoryLimitBytes,
    subtasks: [[{ input: '', output: kind === 'smoke' ? 'ENV_CHECK_OK\n' : '' }]]
  });
  const onAbort = (): void => handle.stop();
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    const result = await handle.promise;
    const item = result.subtasks[0]?.[0];
    const passed = item?.statusCode === expectedStatus;
    const details = truncate([item?.error, item?.userOutput].filter(Boolean).join('\n'));
    return {
      kind,
      status: passed ? 'passed' : 'failed',
      durationMs: parseMetric(item?.time) ?? 0,
      peakMemoryBytes: parseMetric(item?.memory),
      summary: passed
        ? `${kind.toUpperCase()} 分類正確`
        : `預期 ${expectedStatus}，實際 ${item?.statusCode ?? '無結果'}`,
      technicalDetails: details || null
    };
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

function notRun(kind: EnvironmentDiagnosticKind): EnvironmentDiagnosticResult {
  return {
    kind,
    status: 'failed',
    durationMs: 0,
    peakMemoryBytes: null,
    summary: '工具檢查未通過，未執行',
    technicalDetails: null
  };
}

export class EnvironmentCheckRunner {
  public async runLanguage(
    profile: EnvironmentLanguageProfile,
    signal: AbortSignal
  ): Promise<EnvironmentLanguageResult> {
    const startedAt = new Date().toISOString();
    const tools: EnvironmentToolResult[] = [];
    for (const tool of profile.tools) {
      if (signal.aborted) throw new DOMException('Environment check aborted', 'AbortError');
      tools.push(await probeEnvironmentTool(tool, signal));
    }
    if (signal.aborted) throw new DOMException('Environment check aborted', 'AbortError');

    const checks: EnvironmentDiagnosticResult[] = [];
    if (tools.some((tool) => tool.status === 'failed')) {
      checks.push(notRun('smoke'), notRun('tle'), notRun('mle'));
    } else {
      for (const kind of ['smoke', 'tle', 'mle'] as const) {
        checks.push(await runEnvironmentDiagnostic(profile, kind, signal));
        if (signal.aborted) throw new DOMException('Environment check aborted', 'AbortError');
      }
    }
    const passed =
      tools.every((tool) => tool.status === 'passed') &&
      checks.every((check) => check.status === 'passed');
    return {
      language: profile.language,
      status: passed ? 'passed' : 'failed',
      tools,
      checks,
      startedAt,
      completedAt: new Date().toISOString()
    };
  }
}
