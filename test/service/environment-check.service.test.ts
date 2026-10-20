import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  EnvironmentLanguageResult,
  ExamConfig,
  SupportedLanguage
} from '../../src/common/types';
import type { EnvironmentLanguageProfile } from '../../src/main/judge/node-judger/environment-profiles';
import {
  EnvironmentCheckService,
  extractRequiredLanguages
} from '../../src/main/services/environment-check.service';
import { ramStore } from '../../src/main/services/ramStore.service';

function config(languages: SupportedLanguage[]): ExamConfig {
  return {
    testTitle: 'test',
    description: '',
    judgerSettings: { timeLimit: 1000, memoryLimit: 64 },
    accessibleUsers: [],
    sections: [
      {
        id: 's',
        title: 's',
        maxScore: 100,
        puzzles: languages.map((language, index) => ({
          id: String(index),
          title: language,
          language,
          subtasks: []
        }))
      }
    ]
  };
}

function result(
  language: SupportedLanguage,
  status: 'passed' | 'failed' = 'passed'
): EnvironmentLanguageResult {
  return {
    language,
    status,
    tools: [],
    checks: [],
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString()
  };
}

describe('EnvironmentCheckService', () => {
  beforeEach(() => ramStore.clear());

  it('deduplicates languages in canonical order and passes an empty config', async () => {
    expect(extractRequiredLanguages(config(['Java', 'C', 'Java']))).toEqual(['C', 'Java']);
    const executor = { runLanguage: vi.fn() };
    const report = await new EnvironmentCheckService(executor).applyConfig(config([]));
    expect(report.status).toBe('PASSED');
    expect(executor.runLanguage).not.toHaveBeenCalled();
  });

  it('aggregates language failures without mutating student or judge state', async () => {
    ramStore.studentInfo = { id: 's1', name: 'Student' };
    const priorResults = ramStore.testResults;
    const executor = {
      runLanguage: vi.fn(async (profile: EnvironmentLanguageProfile) =>
        result(profile.language, profile.language === 'Cpp' ? 'failed' : 'passed')
      )
    };
    const report = await new EnvironmentCheckService(executor).applyConfig(config(['C', 'Cpp']));
    expect(report.status).toBe('FAILED');
    expect(ramStore.studentInfo.id).toBe('s1');
    expect(ramStore.testResults).toBe(priorResults);
  });

  it('reuses a passed language fingerprint and retry forces a new run', async () => {
    const executor = {
      runLanguage: vi.fn(async (profile: EnvironmentLanguageProfile) => result(profile.language))
    };
    const service = new EnvironmentCheckService(executor);
    await service.applyConfig(config(['Python']));
    await service.applyConfig(config(['Python', 'Python']));
    expect(executor.runLanguage).toHaveBeenCalledTimes(1);
    await service.retry();
    expect(executor.runLanguage).toHaveBeenCalledTimes(2);
  });

  it('cancels a replaced run and suppresses its stale completion', async () => {
    let resolveFirst!: (value: EnvironmentLanguageResult) => void;
    let firstSignal!: AbortSignal;
    const executor = {
      runLanguage: vi.fn((profile: EnvironmentLanguageProfile, signal: AbortSignal) => {
        if (profile.language === 'C') {
          firstSignal = signal;
          return new Promise<EnvironmentLanguageResult>((resolve) => {
            resolveFirst = resolve;
          });
        }
        return Promise.resolve(result(profile.language));
      })
    };
    const service = new EnvironmentCheckService(executor);
    const first = service.applyConfig(config(['C']));
    await vi.waitFor(() => expect(executor.runLanguage).toHaveBeenCalledTimes(1));
    const second = await service.applyConfig(config(['JavaScript']));
    expect(firstSignal.aborted).toBe(true);
    resolveFirst(result('C'));
    await first;
    expect(second.status).toBe('PASSED');
    expect(ramStore.environmentCheckReport.requiredLanguages).toEqual(['JavaScript']);
  });
});
