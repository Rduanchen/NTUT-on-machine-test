import type { IpcResponse, JudgeRunResult } from '../../common/types';
import { ErrorCode } from '../../common/errorCodes';
import { nodeJudgerService } from './node-judger.service';
import { ramStore } from './ramStore.service';
import { localProgramStore } from './localProgram.service';
import { submitCode, submitScore } from './api.service';
import { connectionService } from './connection.service';
import { logger, logServerEvent } from './logger.service';
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
        let totalScore = 0;
        const sections = ramStore.examConfig?.sections || [];
        const allPuzzles = sections.flatMap(s => s.puzzles) ?? ramStore.examConfig?.puzzles ?? [];
        
        let puzzleAmount = 0;
        let passedPuzzleAmount = 0;
        let subtaskAmount = 0;
        let passedSubtaskAmount = 0;
        let puzzleResults: Record<string, any> = {};

        if (sections.length > 0) {
          for (const section of sections) {
            let sectionScore = 0;
            for (const puzzle of section.puzzles) {
              puzzleAmount++;
              const puzzleIndexInAll = allPuzzles.findIndex(p => p.id === puzzle.id);
              const fallbackKey = puzzleIndexInAll !== -1 ? String(puzzleIndexInAll) : '';
              const puzzleId = puzzle.id && ramStore.hiddenTestResults[puzzle.id] 
                ? puzzle.id 
                : (ramStore.hiddenTestResults[fallbackKey] ? fallbackKey : (puzzle.id || ''));
              
              const result = ramStore.hiddenTestResults[puzzleId];
              let puzzleScore = 0;
              let puzzlePassedSubtasks = 0;
              const puzzleTotalSubtasks = puzzle.subtasks ? puzzle.subtasks.length : 0;
              subtaskAmount += puzzleTotalSubtasks;
              
              let subtasksInfo: any[] = [];

              if (puzzle.subtasks && puzzle.subtasks.length > 0) {
                for (let i = 0; i < puzzle.subtasks.length; i++) {
                  const subtaskConfig = puzzle.subtasks[i];
                  const subtaskResult = result?.subtasks?.[i];
                  const visibleResult = ramStore.testResults[puzzleId]?.subtasks?.[i] || [];
                  
                  if (subtaskResult && Array.isArray(subtaskResult) && subtaskResult.length > 0) {
                    if (subtaskResult.every((c: any) => c?.statusCode === 'AC')) {
                      puzzleScore += (subtaskConfig.score || 0);
                      puzzlePassedSubtasks += 1;
                      passedSubtaskAmount += 1;
                    }
                  }

                  subtasksInfo.push({
                    visible: visibleResult.map((c: any) => ({
                      status: c?.statusCode || 'WA',
                      userOutput: c?.userOutput || '',
                      expectedOutput: c?.expectingOutput || '',
                      time: c?.time || '0'
                    })),
                    hidden: (subtaskResult || []).map((c: any) => ({
                      status: c?.statusCode || 'WA',
                      userOutput: c?.userOutput || '',
                      expectedOutput: c?.expectingOutput || '',
                      time: c?.time || '0'
                    }))
                  });
                }
              }

              if (puzzlePassedSubtasks === puzzleTotalSubtasks && puzzleTotalSubtasks > 0) {
                passedPuzzleAmount += 1;
              }

              const srr = ramStore.specialRuleResults[puzzleId];
              const esr = puzzle.specialRules || [];
              let multiplier = 1.0;
              if (srr && esr) {
                for (const res of srr) {
                  if (!res.passed) {
                    const rule = esr.find(r => r.id === res.ruleId) || ramStore.examConfig?.globalSpecialRules?.find(r => r.id === res.ruleId);
                    if (rule && rule.multiplier !== undefined) {
                      multiplier *= rule.multiplier;
                    }
                  }
                }
              }

              const finalPuzzleScore = Math.floor(puzzleScore * multiplier);
              sectionScore += finalPuzzleScore;

              const finalIndex = puzzleIndexInAll !== -1 ? puzzleIndexInAll : 0;
              puzzleResults[`Q${finalIndex + 1}`] = {
                subtasks: subtasksInfo,
                specialRuleResults: srr || []
              };
            }

            const cappedSectionScore = (section.maxScore !== undefined && section.maxScore !== null && section.maxScore >= 0)
              ? Math.min(sectionScore, section.maxScore)
              : sectionScore;
            totalScore += cappedSectionScore;
          }
        } else {
          // Flat list legacy fallback
          const puzzles = ramStore.examConfig?.puzzles || [];
          for (const puzzle of puzzles) {
            puzzleAmount++;
            const puzzleId = puzzle.id || puzzle.title;
            const result = ramStore.hiddenTestResults[puzzleId];
            
            let puzzleScore = 0;
            let puzzlePassedSubtasks = 0;
            const puzzleTotalSubtasks = puzzle.subtasks ? puzzle.subtasks.length : 0;
            subtaskAmount += puzzleTotalSubtasks;
            
            let subtasksInfo: any[] = [];

            if (puzzle.subtasks && puzzle.subtasks.length > 0) {
              for (let i = 0; i < puzzle.subtasks.length; i++) {
                const subtaskConfig = puzzle.subtasks[i];
                const subtaskResult = result?.subtasks?.[i];
                const visibleResult = ramStore.testResults[puzzleId]?.subtasks?.[i] || [];
                
                if (subtaskResult && Array.isArray(subtaskResult) && subtaskResult.length > 0) {
                  if (subtaskResult.every((c: any) => c?.statusCode === 'AC')) {
                    puzzleScore += (subtaskConfig.score || 0);
                    puzzlePassedSubtasks += 1;
                    passedSubtaskAmount += 1;
                  }
                }

                subtasksInfo.push({
                  visible: visibleResult.map((c: any) => ({
                    status: c?.statusCode || 'WA',
                    userOutput: c?.userOutput || '',
                    expectedOutput: c?.expectingOutput || '',
                    time: c?.time || '0'
                  })),
                  hidden: (subtaskResult || []).map((c: any) => ({
                    status: c?.statusCode || 'WA',
                    userOutput: c?.userOutput || '',
                    expectedOutput: c?.expectingOutput || '',
                    time: c?.time || '0'
                  }))
                });
              }
            }

            if (puzzlePassedSubtasks === puzzleTotalSubtasks && puzzleTotalSubtasks > 0) {
              passedPuzzleAmount += 1;
            }

            const srr = ramStore.specialRuleResults[puzzleId];
            const esr = puzzle.specialRules || [];
            let multiplier = 1.0;
            if (srr && esr) {
              for (const res of srr) {
                if (!res.passed) {
                  const rule = esr.find(r => r.id === res.ruleId) || ramStore.examConfig?.globalSpecialRules?.find(r => r.id === res.ruleId);
                  if (rule && rule.multiplier !== undefined) {
                    multiplier *= rule.multiplier;
                  }
                }
              }
            }

            totalScore += Math.floor(puzzleScore * multiplier);

            const puzzleIndex = puzzles.findIndex((p) => (p.id || p.title) === puzzleId);
            const finalIndex = puzzleIndex !== -1 ? puzzleIndex : 0;
            puzzleResults[`Q${finalIndex + 1}`] = {
              subtasks: subtasksInfo,
              specialRuleResults: srr || []
            };
          }
        }

        const score = totalScore;
        
        const response = await submitScore({
          score,
          puzzleResults,
          subtaskAmount,
          passedSubtaskAmount,
          puzzleAmount,
          passedPuzzleAmount
        });
        if (response.success) {
          ramStore.markTestResultSynced();
          connectionService.clearPendingTestResult();
          logServerEvent('UPLOAD_SCORE', '成績上傳成功', { score });
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
