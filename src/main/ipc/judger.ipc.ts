import { ipcMain } from 'electron';
import { nodeJudgerService } from '../services/node-judger.service';
import { ramStore } from '../services/ramStore.service';
import { localProgramStore } from '../services/localProgram.service';
import { uploadTestResult, uploadProgramFile } from '../services/api.service';
import type { IpcResponse, JudgeRunResult } from '../../common/types';
import { judgeManager } from '../services/judge-manager.service';

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
      return judgeManager.runJudge(puzzleId, codeFilePath);
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
