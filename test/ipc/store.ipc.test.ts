import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ipcMain } from 'electron';
import { EventEmitter } from 'events';
import { registerStoreIpc } from '../../src/main/ipc/store.ipc';
import { ramStore } from '../../src/main/services/ramStore.service';
import { getMainWindow } from '../../src/main/system/windowManager';
import { messageSyncService } from '../../src/main/services/message-sync.service';
import { getEffectiveSpecialRules } from '../../src/main/services/special-rules.service';

vi.mock('../../src/main/services/ramStore.service', () => {
  const store = new EventEmitter();
  Object.assign(store, {
    connectionStatus: 'CONNECTED',
    examStatus: 'UNINITIALIZED',
    testResults: {},
    hiddenTestResults: {},
    examConfig: null,
    specialRuleResults: {},
    highestTestResults: {},
    highestHiddenTestResults: {},
    highestSpecialRuleResults: {},
    uploadVersionPreference: 'LATEST'
  });
  return { ramStore: store };
});

vi.mock('../../src/main/system/windowManager', () => ({
  getMainWindow: vi.fn(),
}));

vi.mock('../../src/main/services/message-sync.service', () => ({
  messageSyncService: {
    forceConfigRefresh: vi.fn(),
  }
}));

vi.mock('../../src/main/services/special-rules.service', () => ({
  getEffectiveSpecialRules: vi.fn(),
}));

