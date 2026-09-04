import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ipcMain } from 'electron';
import { registerJudgerIpc } from '../../src/main/ipc/judger.ipc';
import { nodeJudgerService } from '../../src/main/services/node-judger.service';
import { localProgramStore } from '../../src/main/services/localProgram.service';
import { submitCode } from '../../src/main/services/api.service';
import { judgeManager } from '../../src/main/services/judge-manager.service';
import * as fs from 'fs';

vi.mock('../../src/main/services/node-judger.service', () => ({
  nodeJudgerService: {
    stop: vi.fn(),
  }
}));

vi.mock('../../src/main/services/localProgram.service', () => ({
  localProgramStore: {
    hasFiles: vi.fn(),
    zipTempDir: vi.fn(),
    getStoredProgramEntries: vi.fn(),
  }
}));

vi.mock('../../src/main/services/api.service', () => ({
  submitCode: vi.fn(),
}));

vi.mock('../../src/main/services/judge-manager.service', () => ({
  judgeManager: {
    runJudge: vi.fn(),
    rejudgeAllStoredPrograms: vi.fn(),
    syncResultsInBackground: vi.fn(),
  }
}));

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
}));

describe('judger.ipc', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerJudgerIpc();
  });

  const invoke = (channel: string, ...args: any[]) => {
    return (ipcMain as any)._invokeHandler(channel, {}, ...args);
  };

  it('judger:judge', async () => {
    vi.mocked(judgeManager.runJudge).mockResolvedValueOnce({ success: true } as any);
    const result = await invoke('judger:judge', 'puzzle-1', 'path/to/code');
    expect(judgeManager.runJudge).toHaveBeenCalledWith('puzzle-1', 'path/to/code');
    expect(result).toEqual({ success: true });
  });

  it('judger:force-stop', async () => {
    const result = await invoke('judger:force-stop');
    expect(nodeJudgerService.stop).toHaveBeenCalled();
    expect(result).toEqual({ success: true });
  });

  describe('judger:rejudge-all', () => {
    it('success', async () => {
      vi.mocked(judgeManager.rejudgeAllStoredPrograms).mockResolvedValueOnce();
      const result = await invoke('judger:rejudge-all');
      expect(judgeManager.rejudgeAllStoredPrograms).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('error', async () => {
      vi.mocked(judgeManager.rejudgeAllStoredPrograms).mockRejectedValueOnce(new Error('Test error'));
      const result = await invoke('judger:rejudge-all');
      expect(result).toEqual({ success: false, error: { code: 'REJUDGE_ERROR', message: 'Test error' } });
    });
  });

  describe('judger:sync-results', () => {
    it('success', async () => {
      vi.mocked(judgeManager.syncResultsInBackground).mockResolvedValueOnce();
      const result = await invoke('judger:sync-results');
      expect(judgeManager.syncResultsInBackground).toHaveBeenCalledWith(true);
      expect(result).toEqual({ success: true });
    });

    it('error', async () => {
      vi.mocked(judgeManager.syncResultsInBackground).mockRejectedValueOnce(new Error('Sync error'));
      const result = await invoke('judger:sync-results');
      expect(result).toEqual({ success: false, error: { code: 'SYNC_ERROR', message: 'Sync error' } });
    });
  });

  describe('judger:get-zip', () => {
    it('returns null if no files', async () => {
      vi.mocked(localProgramStore.hasFiles).mockReturnValueOnce(false);
      const result = await invoke('judger:get-zip');
      expect(result).toBeNull();
    });

    it('returns buffer if files exist', async () => {
      vi.mocked(localProgramStore.hasFiles).mockReturnValueOnce(true);
      const fakeBuffer = Buffer.from('fake-zip');
      vi.mocked(localProgramStore.zipTempDir).mockReturnValueOnce(fakeBuffer);
      const result = await invoke('judger:get-zip');
      expect(result).toBe(fakeBuffer);
    });
  });

  describe('judger:sync-code', () => {
    it('returns success if no files', async () => {
      vi.mocked(localProgramStore.hasFiles).mockReturnValueOnce(false);
      const result = await invoke('judger:sync-code');
      expect(result).toEqual({ success: true });
    });

    it('uploads files correctly and returns success', async () => {
      vi.mocked(localProgramStore.hasFiles).mockReturnValueOnce(true);
      vi.mocked(localProgramStore.getStoredProgramEntries).mockReturnValueOnce([
        { puzzleId: 'p1', filePath: 'test.c', language: 'C', submissionTime: 0 },
        { puzzleId: 'p2', filePath: 'test.py', language: 'Python', submissionTime: 0 },
        { puzzleId: 'p3', filePath: 'test.js', language: 'JavaScript', submissionTime: 0 },
        { puzzleId: 'p4', filePath: 'test.java', language: 'Java', submissionTime: 0 },
        { puzzleId: 'p5', filePath: 'test.cpp', language: 'Cpp', submissionTime: 0 },
        { puzzleId: 'p6', filePath: 'test.unknown', language: 'Unknown', submissionTime: 0 },
      ]);
      vi.mocked(fs.readFileSync).mockReturnValue('code-content');
      vi.mocked(submitCode).mockResolvedValue({ success: true } as any);

      const result = await invoke('judger:sync-code');

      expect(fs.readFileSync).toHaveBeenCalledTimes(6);
      expect(submitCode).toHaveBeenCalledWith('code-content', 'p1', 'C');
      expect(submitCode).toHaveBeenCalledWith('code-content', 'p2', 'Python');
      expect(submitCode).toHaveBeenCalledWith('code-content', 'p3', 'JavaScript');
      expect(submitCode).toHaveBeenCalledWith('code-content', 'p4', 'Java');
      expect(submitCode).toHaveBeenCalledWith('code-content', 'p5', 'Cpp');
      expect(submitCode).toHaveBeenCalledWith('code-content', 'p6', 'Cpp'); // default is Cpp
      expect(result).toEqual({ success: true });
    });

    it('returns early if upload fails', async () => {
      vi.mocked(localProgramStore.hasFiles).mockReturnValueOnce(true);
      vi.mocked(localProgramStore.getStoredProgramEntries).mockReturnValueOnce([
        { puzzleId: 'p1', filePath: 'test.c', language: 'C', submissionTime: 0 },
        { puzzleId: 'p2', filePath: 'test.py', language: 'Python', submissionTime: 0 },
      ]);
      vi.mocked(fs.readFileSync).mockReturnValue('code-content');
      vi.mocked(submitCode).mockResolvedValueOnce({ success: false, error: { code: 'ERR', message: 'Fail' } } as any);

      const result = await invoke('judger:sync-code');

      expect(submitCode).toHaveBeenCalledTimes(1); // Fails on first one
      expect(result).toEqual({ success: false, error: { code: 'ERR', message: 'Fail' } });
    });
  });
});
