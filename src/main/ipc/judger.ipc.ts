import { ipcMain } from 'electron';
import { nodeJudgerService } from '../services/node-judger.service';
import { ramStore } from '../services/ramStore.service';
import { localProgramStore } from '../services/localProgram.service';
import { connectionService } from '../services/connection.service';
import { uploadTestResult, uploadProgramFile } from '../services/api.service';
import { logger } from '../services/logger.service';
import type { IpcResponse, JudgeRunResult } from '../../common/types';
import { ErrorCode } from '../../common/errorCodes';

/**
 * Judger IPC Handlers
 *
 * Channels:
 * - judger:judge              → Run code evaluation
 * - judger:force-stop         → Stop current evaluation
 * - judger:sync-results       → Manually sync results to server
 * - judger:get-zip            → Download all code as zip
 * - judger:sync-code          → Upload code zip to server
 */
export function registerJudgerIpc(): void {
  ipcMain.handle(
    'judger:judge',
    async (
      _event,
      puzzleId: string,
      codeFilePath: string
    ): Promise<IpcResponse<JudgeRunResult>> => {
      logger.info(`[Judger] Judge request: puzzle=${puzzleId}, file=${codeFilePath}`);

      try {
        const result = await nodeJudgerService.judge(puzzleId, codeFilePath);

        // Check if score is higher than previous
        const previousResult = ramStore.testResults[puzzleId];
        const isHigher =
          !previousResult || result.correctCount >= (previousResult.correctCount || 0);

        // Save result to RAM
        ramStore.setTestResult(puzzleId, result);

        // Sync to server (async, don't block)
        syncResultsInBackground(isHigher);

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
  );

  ipcMain.handle('judger:force-stop', () => {
    nodeJudgerService.stop();
    return { success: true };
  });

  ipcMain.handle('judger:sync-results', async (): Promise<IpcResponse<void>> => {
    const results = ramStore.testResults;
    const response = await uploadTestResult(results);
    if (response.success) {
      ramStore.markTestResultSynced();
    }
    return response;
  });

  ipcMain.handle('judger:get-zip', (): Buffer | null => {
    if (!localProgramStore.hasFiles()) return null;
    return localProgramStore.zipTempDir();
  });

  ipcMain.handle('judger:sync-code', async (): Promise<IpcResponse<void>> => {
    if (!localProgramStore.hasFiles()) {
      return { success: true };
    }
    const zipBuffer = localProgramStore.zipTempDir();
    const studentId = ramStore.studentInfo.id;
    return uploadProgramFile(zipBuffer, studentId);
  });
}

/** Background sync: upload results and code without blocking UI */
async function syncResultsInBackground(uploadCode: boolean): Promise<void> {
  try {
    // Upload test results
    const results = ramStore.testResults;
    const response = await uploadTestResult(results);
    if (response.success) {
      ramStore.markTestResultSynced();
      connectionService.clearPendingTestResult();
    } else {
      connectionService.markPendingTestResult();
    }

    // Upload code if score is higher
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
