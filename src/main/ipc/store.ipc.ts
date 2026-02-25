import { ipcMain } from 'electron';
import { ramStore } from '../services/ramStore.service';
import type { PuzzleInfo } from '../../common/types';

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
  ipcMain.handle('store:get-connection-status', () => {
    return ramStore.connectionStatus;
  });

  ipcMain.handle('store:get-test-results', () => {
    return ramStore.testResults;
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
