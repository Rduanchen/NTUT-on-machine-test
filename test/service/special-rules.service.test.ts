import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { ExamConfig } from '../../src/common/types';
import { evaluateSpecialRules, getEffectiveSpecialRules } from '../../src/main/services/special-rules.service';
import { evaluateRules } from 'special-rule-engine';

vi.mock('special-rule-engine', () => ({
    evaluateRules: vi.fn(),
}));

describe('special-rules.service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getEffectiveSpecialRules', () => {
        it('merges global + puzzle rules in stable order (using sections)', () => {
            const config = {
                globalSpecialRules: [{ id: 'g1' }],
                sections: [
                    {
                        puzzles: [
                            { id: 'p_custom', specialRules: [{ id: 'p1' }] }
                        ]
                    }
                ]
            } as any;
            const effective = getEffectiveSpecialRules({ examConfig: config, puzzleId: 'p_custom' });
            expect(effective.map((r) => r.id)).toEqual(['g1', 'p1']);
        });

        it('handles missing globalSpecialRules', () => {
            const config = {
                sections: [
                    {
                        puzzles: [
                            { id: 'p_custom', specialRules: [{ id: 'p1' }] }
                        ]
                    }
                ]
            } as any;
            const effective = getEffectiveSpecialRules({ examConfig: config, puzzleId: 'p_custom' });
            expect(effective.map((r) => r.id)).toEqual(['p1']);
        });

        it('falls back to flat puzzles array if no sections', () => {
            const config = {
                puzzles: [
                    { id: 'p_custom', specialRules: [{ id: 'p1' }] }
                ]
            } as any;
            const effective = getEffectiveSpecialRules({ examConfig: config, puzzleId: 'p_custom' });
            expect(effective.map((r) => r.id)).toEqual(['p1']);
        });

        it('falls back to empty array if no sections and no puzzles', () => {
            const config = {} as any;
            const effective = getEffectiveSpecialRules({ examConfig: config, puzzleId: 'p_custom' });
            expect(effective).toEqual([]);
        });

        it('matches puzzle by index string if id is missing', () => {
            const config = {
                puzzles: [
                    { specialRules: [{ id: 'p0' }] },
                    { specialRules: [{ id: 'p1' }] }
                ]
            } as any;
            const effective = getEffectiveSpecialRules({ examConfig: config, puzzleId: '1' });
            expect(effective.map((r) => r.id)).toEqual(['p1']);
        });

        it('returns only global rules if puzzle is not found', () => {
            const config = {
                globalSpecialRules: [{ id: 'g1' }],
                puzzles: []
            } as any;
            const effective = getEffectiveSpecialRules({ examConfig: config, puzzleId: 'not_found' });
            expect(effective.map((r) => r.id)).toEqual(['g1']);
        });

        it('handles puzzle with no specialRules', () => {
            const config = {
                puzzles: [
                    { id: 'p_custom' }
                ]
            } as any;
            const effective = getEffectiveSpecialRules({ examConfig: config, puzzleId: 'p_custom' });
            expect(effective).toEqual([]);
        });
    });

    describe('evaluateSpecialRules', () => {
        it('returns empty array if no rules provided', () => {
            const results = evaluateSpecialRules({
                rules: [],
                language: 'Cpp',
                sourceText: 'int main(){return 0;}'
            });
            expect(results).toEqual([]);
        });

        it('evaluates rules and uses provided checkedAt', () => {
            const rules = [
                {
                    id: 'r1',
                    type: 'use',
                    constraint: 'MUST_HAVE',
                    message: 'must include main',
                    params: { target: 'main' },
                }
            ] as any;

            (evaluateRules as any).mockReturnValue([
                { ruleId: 'r1', passed: true, message: 'must include main' }
            ]);

            const results = evaluateSpecialRules({
                rules,
                language: 'Cpp',
                sourceText: 'int main(){return 0;}',
                checkedAt: '2026-01-01T00:00:00.000Z',
            });

            expect(evaluateRules).toHaveBeenCalledWith(rules, {
                language: 'Cpp',
                sourceText: 'int main(){return 0;}',
            });
            expect(results).toEqual([
                { ruleId: 'r1', passed: true, message: 'must include main', reason: undefined, checkedAt: '2026-01-01T00:00:00.000Z' },
            ]);
        });

        it('uses current time for checkedAt if not provided', () => {
            const rules = [
                {
                    id: 'r1',
                    type: 'use',
                    constraint: 'MUST_HAVE',
                    message: 'must include main',
                    params: { target: 'main' },
                }
            ] as any;

            (evaluateRules as any).mockReturnValue([
                { ruleId: 'r1', passed: true, message: 'must include main' }
            ]);

            const before = new Date().toISOString();
            const results = evaluateSpecialRules({
                rules,
                language: 'Cpp',
                sourceText: 'int main(){return 0;}'
            });
            const after = new Date().toISOString();

            expect(results.length).toBe(1);
            expect(results[0].checkedAt >= before).toBe(true);
            expect(results[0].checkedAt <= after).toBe(true);
        });

        it('includes reason if returned by engine', () => {
            const rules = [
                {
                    id: 'r1',
                    type: 'use',
                    constraint: 'MUST_NOT_HAVE',
                    message: 'must not include main',
                    params: { target: 'main' },
                }
            ] as any;

            (evaluateRules as any).mockReturnValue([
                { ruleId: 'r1', passed: false, message: 'must not include main', reason: 'found main' }
            ]);

            const results = evaluateSpecialRules({
                rules,
                language: 'Cpp',
                sourceText: 'int main(){return 0;}'
            });

            expect(results[0]).toHaveProperty('reason', 'found main');
            expect(results[0].passed).toBe(false);
        });
    });
});
