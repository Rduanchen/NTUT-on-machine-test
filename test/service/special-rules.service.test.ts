import { describe, it, expect } from 'vitest';

import type { ExamConfig } from '../../src/common/types';
import { evaluateSpecialRules, getEffectiveSpecialRules } from '../../src/main/services/special-rules.service';

describe('special-rules.service', () => {
    it('merges global + puzzle rules in stable order', () => {
        const config: ExamConfig = {
            testTitle: 't',
            description: 'd',
            judgerSettings: { timeLimit: 1, memoryLimit: 1 },
            accessableUsers: [],
            globalSpecialRules: [
                {
                    id: 'g1',
                    type: 'use',
                    constraint: 'MUST_HAVE',
                    message: 'must include main',
                    params: { target: 'main' },
                },
            ],
            puzzles: [
                {
                    title: 'p0',
                    language: 'Cpp',
                    subtasks: [],
                    specialRules: [
                        {
                            id: 'p1',
                            type: 'use',
                            constraint: 'MUST_NOT_HAVE',
                            message: 'must not include scanf',
                            params: { target: 'scanf' },
                        },
                    ],
                },
            ],
        };

        const effective = getEffectiveSpecialRules({ examConfig: config, puzzleIndex: 0 });
        expect(effective.map((r) => r.id)).toEqual(['g1', 'p1']);
    });

    it('evaluates rules and returns SpecialRuleResultRecord[] with checkedAt', () => {
        const rules = [
            {
                id: 'r1',
                type: 'use' as const,
                constraint: 'MUST_HAVE' as const,
                message: 'must include main',
                params: { target: 'main' },
            },
            {
                id: 'r2',
                type: 'use' as const,
                constraint: 'MUST_NOT_HAVE' as const,
                message: 'must not include scanf',
                params: { target: 'scanf' },
            },
        ];

        const results = evaluateSpecialRules({
            rules,
            language: 'Cpp',
            sourceText: 'int main(){return 0;}',
            checkedAt: '2026-01-01T00:00:00.000Z',
        });

        expect(results).toEqual([
            expect.objectContaining({ ruleId: 'r1', passed: true, checkedAt: '2026-01-01T00:00:00.000Z' }),
            expect.objectContaining({ ruleId: 'r2', passed: true, checkedAt: '2026-01-01T00:00:00.000Z' }),
        ]);
    });
});
