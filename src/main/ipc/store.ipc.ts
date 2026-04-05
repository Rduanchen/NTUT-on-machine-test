import { ipcMain } from 'electron';
import { ramStore } from '../services/ramStore.service';
import { getMainWindow } from '../system/windowManager';
import type {
  PuzzleInfo,
  JudgeRunResult,
  SpecialRuleResultRecord,
  SpecialRule,
} from '../../common/types';
import { getEffectiveSpecialRules } from '../services/special-rules.service';

/**
 * Store IPC Handlers
 *
 * Channels:
 * - store:get-connection-status   → Get current connection status
 * - store:get-test-results        → Get all test results
 * - store:get-puzzle-info         → Get puzzle list for display
 * - store:get-exam-info           → Get exam title & description
 */
export function registerStoreIpc(): void {
  // Push test results to renderer whenever they change (e.g. after rejudge on config update)
  ramStore.on('testResults', (results: Record<string, JudgeRunResult>) => {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return;
    win.webContents?.send('store:test-results-updated', results);
  });

  // Push special-rule results to renderer whenever they change (after each judge/submit)
  ramStore.on(
    'specialRuleResults',
    (results: Record<string, SpecialRuleResultRecord[]>) => {
      const win = getMainWindow();
      if (!win || win.isDestroyed()) return;
      win.webContents?.send('store:special-rule-results-updated', results);
    },
  );

  ipcMain.handle('store:get-connection-status', () => {
    return ramStore.connectionStatus;
  });

  ipcMain.handle('store:get-test-results', () => {
    return ramStore.testResults;
  });

  ipcMain.handle('store:get-special-rule-results', () => {
    return ramStore.specialRuleResults;
  });

  ipcMain.handle('store:get-effective-special-rules', () => {
    const config = ramStore.examConfig;
    if (!config) return {} as Record<string, SpecialRule[]>;

    const map: Record<string, SpecialRule[]> = {};
    for (let i = 0; i < config.puzzles.length; i += 1) {
      map[String(i)] = getEffectiveSpecialRules({ examConfig: config, puzzleIndex: i });
    }
    return map;
  });

  ipcMain.handle('store:get-puzzle-info', (): PuzzleInfo[] => {
    const config = ramStore.examConfig;
    if (!config) return [];

    return config.puzzles.map((puzzle, index) => ({
      id: String(index),
      title: puzzle.title,
      language: puzzle.language
    }));
  });

  ipcMain.handle('store:get-exam-info', () => {
    const config = ramStore.examConfig;
    if (!config) return null;

    return {
      testTitle: config.testTitle,
      description: config.description
    };
  });
}
