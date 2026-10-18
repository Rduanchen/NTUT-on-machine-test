import { describe, expect, it } from 'vitest';

import { examConfigSchema } from '../../src/main/schemas/examConfig.schema';

describe('examConfigSchema - special rules compatibility', () => {
    it('parses legacy config (no globalSpecialRules / no puzzle.specialRules)', () => {
        const legacyConfig = {
            testTitle: 'Legacy Exam',
            description: 'no special rules',
            environmentVariables: { startPassword: 'start' },
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
            environmentVariables: { startPassword: 'start' },
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

    it('accepts Python AST rules and defaults puzzle multiplier to 0.5', () => {
        const config = {
            testTitle: 'Python AST Exam',
            description: 'AST rules',
            environmentVariables: { startPassword: 'start' },
            judgerSettings: { timeLimit: 1, memoryLimit: 128 },
            accessibleUsers: [],
            puzzles: [{
                title: 'P1',
                language: 'Python',
                subtasks: [],
                specialRules: [{
                    id: 'python-if',
                    type: 'pythonFeature',
                    constraint: 'MUST_HAVE',
                    message: 'Use if',
                    params: { features: ['IF'] },
                }],
            }],
        };

        const parsed = examConfigSchema.parse(config);
        expect(parsed.puzzles?.[0].multiplier).toBe(0.5);
        expect(parsed.puzzles?.[0].specialRules?.[0].type).toBe('pythonFeature');
    });

    it('ignores legacy rule multipliers and uses the configured puzzle multiplier', () => {
        const config = {
            testTitle: 'Multiplier Migration',
            description: 'legacy rule multipliers',
            environmentVariables: { startPassword: 'start' },
            judgerSettings: { timeLimit: 1, memoryLimit: 128 },
            accessibleUsers: [],
            puzzles: [{
                title: 'P1',
                language: 'Python',
                multiplier: 0.25,
                subtasks: [],
                specialRules: [{
                    id: 'old-rule',
                    type: 'use',
                    constraint: 'MUST_HAVE',
                    message: 'Use print',
                    multiplier: 0.1,
                    params: { target: 'print' },
                }],
            }],
        };

        const parsed = examConfigSchema.parse(config);
        expect(parsed.puzzles?.[0].multiplier).toBe(0.25);
        expect(parsed.puzzles?.[0].specialRules?.[0]).not.toHaveProperty('multiplier');
    });

    it('rejects Python feature rules with an unsupported feature', () => {
        const result = examConfigSchema.safeParse({
            testTitle: 'Invalid Python AST Exam',
            description: 'unsupported feature',
            environmentVariables: { startPassword: 'start' },
            judgerSettings: { timeLimit: 1, memoryLimit: 128 },
            accessibleUsers: [],
            puzzles: [{
                title: 'P1',
                language: 'Python',
                subtasks: [],
                specialRules: [{
                    id: 'bad-feature',
                    type: 'pythonFeature',
                    constraint: 'MUST_HAVE',
                    message: 'Unsupported feature',
                    params: { features: ['MAGIC'] },
                }],
            }],
        });

        expect(result.success).toBe(false);
    });
});
