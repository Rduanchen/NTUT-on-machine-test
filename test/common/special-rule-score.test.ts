import { describe, expect, it } from 'vitest';

import { applyPuzzleRuleMultiplier, roundFinalScore } from '../../src/common/special-rule-score';

describe('applyPuzzleRuleMultiplier', () => {
    it('keeps the full score when there are no rule results', () => {
        expect(applyPuzzleRuleMultiplier(10, [], 0.5)).toBe(10);
    });

    it('keeps the full score when all rules pass', () => {
        expect(applyPuzzleRuleMultiplier(10, [{ passed: true }], 0.5)).toBe(10);
    });

    it('applies the puzzle multiplier once when any rule fails', () => {
        expect(applyPuzzleRuleMultiplier(10, [{ passed: false }, { passed: false }], 0.5)).toBe(5);
    });

    it('preserves fractional puzzle scores until final score calculation', () => {
        const puzzleScores = [
            applyPuzzleRuleMultiplier(1, [{ passed: false }], 0.5),
            applyPuzzleRuleMultiplier(1, [{ passed: false }], 0.5),
        ];

        expect(puzzleScores).toEqual([0.5, 0.5]);
        expect(roundFinalScore(puzzleScores.reduce((sum, score) => sum + score, 0))).toBe(1);
    });

    it('uses the default 0.5 multiplier when config omits it', () => {
        expect(applyPuzzleRuleMultiplier(10, [{ passed: false }])).toBe(5);
    });
});
