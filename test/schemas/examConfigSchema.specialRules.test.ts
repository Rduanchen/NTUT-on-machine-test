import { describe, expect, it } from 'vitest';

import { examConfigSchema } from '../../src/main/schemas/examConfig.schema';

describe('examConfigSchema - special rules compatibility', () => {
    it('parses legacy config (no globalSpecialRules / no puzzle.specialRules)', () => {
        const legacyConfig = {
            testTitle: 'Legacy Exam',
            description: 'no special rules',
            judgerSettings: {
                timeLimit: 1,
                memoryLimit: 128
            },
            accessibleUsers: [
                {
                    id: 'TA1',
                    name: 'TA'
                }
            ],
            puzzles: [
                {
                    title: 'P1',
                    language: 'Python',
                    subtasks: [
                        {
                            title: 'S1',
                            visible: [{ input: '1\n', output: '1\n' }],
                            hidden: [{ input: '2\n', output: '2\n' }]
                        }
                    ]
                }
            ]
        };

        const parsed = examConfigSchema.parse(legacyConfig);
        expect(parsed.globalSpecialRules).toBeUndefined();
        expect(parsed.puzzles[0].specialRules).toBeUndefined();
    });

    it('parses config with globalSpecialRules and puzzle.specialRules', () => {
        const config = {
            testTitle: 'Exam With Rules',
            description: 'has special rules',
            judgerSettings: {
                timeLimit: 1,
                memoryLimit: 128
            },
            accessibleUsers: [
                {
                    id: 'TA1',
                    name: 'TA'
                }
            ],
            globalSpecialRules: [
                {
                    id: 'r-global-1',
                    type: 'use',
                    constraint: 'MUST_HAVE',
                    message: 'Must use print()',
                    params: {
                        target: 'print('
                    },
                }
            ],
            puzzles: [
                {
                    title: 'P1',
                    language: 'Python',
                    subtasks: [
                        {
                            title: 'S1',
                            visible: [{ input: '1\n', output: '1\n' }],
                            hidden: [{ input: '2\n', output: '2\n' }]
                        }
                    ],
                    specialRules: [
                        {
                            id: 'r-p1-1',
                            type: 'regex',
                            constraint: 'MUST_NOT_HAVE',
                            message: 'No eval() allowed',
                            severity: 'warn',
                            params: {
                                pattern: '\\beval\\s*\\(',
                                flags: 'i'
                            }
                        }
                    ]
                }
            ]
        };

        const parsed = examConfigSchema.parse(config);
        expect(parsed.globalSpecialRules?.length).toBe(1);
        expect(parsed.puzzles[0].specialRules?.length).toBe(1);
    });
});
