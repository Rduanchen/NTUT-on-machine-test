import type { IpcResponse, JudgeRunResult } from '../../common/types';
import { ErrorCode } from '../../common/errorCodes';
import { nodeJudgerService } from './node-judger.service';
import { ramStore } from './ramStore.service';
import { localProgramStore } from './localProgram.service';
import { uploadProgramFile, uploadTestResult } from './api.service';
import { connectionService } from './connection.service';
import { logger } from './logger.service';

class JudgeManagerService {
  public async runJudge(
    puzzleId: string,
    codeFilePath: string
  ): Promise<IpcResponse<JudgeRunResult>> {
    logger.info(`[Judger] Judge request: puzzle=${puzzleId}, file=${codeFilePath}`);

    try {
      const { public: result, hidden: hiddenResult } = await nodeJudgerService.judge(puzzleId, codeFilePath);

      const previousResult = ramStore.testResults[puzzleId];
      const isHigherOrEqual =
        !previousResult || result.correctCount >= (previousResult.correctCount || 0);

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
        const { public: result, hidden: hiddenResult } = await nodeJudgerService.judge(puzzleId, filePath);
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
      const response = await uploadTestResult(results);
      if (response.success) {
        ramStore.markTestResultSynced();
        connectionService.clearPendingTestResult();
      } else {
        connectionService.markPendingTestResult();
      }

      if (uploadCode && localProgramStore.hasFiles()) {
        const zipBuffer = localProgramStore.zipTempDir();
        const studentId = ramStore.studentInfo.id;
        const codeResponse = await uploadProgramFile(zipBuffer, studentId);
        if (codeResponse.success) {
          connectionService.clearPendingProgramFile();
        } else {
          connectionService.markPendingProgramFile(zipBuffer);
        }
      }
    } catch (error) {
      logger.error('[Judger] Background sync failed:', error);
      connectionService.markPendingTestResult();
    }
  }
}

export const judgeManager = new JudgeManagerService();
