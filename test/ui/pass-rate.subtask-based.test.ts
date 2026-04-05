import { describe, expect, it } from 'vitest';

type JudgeRunResultLike = {
    subtasks?: Array<Array<{ statusCode?: string }>>;
};

function calcSubtaskPassRate(result: JudgeRunResultLike | null | undefined): number | null {
    if (!result || !Array.isArray(result.subtasks) || result.subtasks.length === 0) return null;

    const totalSubtasks = result.subtasks.length;
    const passedSubtasks = result.subtasks.reduce((acc, subtaskCases) => {
        if (!Array.isArray(subtaskCases) || subtaskCases.length === 0) return acc;
        return subtaskCases.every((c) => c?.statusCode === 'AC') ? acc + 1 : acc;
    }, 0);

    return Math.round((passedSubtasks / totalSubtasks) * 100);
}

describe('pass rate (subtask-based)', () => {
    it('counts a subtask as passed only when all its testcases are AC', () => {
        const result: JudgeRunResultLike = {
            subtasks: [
                [{ statusCode: 'AC' }, { statusCode: 'AC' }],
                [{ statusCode: 'AC' }, { statusCode: 'WA' }],
                [{ statusCode: 'AC' }],
            ],
        };

        // 2 out of 3 subtasks passed => 66.666.. => 67
        expect(calcSubtaskPassRate(result)).toBe(67);
    });

    it('returns null when there are no subtasks', () => {
        expect(calcSubtaskPassRate({ subtasks: [] })).toBeNull();
        expect(calcSubtaskPassRate(null)).toBeNull();
    });
});
