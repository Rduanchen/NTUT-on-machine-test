import { describe, it, expect, vi, beforeEach } from 'vitest';
import { judgeManager } from '../../src/main/services/judge-manager.service';
import { nodeJudgerService } from '../../src/main/services/node-judger.service';
import { ramStore } from '../../src/main/services/ramStore.service';
import { localProgramStore } from '../../src/main/services/localProgram.service';
import { submitCode, submitScore } from '../../src/main/services/api.service';
import { connectionService } from '../../src/main/services/connection.service';
import { logger, logServerEvent } from '../../src/main/services/logger.service';
import * as fs from 'fs';

vi.mock('../../src/main/services/node-judger.service');
vi.mock('../../src/main/services/localProgram.service');
vi.mock('../../src/main/services/api.service');
vi.mock('../../src/main/services/connection.service');
vi.mock('../../src/main/services/logger.service');
vi.mock('fs');

describe('JudgeManagerService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    ramStore.clear();
    ramStore.examConfig = {
      examId: 'test',
      title: 'test',
      description: '',
      startTime: '',
      endTime: '',
      puzzles: [
        {
          id: 'puz1', title: 'Puzzle 1', description: '', language: 'Python',
          subtasks: [
            { score: 100, visible: [], hidden: [] }
          ]
        }
      ]
    } as any;
  });

  describe('runJudge', () => {
    it('should successfully judge and sync results', async () => {
      (nodeJudgerService.judge as any).mockResolvedValue({
        public: { subtasks: [[{ statusCode: 'AC' }]] },
        hidden: { subtasks: [[{ statusCode: 'AC' }]] }
      });
      const syncSpy = vi.spyOn(judgeManager, 'syncResultsInBackground').mockResolvedValue();

      const result = await judgeManager.runJudge('puz1', '/path/to/code.py');

      expect(result.success).toBe(true);
      expect(ramStore.testResults['puz1']).toBeDefined();
      expect(ramStore.hiddenTestResults['puz1']).toBeDefined();
      expect(syncSpy).toHaveBeenCalledWith(true);
    });

    it('should pass uploadCode=false when current score is lower', async () => {
      ramStore.testResults['puz1'] = { subtasks: [[{ statusCode: 'AC' }]] } as any; // previous score = 1
      (nodeJudgerService.judge as any).mockResolvedValue({
        public: { subtasks: [[{ statusCode: 'WA' }]] },
        hidden: { subtasks: [[{ statusCode: 'WA' }]] }
      });
      const syncSpy = vi.spyOn(judgeManager, 'syncResultsInBackground').mockResolvedValue();

      await judgeManager.runJudge('puz1', '/path/to/code.py');
      expect(syncSpy).toHaveBeenCalledWith(false);
    });

    it('should return error if nodeJudgerService throws', async () => {
      (nodeJudgerService.judge as any).mockRejectedValue(new Error('Judge failed'));

      const result = await judgeManager.runJudge('puz1', '/path/to/code.py');

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Judge failed');
      expect(logger.error).toHaveBeenCalledWith('[Judger] Judge failed: Judge failed');
    });

    it('should handle non-Error objects gracefully when judger throws', async () => {
      (nodeJudgerService.judge as any).mockRejectedValue('String error');
      const result = await judgeManager.runJudge('puz1', '/path/to/code.py');
      expect(result.error?.message).toBe('String error');
    });

    it('should handle background sync error safely', async () => {
      (nodeJudgerService.judge as any).mockResolvedValue({ public: {}, hidden: {} });
      vi.spyOn(judgeManager, 'syncResultsInBackground').mockRejectedValue(new Error('Sync error'));
      
      const result = await judgeManager.runJudge('puz1', '/path/to/code.py');
      expect(result.success).toBe(true); // Does not throw to caller
      // await tick
      await new Promise(r => setTimeout(r, 10));
      expect(logger.error).toHaveBeenCalledWith('[Judger] Background sync failed:', expect.any(Error));
    });

    it('should handle empty result subtasks', async () => {
      (nodeJudgerService.judge as any).mockResolvedValue({ public: { subtasks: undefined }, hidden: { subtasks: [] } });
      const syncSpy = vi.spyOn(judgeManager, 'syncResultsInBackground').mockResolvedValue();
      await judgeManager.runJudge('puz1', '/path/to/code.py');
      expect(syncSpy).toHaveBeenCalledWith(true);
    });

    it('should handle empty subtask cases', async () => {
      (nodeJudgerService.judge as any).mockResolvedValue({ public: { subtasks: [[]] }, hidden: { subtasks: [] } });
      const syncSpy = vi.spyOn(judgeManager, 'syncResultsInBackground').mockResolvedValue();
      await judgeManager.runJudge('puz1', '/path/to/code.py');
      expect(syncSpy).toHaveBeenCalledWith(true);
    });
  });

  describe('rejudgeAllStoredPrograms', () => {
    it('should return early if no stored programs', async () => {
      (localProgramStore.getStoredProgramEntries as any).mockReturnValue([]);
      await judgeManager.rejudgeAllStoredPrograms();
      expect(logger.info).toHaveBeenCalledWith('[Judger] No stored programs available for rejudge.');
      expect(nodeJudgerService.judge).not.toHaveBeenCalled();
    });

    it('should rejudge programs and sync', async () => {
      (localProgramStore.getStoredProgramEntries as any).mockReturnValue([
        { puzzleId: 'puz1', filePath: '/path/puz1.py' }
      ]);
      (nodeJudgerService.judge as any).mockResolvedValue({ public: {}, hidden: {} });
      const syncSpy = vi.spyOn(judgeManager, 'syncResultsInBackground').mockResolvedValue();

      await judgeManager.rejudgeAllStoredPrograms();

      expect(nodeJudgerService.judge).toHaveBeenCalledWith('puz1', '/path/puz1.py');
      expect(syncSpy).toHaveBeenCalledWith(true);
    });

    it('should handle errors in individual program rejudging', async () => {
      (localProgramStore.getStoredProgramEntries as any).mockReturnValue([
        { puzzleId: 'puz1', filePath: '/path/puz1.py' }
      ]);
      (nodeJudgerService.judge as any).mockRejectedValue(new Error('Rejudge fail'));
      const syncSpy = vi.spyOn(judgeManager, 'syncResultsInBackground').mockResolvedValue();

      await judgeManager.rejudgeAllStoredPrograms();

      expect(logger.error).toHaveBeenCalledWith('[Judger] Failed to rejudge puzzle puz1 from /path/puz1.py:', expect.any(Error));
      expect(syncSpy).toHaveBeenCalledWith(true); // Still syncs afterwards
    });
  });

  describe('syncResultsInBackground', () => {
    beforeEach(() => {
      ramStore.examConfig = {
        sections: [{
          id: 's1', maxScore: 100, puzzles: [
            { id: 'puz1', subtasks: [{ score: 100 }] as any }
          ]
        }]
      } as any;
    });

    it('should sync successfully using sections', async () => {
      let getCall = 0;
      ramStore.examConfig = {
        sections: [{
          id: 's1', maxScore: 100, puzzles: [
            { id: 'puz1', subtasks: [{ score: 100 }, {}] as any }, // hit score || 0
            { get id() { return getCall++ === 0 ? 'a' : 'b'; }, subtasks: [] as any } // hit -1 puzzleIndexInAll
          ]
        }]
      } as any;
      ramStore.hiddenTestResults['puz1'] = { subtasks: [[{ statusCode: 'AC' }], [{ statusCode: 'AC' }]] } as any;
      ramStore.testResults['puz1'] = { subtasks: [[null], [null]] } as any; // null instead of {} to hit c?.statusCode
      ramStore.hiddenTestResults['a'] = { subtasks: [] } as any; 
      
      // also hit special rule global fallback for sections
      ramStore.specialRuleResults['puz1'] = [{ ruleId: 'globalRule', passed: false }];
      ramStore.examConfig.globalSpecialRules = [{ id: 'globalRule', multiplier: 0.5 }];
      
      (submitScore as any).mockResolvedValue({ success: true });
      (localProgramStore.hasFiles as any).mockReturnValue(false);

      const markSpy = vi.spyOn(ramStore, 'markTestResultSynced');
      await judgeManager.syncResultsInBackground(true);

      expect(submitScore).toHaveBeenCalled();
      expect(markSpy).toHaveBeenCalled();
      expect(connectionService.clearQueuedScore).toHaveBeenCalled();
      expect(logServerEvent).toHaveBeenCalledWith('UPLOAD_SCORE', '成績上傳成功', expect.any(Object));
    });

    it('keeps the score to send later when the upload fails', async () => {
      /* Noting that it failed was not enough. A student who answers during an
       * outage and never runs another judge used to lose that work entirely. */
      (submitScore as any).mockResolvedValue({ success: false });
      (localProgramStore.hasFiles as any).mockReturnValue(false);

      await judgeManager.syncResultsInBackground(true);

      expect(connectionService.queueScore).toHaveBeenCalledWith(
        expect.objectContaining({ score: expect.any(Number) })
      );
    });

    it('should use highest results when preference is highest', async () => {
      ramStore.uploadVersionPreference = 'highest';
      ramStore.highestHiddenTestResults['puz1'] = { subtasks: [[{ statusCode: 'AC' }]] } as any;
      (submitScore as any).mockResolvedValue({ success: true });
      
      await judgeManager.syncResultsInBackground(true);
      
      expect(submitScore).toHaveBeenCalled();
    });

    it('should upload code if enabled and files exist', async () => {
      ramStore.examConfig = { puzzles: [] } as any; // flat array
      (submitScore as any).mockResolvedValue({ success: true });
      (localProgramStore.hasFiles as any).mockReturnValue(true);
      (localProgramStore.getStoredProgramEntries as any).mockReturnValue([
        { puzzleId: 'puz1', filePath: '/mock/path.py' },
        { puzzleId: 'puz2', filePath: '/mock/path.c' },
        { puzzleId: 'puz3', filePath: '/mock/path.js' },
        { puzzleId: 'puz4', filePath: '/mock/path.java' },
        { puzzleId: 'puz5', filePath: '/mock/path.cpp' },
      ]);
      (fs.readFileSync as any).mockReturnValue('code');
      (submitCode as any).mockResolvedValue({ success: true });

      await judgeManager.syncResultsInBackground(true);

      expect(submitCode).toHaveBeenCalledTimes(5);
      expect(connectionService.clearQueuedSubmission).toHaveBeenCalledTimes(5);
    });

    it('should mark pending program file if any upload fails', async () => {
      ramStore.examConfig = { puzzles: [] } as any;
      (submitScore as any).mockResolvedValue({ success: true });
      (localProgramStore.hasFiles as any).mockReturnValue(true);
      (localProgramStore.getStoredProgramEntries as any).mockReturnValue([
        { puzzleId: 'puz1', filePath: '/mock/path.py' }
      ]);
      (submitCode as any).mockResolvedValue({ success: false });

      await judgeManager.syncResultsInBackground(true);

      expect(connectionService.queueSubmission).toHaveBeenCalledWith(
        expect.objectContaining({ puzzleId: 'puz1' })
      );
    });

    it('logs a thrown sync error without losing the run', async () => {
      (submitScore as any).mockRejectedValue(new Error('Network error'));
      await judgeManager.syncResultsInBackground(true);
      expect(logger.error).toHaveBeenCalledWith('[Judger] Background sync failed:', expect.any(Error));
    });

    it('should sync successfully using fallback flat puzzles list', async () => {
      let getCall = 0;
      ramStore.examConfig = {
        sections: [], // cover sections.length === 0 but config exists
        puzzles: undefined, // cover puzzles || []
      } as any;
      await judgeManager.syncResultsInBackground(true);

      ramStore.examConfig = {
        puzzles: [
          { id: 'puz1', subtasks: [{ score: 100 }] as any, specialRules: [{ id: 'rule1', multiplier: 0.5 }] },
          { title: 'puz2', subtasks: [{ score: 50 }] as any }, // test id fallback to title
          { id: 'puz_undef', subtasks: [{} as any] }, // subtask with no score to hit || 0
          { id: 'puz_empty', subtasks: undefined as any }, // puzzle with no subtasks to hit subtasks falsy
          { get id() { return getCall++ === 0 ? 'a' : 'b'; }, subtasks: [{ score: 10 }] as any } // hit -1 for puzzleIndex
        ],
        globalSpecialRules: [{ id: 'rule1', multiplier: 0.5 }]
      } as any;
      ramStore.hiddenTestResults['puz1'] = { subtasks: undefined } as any; // subtaskResult || []
      ramStore.testResults['puz1'] = { subtasks: [[null]] } as any; // hit c?.statusCode || 'WA' in puzzles fallback
      ramStore.hiddenTestResults['puz2'] = { subtasks: [[{ statusCode: 'WA' }]] } as any;
      ramStore.hiddenTestResults['puz_undef'] = { subtasks: [[{ statusCode: 'AC' }]] } as any;
      ramStore.hiddenTestResults['a'] = { subtasks: [[{ statusCode: 'WA' }]] } as any;
      
      // hit globalSpecialRules fallback in puzzles
      ramStore.specialRuleResults['puz1'] = [{ ruleId: 'globalRule2', passed: false }];
      ramStore.examConfig.globalSpecialRules = [{ id: 'globalRule2', multiplier: 0.5 }];
      
      (submitScore as any).mockResolvedValue({ success: true });
      (localProgramStore.hasFiles as any).mockReturnValue(false);

      const markSpy = vi.spyOn(ramStore, 'markTestResultSynced');
      await judgeManager.syncResultsInBackground(true);

      expect(submitScore).toHaveBeenCalled();
      expect(markSpy).toHaveBeenCalled();
    });

    it('should calculate section score without maxScore cap', async () => {
      ramStore.examConfig = {
        sections: [{
          id: 's1', puzzles: [ // no maxScore
            { id: 'puz1', subtasks: [{ score: 100 }] as any }
          ]
        }, {
          id: 's2', maxScore: -10, puzzles: [ // negative maxScore
            { id: 'puz1', subtasks: [{ score: 100 }] as any }
          ]
        }]
      } as any;
      ramStore.hiddenTestResults['puz1'] = { subtasks: [[{ statusCode: 'AC' }]] } as any;
      (submitScore as any).mockResolvedValue({ success: true });
      (localProgramStore.hasFiles as any).mockReturnValue(false);

      await judgeManager.syncResultsInBackground(true);
      expect(submitScore).toHaveBeenCalled();
    });
  });
});
