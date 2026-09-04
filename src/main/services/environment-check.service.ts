import type {
  ExamConfigMetaShape,
  EnvironmentCheckReport,
  EnvironmentLanguageResult,
  ExamConfig,
  SupportedLanguage
} from '../../common/types';
import {
  ENVIRONMENT_LANGUAGE_ORDER,
  getEnvironmentLanguageProfile,
  type EnvironmentLanguageProfile
} from '../judge/node-judger/environment-profiles';
import { EnvironmentCheckRunner } from '../judge/node-judger/environment-check-runner';
import { ramStore } from './ramStore.service';
import { reportEnvironmentCheck } from './api.service';

export interface EnvironmentLanguageExecutor {
  runLanguage(
    profile: EnvironmentLanguageProfile,
    signal: AbortSignal
  ): Promise<EnvironmentLanguageResult>;
}

/** Which languages a paper needs, from either half's puzzle list. */
export function extractRequiredLanguages(
  config: { sections?: Array<{ puzzles?: Array<{ language: SupportedLanguage }> }>; puzzles?: Array<{ language: SupportedLanguage }> }
): SupportedLanguage[] {
  const found = new Set<SupportedLanguage>();
  for (const section of config.sections ?? []) {
    for (const puzzle of section.puzzles ?? []) found.add(puzzle.language);
  }
  for (const puzzle of config.puzzles ?? []) found.add(puzzle.language);
  return ENVIRONMENT_LANGUAGE_ORDER.filter((language) => found.has(language));
}

export function createEnvironmentFingerprint(languages: SupportedLanguage[]): string {
  return languages.join('|');
}

function initialLanguageResult(language: SupportedLanguage): EnvironmentLanguageResult {
  return { language, status: 'pending', tools: [], checks: [], startedAt: null, completedAt: null };
}

export class EnvironmentCheckService {
  private runId = 0;
  private abortController: AbortController | null = null;

  public constructor(
    private readonly executor: EnvironmentLanguageExecutor = new EnvironmentCheckRunner()
  ) {}

  public getReport(): EnvironmentCheckReport {
    return ramStore.environmentCheckReport;
  }

  /**
   * Check this machine against the paper's meta half.
   *
   * All the check ever needed was the language list and the limits — never the
   * questions. That is what makes it possible to run in an empty room, before
   * anything readable has been delivered.
   */
  public async applyMeta(
    meta: ExamConfigMetaShape,
    force = false
  ): Promise<EnvironmentCheckReport> {
    return this.checkConfig(meta as any, force);
  }

  public async applyConfig(config: ExamConfig, force = false): Promise<EnvironmentCheckReport> {
    ramStore.examConfig = config;
    // Keep this explicit for store adapters/proxies that do not implement the
    // RamStore examConfig setter side effect.
    ramStore.isConfigured = true;
    return this.checkConfig(config, force);
  }

  public async retry(): Promise<EnvironmentCheckReport> {
    if (!ramStore.examConfig) throw new Error('目前沒有可檢查的考試設定');
    return this.checkConfig(ramStore.examConfig, true);
  }

  public stop(): void {
    this.runId += 1;
    this.abortController?.abort();
    this.abortController = null;
  }

  public async checkConfig(config: any, force = false): Promise<EnvironmentCheckReport> {
    const requiredLanguages = extractRequiredLanguages(config);
    const configFingerprint = createEnvironmentFingerprint(requiredLanguages);
    const current = ramStore.environmentCheckReport;
    if (!force && current?.status === 'PASSED' && current.configFingerprint === configFingerprint)
      return current;

    this.abortController?.abort();
    const controller = new AbortController();
    this.abortController = controller;
    const runId = ++this.runId;
    const startedAt = new Date().toISOString();
    let report: EnvironmentCheckReport = {
      status: 'RUNNING',
      configFingerprint,
      platform: process.platform,
      architecture: process.arch,
      requiredLanguages,
      languageResults: requiredLanguages.map(initialLanguageResult),
      startedAt,
      completedAt: null,
      message: requiredLanguages.length ? '正在檢查考試執行環境' : '此考試沒有需要檢查的程式語言'
    };
    this.publish(runId, report);

    if (requiredLanguages.length === 0) {
      report = {
        ...report,
        status: 'PASSED',
        completedAt: new Date().toISOString(),
        message: '沒有需要檢查的程式語言'
      };
      this.publish(runId, report);
      return report;
    }

    try {
      for (let index = 0; index < requiredLanguages.length; index += 1) {
        if (controller.signal.aborted)
          throw new DOMException('Environment check aborted', 'AbortError');
        const language = requiredLanguages[index];
        const running = {
          ...report.languageResults[index],
          status: 'running' as const,
          startedAt: new Date().toISOString()
        };
        report = {
          ...report,
          languageResults: report.languageResults.map((item, itemIndex) =>
            itemIndex === index ? running : item
          ),
          message: `正在檢查 ${language}`
        };
        this.publish(runId, report);
        const result = await this.executor.runLanguage(
          getEnvironmentLanguageProfile(language),
          controller.signal
        );
        report = {
          ...report,
          languageResults: report.languageResults.map((item, itemIndex) =>
            itemIndex === index ? result : item
          )
        };
        this.publish(runId, report);
      }
      const passed = report.languageResults.every((result) => result.status === 'passed');
      report = {
        ...report,
        status: passed ? 'PASSED' : 'FAILED',
        completedAt: new Date().toISOString(),
        message: passed ? '考試執行環境檢查通過' : '考試執行環境檢查未通過'
      };
      this.publish(runId, report);
      return report;
    } catch (error) {
      if (controller.signal.aborted || runId !== this.runId) return report;
      report = {
        ...report,
        status: 'FAILED',
        completedAt: new Date().toISOString(),
        message: error instanceof Error ? `環境檢查失敗：${error.message}` : '環境檢查發生未知錯誤'
      };
      this.publish(runId, report);
      return report;
    } finally {
      if (runId === this.runId) this.abortController = null;
    }
  }

  private publish(runId: number, report: EnvironmentCheckReport): void {
    if (runId !== this.runId) return;
    ramStore.environmentCheckReport = report;
    void this.reportToBackend(report);
  }

  /**
   * Tell the backend whether this seat can run the exam.
   *
   * Fire-and-forget on purpose. The verdict is for the invigilator's console,
   * not for this machine — a backend that cannot be reached must not stop the
   * check itself, and the report is resent on the next run anyway.
   *
   * Only terminal verdicts are sent. RUNNING would arrive once per language and
   * tell the console nothing it can act on.
   */
  private async reportToBackend(report: EnvironmentCheckReport): Promise<void> {
    if (report.status !== 'PASSED' && report.status !== 'FAILED') return;
    if (ramStore.isOfflineMode) return;
    if (!ramStore.cryptoState) return;

    const failed = report.languageResults
      .filter((result) => result.status === 'failed')
      .map((result) => result.language);

    try {
      await reportEnvironmentCheck(report.status, failed);
    } catch {
      /* Reported again on the next check. */
    }
  }
}

export const environmentCheckService = new EnvironmentCheckService();
