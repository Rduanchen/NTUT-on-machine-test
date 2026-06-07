import type { IpcResponse, JudgeRunResult } from '../../common/types';
import { ErrorCode } from '../../common/errorCodes';
import { nodeJudgerService } from './node-judger.service';
import { ramStore } from './ramStore.service';
import { localProgramStore } from './localProgram.service';
import { submitCode, submitScore } from './api.service';
import { connectionService } from './connection.service';
import { logger } from './logger.service';
import * as fs from 'fs';

class JudgeManagerService {
  private countPassedSubtasks(result: JudgeRunResult | undefined | null): number {
    if (!result?.subtasks) return 0;
    let passed = 0;
    for (const subtaskCases of result.subtasks) {
      if (!Array.isArray(subtaskCases) || subtaskCases.length === 0) continue;
      // A subtask is considered passed only if *all* its testcases are AC.
      if (subtaskCases.every((c: any) => c?.statusCode === 'AC')) {
        passed += 1;
      }
    }
    return passed;
  }

  private countPassedSubtasksInAllPuzzles(
    resultsByPuzzle: Record<string, JudgeRunResult> | undefined | null
  ): number {
    if (!resultsByPuzzle) return 0;
    let total = 0;
    for (const r of Object.values(resultsByPuzzle)) {
      total += this.countPassedSubtasks(r);
    }
    return total;
  }

  public async runJudge(
    puzzleId: string,
    codeFilePath: string
  ): Promise<IpcResponse<JudgeRunResult>> {
    try {
      const { public: result, hidden: hiddenResult } = await nodeJudgerService.judge(
        puzzleId,
        codeFilePath
      );

      const previousResult = ramStore.testResults[puzzleId];
      const previousPassedSubtasks = this.countPassedSubtasks(previousResult);
      const currentPassedSubtasks = this.countPassedSubtasks(result);

      // Upload gating is based on *groups/subtasks*, not raw case count.
      // Only upload code when the *current* (public) passed-subtask count is
      // >= the *last* (public) passed-subtask count.
      const isHigherOrEqual = currentPassedSubtasks >= previousPassedSubtasks;

      ramStore.setTestResult(puzzleId, result);
      ramStore.setHiddenTestResult(puzzleId, hiddenResult);

      this.syncResultsInBackground(isHigherOrEqual).catch((error) => {
        logger.error('[Judger] Background sync failed:', error);
      });

      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[Judger] Judge failed: ${message}`);
      return {
        success: false,
        error: { code: ErrorCode.JUDGE_FAILED, message }
      };
    }
  }

  public async rejudgeAllStoredPrograms(): Promise<void> {
    const entries = localProgramStore.getStoredProgramEntries();
    if (entries.length === 0) {
      logger.info('[Judger] No stored programs available for rejudge.');
      return;
    }

    logger.info(`[Judger] Rejudging ${entries.length} stored programs after config refresh.`);

    for (const { puzzleId, filePath } of entries) {
      try {
        const { public: result, hidden: hiddenResult } = await nodeJudgerService.judge(
          puzzleId,
          filePath
        );
        ramStore.setTestResult(puzzleId, result);
        ramStore.setHiddenTestResult(puzzleId, hiddenResult);
      } catch (error) {
        logger.error(`[Judger] Failed to rejudge puzzle ${puzzleId} from ${filePath}:`, error);
      }
    }

    await this.syncResultsInBackground(true);
  }

  public async syncResultsInBackground(uploadCode: boolean): Promise<void> {
    try {
      const results = ramStore.hiddenTestResults;

      // Prevent lower-score overwrite on backend:
      // only upload test results if the *current* score (passed subtasks) is >=
      // the last synced score.
      // NOTE: We don't persist a separate "last synced" snapshot today. The best
      // available baseline is the last known public score stored in ramStore.testResults.
      // This still prevents obvious regressions (e.g. after a rejudge/config update),
      // and the backend has its own guard as the final authority.
      const currentPassedSubtasks = this.countPassedSubtasksInAllPuzzles(
        ramStore.hiddenTestResults
      );
      const lastKnownPassedSubtasks = this.countPassedSubtasksInAllPuzzles(ramStore.testResults);

      if (currentPassedSubtasks >= lastKnownPassedSubtasks) {
        // Calculate total subtasks across all sections
        const allPuzzles = ramStore.examConfig?.sections?.flatMap(s => s.puzzles) ?? [];
        const totalSubtasks = allPuzzles.reduce((acc, p) => acc + p.subtasks.length, 0) || 1;
        const score = Math.round((currentPassedSubtasks / totalSubtasks) * 100);
        
        const response = await submitScore(score);
        if (response.success) {
          ramStore.markTestResultSynced();
          connectionService.clearPendingTestResult();
        } else {
          connectionService.markPendingTestResult();
        }
      }

      if (uploadCode && localProgramStore.hasFiles()) {
        let allSuccess = true;
        const entries = localProgramStore.getStoredProgramEntries();
        for (const entry of entries) {
          const codeContent = fs.readFileSync(entry.filePath, 'utf-8');
          const ext = entry.filePath.split('.').pop()?.toLowerCase();
          let language = 'Cpp';
          if (ext === 'c') language = 'C';
          else if (ext === 'py') language = 'Python';
          else if (ext === 'js') language = 'JavaScript';
          else if (ext === 'java') language = 'Java';

          const codeResponse = await submitCode(codeContent, entry.puzzleId, language);
          if (!codeResponse.success) allSuccess = false;
        }

        if (allSuccess) {
          connectionService.clearPendingProgramFile();
        } else {
          connectionService.markPendingProgramFile();
        }
      }
    } catch (error) {
      logger.error('[Judger] Background sync failed:', error);
      connectionService.markPendingTestResult();
    }
  }
}

export const judgeManager = new JudgeManagerService();
