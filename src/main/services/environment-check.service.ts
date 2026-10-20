import { examLanguagesSchema } from '../schemas/exam-languages.schema';
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
import { getExamLanguages, reportEnvironmentCheck } from './api.service';

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
  private session = '';
  private languages: SupportedLanguage[] | null = null;
  private preparation: Promise<EnvironmentCheckReport> | null = null;
  private sequence = 0;
  private sending = false;
  private pending: { status: 'RUNNING' | 'PASSED' | 'FAILED'; failed: string[]; sequence: number; session: string } | null = null;
  private lastReportedRun = -1;

  private currentSession(): string {
    return ramStore.cryptoState ? `${ramStore.backendUrl}|${ramStore.cryptoState.aesKeyHex}` : '';
  }

  public invalidateRegistration(): void {
    if (this.session && this.session !== this.currentSession()) this.reset();
  }

  public reset(): void {
    this.stop();
    this.session = '';
    this.languages = null;
    this.preparation = null;
    this.pending = null;
    this.sequence = 0;
    this.lastReportedRun = -1;
    ramStore.environmentCheckReport = {
      status: 'IDLE', configFingerprint: '', platform: process.platform, architecture: process.arch,
      requiredLanguages: [], languageResults: [], startedAt: null, completedAt: null,
      message: '尚未進行執行環境檢查'
    };
  }

  public async prepareOnline(): Promise<EnvironmentCheckReport> {
    const session = this.currentSession();
    if (!session || ramStore.isOfflineMode) return this.getReport();
    if (session !== this.session) { this.reset(); this.session = session; }
    if (this.preparation) return this.preparation;
    if (this.languages !== null) { void this.flushReport(); return this.getReport(); }
    ramStore.environmentCheckReport = { ...this.getReport(), status: 'RUNNING',
      startedAt: new Date().toISOString(), completedAt: null, message: '正在取得考試語言' };
    const generation = this.runId;
    const work = (async () => {
      try {
        const response = await getExamLanguages();
        if (generation !== this.runId || session !== this.currentSession()) return this.getReport();
        if (!response.success) throw new Error(response.error?.message ?? '無法取得考試語言');
        this.languages = examLanguagesSchema.parse(response.data).languages;
        return await this.applyLanguages(this.languages);
      } catch (error) {
        if (generation === this.runId && session === this.currentSession()) {
          const report: EnvironmentCheckReport = { ...this.getReport(), status: 'FAILED',
            requiredLanguages: [], languageResults: [], completedAt: new Date().toISOString(),
            message: error instanceof Error ? error.message : '無法取得考試語言' };
          this.publish(this.runId, report);
        }
        return this.getReport();
      }
    })();
    this.preparation = work;
    try { return await work; } finally { if (this.preparation === work) this.preparation = null; }
  }

  public applyLanguages(languages: SupportedLanguage[], force = false): Promise<EnvironmentCheckReport> {
    const parsed = examLanguagesSchema.parse({ languages });
    return this.checkConfig({ puzzles: parsed.languages.map(language => ({ language })) }, force);
  }

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
    return this.checkConfig(meta, force);
  }

  public async applyConfig(config: ExamConfig, force = false): Promise<EnvironmentCheckReport> {
    ramStore.examConfig = config;
    // Keep this explicit for store adapters/proxies that do not implement the
    // RamStore examConfig setter side effect.
    ramStore.isConfigured = true;
    return this.checkConfig(config, force);
  }

  public async retry(): Promise<EnvironmentCheckReport> {
    if (!ramStore.isOfflineMode && this.currentSession()) {
      if (this.currentSession() !== this.session || this.languages === null) return this.prepareOnline();
      return this.applyLanguages(this.languages, true);
    }
    if (ramStore.examConfigMeta) return this.applyMeta(ramStore.examConfigMeta, true);
    if (!ramStore.examConfig) throw new Error('目前沒有可檢查的考試設定');
    return this.checkConfig(ramStore.examConfig, true);
  }

  public stop(): void {
    this.runId += 1;
    this.abortController?.abort();
    this.abortController = null;
  }

  public async checkConfig(config: Parameters<typeof extractRequiredLanguages>[0], force = false): Promise<EnvironmentCheckReport> {
    const requiredLanguages = extractRequiredLanguages(config);
    const configFingerprint = createEnvironmentFingerprint(requiredLanguages);
    const current = ramStore.environmentCheckReport;
    if (!force && current?.status === 'RUNNING' && current.configFingerprint === configFingerprint && this.abortController) return current;
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
      this.abortController = null;
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
    if (runId !== this.runId || (this.session && this.session !== this.currentSession())) return;
    ramStore.environmentCheckReport = report;
    if (this.session && this.session !== this.currentSession()) return;
    if (report.status === 'RUNNING' && this.lastReportedRun === runId) return;
    if (report.status !== 'RUNNING' && report.status !== 'PASSED' && report.status !== 'FAILED') return;
    this.lastReportedRun = runId;
    if (ramStore.isOfflineMode || !this.currentSession()) return;
    this.pending = { status: report.status,
      failed: report.languageResults.filter(result => result.status === 'failed').map(result => result.language),
      sequence: ++this.sequence, session: this.currentSession() };
    void this.flushReport();
  }

  public async flushReport(): Promise<void> {
    if (this.sending) return;
    this.sending = true;
    try {
      while (this.pending) {
        const pending = this.pending;
        if (pending.session !== this.currentSession() || ramStore.isOfflineMode) {
          this.pending = null;
          return;
        }
        try {
          const response = await reportEnvironmentCheck(pending.status, pending.failed, pending.sequence);
          if (!response.success) return;
        } catch { return; }
        if (this.pending === pending) this.pending = null;
      }
    } finally { this.sending = false; }
  }
}

export const environmentCheckService = new EnvironmentCheckService();
// Clear immediately when credentials/backend are replaced, including pending requests.
ramStore.on('cryptoState', () => environmentCheckService.invalidateRegistration());
ramStore.on('backendUrl', () => environmentCheckService.invalidateRegistration());
