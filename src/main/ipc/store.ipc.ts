import { ipcMain } from 'electron';
import { ramStore } from '../services/ramStore.service';
import { getMainWindow } from '../system/windowManager';
import type {
  PuzzleInfo,
  JudgeRunResult,
  SpecialRuleResultRecord,
  SpecialRule,
  ExamState,
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

  // Push exam status changes to renderer for lifecycle routing
  ramStore.on('examStatus', (status: ExamState) => {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return;
    win.webContents?.send('exam:status-changed', status);
  });

  ipcMain.handle('store:get-connection-status', () => {
    return ramStore.connectionStatus;
  });

  ipcMain.handle('store:get-exam-status', (): ExamState => {
    return ramStore.examStatus ?? 'UNINITIALIZED';
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

    // Flatten puzzles from sections
    const allPuzzles = config.sections?.flatMap(s => s.puzzles) ?? config.puzzles ?? [];

    const map: Record<string, SpecialRule[]> = {};
    for (let i = 0; i < allPuzzles.length; i += 1) {
      map[String(i)] = getEffectiveSpecialRules({ examConfig: config, puzzleIndex: i });
    }
    return map;
  });

  ipcMain.handle('store:get-puzzle-info', (): PuzzleInfo[] => {
    const config = ramStore.examConfig;
    if (!config) return [];

    const puzzlesWithSection: PuzzleInfo[] = [];

    if (config.sections) {
      for (const section of config.sections) {
        if (!section.puzzles) continue;
        for (const puzzle of section.puzzles) {
          puzzlesWithSection.push({
            id: puzzle.id,
            title: puzzle.title,
            language: puzzle.language,
            sectionId: section.id,
            sectionTitle: section.title,
            score: puzzle.score ?? 0
          });
        }
      }
    } else if (config.puzzles) {
      // Legacy flat puzzles
      for (let i = 0; i < config.puzzles.length; i++) {
        const puzzle = config.puzzles[i];
        puzzlesWithSection.push({
          id: puzzle.id ?? String(i),
          title: puzzle.title,
          language: puzzle.language,
          score: puzzle.score ?? 0
        });
      }
    }

    return puzzlesWithSection;
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