describe('store.ipc', () => {
  let mockWebContents: any;
  let mockWindow: any;

  beforeEach(() => {
    vi.clearAllMocks();
    // Re-create the window mock each time
    mockWebContents = { send: vi.fn() };
    mockWindow = { isDestroyed: vi.fn().mockReturnValue(false), webContents: mockWebContents };
    vi.mocked(getMainWindow).mockReturnValue(mockWindow);

    // Clear event listeners before re-registering
    ramStore.removeAllListeners();
    registerStoreIpc();
  });

  const invoke = (channel: string, ...args: any[]) => {
    return (ipcMain as any)._invokeHandler(channel, {}, ...args);
  };

  describe('Events to renderer', () => {
    it('testResults', () => {
      ramStore.emit('testResults', { p1: { status: 'AC' } });
      expect(mockWebContents.send).toHaveBeenCalledWith('store:test-results-updated', { p1: { status: 'AC' } });
    });

    it('specialRuleResults', () => {
      ramStore.emit('specialRuleResults', { p1: [] });
      expect(mockWebContents.send).toHaveBeenCalledWith('store:special-rule-results-updated', { p1: [] });
    });

    it('examStatus', () => {
      ramStore.emit('examStatus', 'TESTING');
      expect(mockWebContents.send).toHaveBeenCalledWith('exam:status-changed', 'TESTING');
    });

    it('highestTestResults', () => {
      ramStore.emit('highestTestResults', { p1: { status: 'AC' } });
      expect(mockWebContents.send).toHaveBeenCalledWith('store:highest-test-results-updated', { p1: { status: 'AC' } });
    });

    it('highestSpecialRuleResults', () => {
      ramStore.emit('highestSpecialRuleResults', { p1: [] });
      expect(mockWebContents.send).toHaveBeenCalledWith('store:highest-special-rule-results-updated', { p1: [] });
    });

    it('examConfig', () => {
      ramStore.emit('examConfig');
      expect(mockWebContents.send).toHaveBeenCalledWith('store:config-updated');
    });

    it('does not send if window is missing', () => {
      vi.mocked(getMainWindow).mockReturnValue(null as any);
      ramStore.emit('examConfig');
      expect(mockWebContents.send).not.toHaveBeenCalled();
    });

    it('does not send if window is destroyed', () => {
      mockWindow.isDestroyed.mockReturnValue(true);
      ramStore.emit('examConfig');
      expect(mockWebContents.send).not.toHaveBeenCalled();
    });

    it('does not crash if webContents is missing', () => {
      mockWindow.webContents = null;
      ramStore.emit('examConfig');
      // Should just silently do nothing
    });
  });

  describe('Handlers', () => {
    it('store:get-connection-status', async () => {
      (ramStore as any).connectionStatus = 'CONNECTED';
      const result = await invoke('store:get-connection-status');
      expect(result).toBe('CONNECTED');
    });

    it('store:force-config-refresh', async () => {
      vi.mocked(messageSyncService.forceConfigRefresh).mockResolvedValueOnce();
      const result = await invoke('store:force-config-refresh');
      expect(messageSyncService.forceConfigRefresh).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('store:get-exam-status', async () => {
      (ramStore as any).examStatus = 'TESTING';
      const result = await invoke('store:get-exam-status');
      expect(result).toBe('TESTING');

      // Test fallback to UNINITIALIZED
      (ramStore as any).examStatus = undefined;
      const result2 = await invoke('store:get-exam-status');
      expect(result2).toBe('UNINITIALIZED');
    });

    it('store:set-exam-status', async () => {
      const result = await invoke('store:set-exam-status', 'ENDED');
      expect((ramStore as any).examStatus).toBe('ENDED');
      expect(result).toEqual({ success: true });
    });

    it('store:get-test-results', async () => {
      (ramStore as any).testResults = { p1: 'test' };
      expect(await invoke('store:get-test-results')).toEqual({ p1: 'test' });
    });

    it('store:get-hidden-test-results', async () => {
      (ramStore as any).hiddenTestResults = { p1: 'hidden' };
      expect(await invoke('store:get-hidden-test-results')).toEqual({ p1: 'hidden' });
    });

    it('store:get-exam-config', async () => {
      (ramStore as any).examConfig = { testTitle: 'title' };
      expect(await invoke('store:get-exam-config')).toEqual({ testTitle: 'title' });
    });

    it('store:get-special-rule-results', async () => {
      (ramStore as any).specialRuleResults = { p1: [] };
      expect(await invoke('store:get-special-rule-results')).toEqual({ p1: [] });
    });

    it('store:get-highest-test-results', async () => {
      (ramStore as any).highestTestResults = { p1: 'highest' };
      expect(await invoke('store:get-highest-test-results')).toEqual({ p1: 'highest' });
    });

    it('store:get-highest-hidden-test-results', async () => {
      (ramStore as any).highestHiddenTestResults = { p1: 'hidden_highest' };
      expect(await invoke('store:get-highest-hidden-test-results')).toEqual({ p1: 'hidden_highest' });
    });

    it('store:get-highest-special-rule-results', async () => {
      (ramStore as any).highestSpecialRuleResults = { p1: 'highest_special' };
      expect(await invoke('store:get-highest-special-rule-results')).toEqual({ p1: 'highest_special' });
    });

    it('store:get-upload-version-preference', async () => {
      (ramStore as any).uploadVersionPreference = 'LATEST';
      expect(await invoke('store:get-upload-version-preference')).toBe('LATEST');
    });

    it('store:set-upload-version-preference', async () => {
      const result = await invoke('store:set-upload-version-preference', 'HIGHEST_SCORE');
      expect((ramStore as any).uploadVersionPreference).toBe('HIGHEST_SCORE');
      expect(result).toEqual({ success: true });
    });

    describe('store:get-effective-special-rules', () => {
      it('returns empty object if no config', async () => {
        (ramStore as any).examConfig = null;
        expect(await invoke('store:get-effective-special-rules')).toEqual({});
      });

      it('returns map of rules based on config puzzles (flat)', async () => {
        (ramStore as any).examConfig = {
          puzzles: [{ id: 'p1' }, { id: 'p2' }, {}] // Third one has no id -> uses index 2
        };
        vi.mocked(getEffectiveSpecialRules).mockReturnValue(['rule'] as any);

        const result = await invoke('store:get-effective-special-rules');
        expect(result).toEqual({
          p1: ['rule'],
          p2: ['rule'],
          '2': ['rule']
        });
      });

      it('returns map of rules based on config sections', async () => {
        (ramStore as any).examConfig = {
          sections: [
            { puzzles: [{ id: 'p1' }, { id: 'p2' }] },
            { puzzles: [{ id: 'p3' }] },
            { puzzles: null }, // edge case
            {} // no puzzles
          ]
        };
        vi.mocked(getEffectiveSpecialRules).mockReturnValue(['rule'] as any);

        const result = await invoke('store:get-effective-special-rules');
        expect(result).toEqual({
          p1: ['rule'],
          p2: ['rule'],
          p3: ['rule']
        });
      });
    });

    describe('store:get-puzzle-info', () => {
      it('returns empty array if no config', async () => {
        (ramStore as any).examConfig = null;
        expect(await invoke('store:get-puzzle-info')).toEqual([]);
      });

      it('returns mapped info for legacy flat puzzles', async () => {
        (ramStore as any).examConfig = {
          puzzles: [
            { id: 'p1', title: 'T1', language: 'C', score: 10, subtasks: [{ title: 'S1', score: 10 }] },
            { title: 'T2', language: 'Cpp' } // fallback to index
          ]
        };

        const result = await invoke('store:get-puzzle-info');
        expect(result).toEqual([
          {
            id: 'p1', title: 'T1', language: 'C', score: 10,
            subtasks: [{ title: 'S1', score: 10 }]
          },
          {
            id: '1', title: 'T2', language: 'Cpp', score: 0, subtasks: undefined
          }
        ]);
      });

      it('returns mapped info for sectioned config', async () => {
        (ramStore as any).examConfig = {
          sections: [
            {
              id: 's1', title: 'Section 1', description: 'Desc 1', maxScore: 100,
              puzzles: [
                { id: 'p1', title: 'T1', language: 'C', score: 50 },
                { title: 'T2', language: 'Cpp' }
              ]
            },
            {
              // section without puzzles
            }
          ]
        };

        const result = await invoke('store:get-puzzle-info');
        expect(result).toEqual([
          {
            id: 'p1', title: 'T1', language: 'C', score: 50, subtasks: undefined,
            sectionId: 's1', sectionTitle: 'Section 1', sectionDescription: 'Desc 1', sectionMaxScore: 100
          },
          {
            id: '1', title: 'T2', language: 'Cpp', score: 0, subtasks: undefined,
            sectionId: 's1', sectionTitle: 'Section 1', sectionDescription: 'Desc 1', sectionMaxScore: 100
          }
        ]);
      });
    });

    describe('store:get-exam-info', () => {
      it('returns null if no config', async () => {
        (ramStore as any).examConfig = null;
        expect(await invoke('store:get-exam-info')).toBeNull();
      });

      it('returns testTitle and description if config exists', async () => {
        (ramStore as any).examConfig = { testTitle: 'Test Title', description: 'Test Desc' };
        expect(await invoke('store:get-exam-info')).toEqual({
          testTitle: 'Test Title',
          description: 'Test Desc'
        });
      });
    });
  });
});
