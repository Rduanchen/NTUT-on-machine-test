import { describe, expect, it } from 'vitest';
import {
  EnvironmentCheckRunner,
  probeEnvironmentTool
} from '../../src/main/judge/node-judger/environment-check-runner';
import { ENVIRONMENT_LANGUAGE_PROFILES } from '../../src/main/judge/node-judger/environment-profiles';

describe('environment check runner', () => {
  it('reports a process spawn error without throwing', async () => {
    const result = await probeEnvironmentTool(
      { name: 'missing', command: '__missing_environment_tool__', args: [] },
      new AbortController().signal
    );
    expect(result.status).toBe('failed');
    expect(result.summary.length).toBeGreaterThan(0);
  });

  it('captures and bounds tool output', async () => {
    const result = await probeEnvironmentTool(
      { name: 'node', command: process.execPath, args: ['-e', 'console.log("x".repeat(6000))'] },
      new AbortController().signal
    );
    expect(result.status).toBe('passed');
    expect(result.summary.length).toBeLessThanOrEqual(4_001);
  });

  it('aborts a running tool and cleans it up', async () => {
    const controller = new AbortController();
    const pending = probeEnvironmentTool(
      { name: 'node', command: process.execPath, args: ['-e', 'setInterval(()=>{}, 1000)'] },
      controller.signal
    );
    controller.abort();
    await expect(pending).resolves.toMatchObject({ status: 'failed', summary: '檢查已取消' });
  });

  it('classifies real smoke, TLE, and MLE behavior for the bundled Node runtime', async () => {
    const result = await new EnvironmentCheckRunner().runLanguage(
      ENVIRONMENT_LANGUAGE_PROFILES.JavaScript,
      new AbortController().signal
    );
    expect(result.tools).toEqual([expect.objectContaining({ status: 'passed' })]);
    expect(result.checks.map((check) => [check.kind, check.status])).toEqual([
      ['smoke', 'passed'],
      ['tle', 'passed'],
      ['mle', 'passed']
    ]);
    expect(result.status).toBe('passed');
  }, 15_000);
});
