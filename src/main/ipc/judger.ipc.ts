import { ipcMain } from 'electron';
import { nodeJudgerService } from '../services/node-judger.service';
import { ramStore } from '../services/ramStore.service';
import { localProgramStore } from '../services/localProgram.service';
import { submitScore, submitCode } from '../services/api.service';
import type { IpcResponse, JudgeRunResult } from '../../common/types';
import { judgeManager } from '../services/judge-manager.service';
import * as fs from 'fs';

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
    try {
      await judgeManager.syncResultsInBackground(true);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: { code: 'SYNC_ERROR', message: e.message } };
    }
  });

  ipcMain.handle('judger:get-zip', (): Buffer | null => {
    if (!localProgramStore.hasFiles()) return null;
    return localProgramStore.zipTempDir();
  });

  ipcMain.handle('judger:sync-code', async (): Promise<IpcResponse<void>> => {
    if (!localProgramStore.hasFiles()) {
      return { success: true };
    }
    
    const entries = localProgramStore.getStoredProgramEntries();
    
    for (const entry of entries) {
      const codeContent = fs.readFileSync(entry.filePath, 'utf-8');
      
      // Determine language from extension
      const ext = entry.filePath.split('.').pop()?.toLowerCase();
      let language = 'Cpp';
      if (ext === 'c') language = 'C';
      else if (ext === 'py') language = 'Python';
      else if (ext === 'js') language = 'JavaScript';
      else if (ext === 'java') language = 'Java';

      const res = await submitCode(codeContent, entry.puzzleId, language);
      if (!res.success) {
        return res; // fail early if one fails
      }
    }
    
    return { success: true };
  });
}
