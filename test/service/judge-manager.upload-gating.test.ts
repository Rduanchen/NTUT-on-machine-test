import { describe, it, expect, vi, beforeEach } from 'vitest';

// We mock dependencies BEFORE importing judgeManager.

vi.mock('../../src/main/services/node-judger.service', () => {
    return {
        nodeJudgerService: {
            judge: vi.fn(),
        },
    };
});

vi.mock('../../src/main/services/api.service', () => {
    return {
        submitScore: vi.fn(async () => ({ success: true })),
        submitCode: vi.fn(async () => ({ success: true })),
    };
});

// Minimal ramStore mock: only members used by JudgeManagerService.
vi.mock('../../src/main/services/ramStore.service', () => {
    return {
        ramStore: {
            testResults: {},
            hiddenTestResults: {},
            examConfig: null, // no sections to count
            studentInfo: { id: 's123', name: 'n' },
            markTestResultSynced: vi.fn(),
            setTestResult: vi.fn((puzzleId: string, result: any) => {
                (globalThis as any).__ramStore.testResults[puzzleId] = result;
            }),
            setHiddenTestResult: vi.fn((puzzleId: string, result: any) => {
                (globalThis as any).__ramStore.hiddenTestResults[puzzleId] = result;
            }),
        },
    };
});

vi.mock('../../src/main/services/localProgram.service', () => {
    return {
        localProgramStore: {
            hasFiles: vi.fn(() => true),
            getStoredProgramEntries: vi.fn(() => [
                { puzzleId: '0', filePath: '/tmp/0.cpp' },
            ]),
        },
    };
});

vi.mock('../../src/main/services/connection.service', () => {
    return {
        connectionService: {
            clearPendingTestResult: vi.fn(),
            markPendingTestResult: vi.fn(),
            clearPendingProgramFile: vi.fn(),
            markPendingProgramFile: vi.fn(),
        },
    };
});

vi.mock('../../src/main/services/logger.service', () => {
    return {
        logger: {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            silly: vi.fn(),
        },
    };
});

// Mock fs so readFileSync returns a stub string
vi.mock('fs', () => ({
    default: {
        readFileSync: vi.fn(() => 'int main() {}'),
    },
    readFileSync: vi.fn(() => 'int main() {}'),
}));

import { judgeManager } from '../../src/main/services/judge-manager.service';
import { ramStore } from '../../src/main/services/ramStore.service';
import { nodeJudgerService } from '../../src/main/services/node-judger.service';
import * as apiService from '../../src/main/services/api.service';

describe('judgeManager upload gating', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (ramStore.testResults as any) = {};
        (ramStore.hiddenTestResults as any) = {};

        // Let the mock setters mutate the same object instance used by the service.
        // (We can't close over ramStore from inside vi.mock.)
        (globalThis as any).__ramStore = ramStore;
    });

    it('uploads code (submitCode) when current passed-subtask count >= previous passed-subtask count', async () => {
        // Previous: 1 passed subtask (all AC) + 1 failed subtask
        (ramStore.testResults as any)['0'] = {
            subtasks: [
                [{ statusCode: 'AC' }],
                [{ statusCode: 'WA' }],
            ],
        };

        // Current: still 1 passed subtask => should upload (>=)
        vi.mocked(nodeJudgerService.judge).mockResolvedValueOnce({
            public: {
                subtasks: [
                    [{ statusCode: 'AC' }],
                    [{ statusCode: 'WA' }],
                ],
            } as any,
            hidden: {
                subtasks: [
                    [{ statusCode: 'AC' }],
                    [{ statusCode: 'WA' }],
                ],
            } as any,
        });

        await judgeManager.runJudge('0', 'x');

        // syncResultsInBackground() runs in a fire-and-forget task
        await new Promise((r) => setTimeout(r, 0));

        // Score should be submitted
        expect(vi.mocked(apiService.submitScore)).toHaveBeenCalledTimes(1);

        // Program file upload is gated by the public score comparison inside runJudge()
        expect(vi.mocked(apiService.submitCode)).toHaveBeenCalledTimes(1);
    });

    it('does NOT upload code when current passed-subtask count < previous passed-subtask count', async () => {
        // Previous: 2 passed subtasks
        (ramStore.testResults as any)['0'] = {
            subtasks: [
                [{ statusCode: 'AC' }],
                [{ statusCode: 'AC' }],
            ],
        };

        // Current: only 1 passed subtask => should NOT upload
        vi.mocked(nodeJudgerService.judge).mockResolvedValueOnce({
            public: {
                subtasks: [
                    [{ statusCode: 'AC' }],
                    [{ statusCode: 'WA' }],
                ],
            } as any,
            hidden: {
                subtasks: [
                    [{ statusCode: 'AC' }],
                    [{ statusCode: 'WA' }],
                ],
            } as any,
        });

        await judgeManager.runJudge('0', 'x');
        // syncResultsInBackground() runs in a fire-and-forget task
        await new Promise((r) => setTimeout(r, 0));

        // Score not submitted since hidden result count < last known public count after setTestResult.
        // submitCode also should not be called since isHigherOrEqual is false.
        expect(vi.mocked(apiService.submitCode)).not.toHaveBeenCalled();
    });
});
