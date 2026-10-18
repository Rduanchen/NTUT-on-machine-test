import { describe, expect, it } from 'vitest';

import { examConfigSchema } from '../../src/main/schemas/examConfig.schema';
import { buildExamConfig } from '../fixtures/exam-config.fixture';

/**
 * These cover the legacy flat `puzzles` array rather than `sections`, so they
 * override the fixture's section layout. Everything the schema requires but
 * this file does not care about comes from the fixture — which is bound to the
 * schema's own type, so a newly required field breaks compilation here instead
 * of surfacing as a runtime ZodError months later. That is what happened to
 * `environmentVariables`, in this very file.
 */
describe('examConfigSchema - special rules compatibility', () => {
  it('parses legacy config (no globalSpecialRules / no puzzle.specialRules)', () => {
    const legacyConfig = buildExamConfig({
      testTitle: 'Legacy Exam',
      description: 'no special rules',
      sections: [],
      puzzles: [
        {
          title: 'P1',
          language: 'Python',
          subtasks: [
            {
              title: 'S1',
              score: 0,
              visible: [{ input: '1\n', output: '1\n' }],
              hidden: [{ input: '2\n', output: '2\n' }]
            }
          ]
        }
      ]
    } as Partial<ReturnType<typeof buildExamConfig>>);

    const parsed = examConfigSchema.parse(legacyConfig);
    expect(parsed.globalSpecialRules).toBeUndefined();
    expect(parsed.puzzles![0].specialRules).toBeUndefined();
  });

  it('parses config with globalSpecialRules and puzzle.specialRules', () => {
    const config = buildExamConfig({
      testTitle: 'Exam With Rules',
      description: 'has special rules',
      sections: [],
      globalSpecialRules: [
        {
          id: 'r-global-1',
          type: 'use',
          constraint: 'MUST_HAVE',
          message: 'Must use print()',
          multiplier: 1,
          params: { target: 'print(' }
        }
      ],
      puzzles: [
        {
          title: 'P1',
          language: 'Python',
          subtasks: [
            {
              title: 'S1',
              score: 0,
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
              multiplier: 1,
              params: { pattern: '\\beval\\s*\\(', flags: 'i' }
            }
          ]
        }
      ]
    } as Partial<ReturnType<typeof buildExamConfig>>);

    const parsed = examConfigSchema.parse(config);
    expect(parsed.globalSpecialRules?.length).toBe(1);
    expect(parsed.puzzles![0].specialRules?.length).toBe(1);
  });

  it('accepts Python AST rules and defaults the puzzle multiplier', () => {
    const config = buildExamConfig({
      sections: [],
      puzzles: [{
        title: 'Python puzzle', language: 'Python', subtasks: [],
        specialRules: [{
          id: 'python-if', type: 'pythonFeature', constraint: 'MUST_HAVE',
          message: 'Use if', params: { features: ['IF'] },
        }],
      }],
    } as Partial<ReturnType<typeof buildExamConfig>>);

    const parsed = examConfigSchema.parse(config);
    expect(parsed.puzzles?.[0].multiplier).toBe(0.5);
    expect(parsed.puzzles?.[0].specialRules?.[0].type).toBe('pythonFeature');
  });

  it('uses the puzzle multiplier and drops legacy rule multipliers', () => {
    const config = buildExamConfig({
      sections: [],
      puzzles: [{
        title: 'P1', language: 'Python', multiplier: 0.25, subtasks: [],
        specialRules: [{
          id: 'old-rule', type: 'use', constraint: 'MUST_HAVE',
          message: 'Use print', multiplier: 0.1, params: { target: 'print' },
        }],
      }],
    } as Partial<ReturnType<typeof buildExamConfig>>);

    const parsed = examConfigSchema.parse(config);
    expect(parsed.puzzles?.[0].multiplier).toBe(0.25);
    expect(parsed.puzzles?.[0].specialRules?.[0]).not.toHaveProperty('multiplier');
  });

  it('rejects unsupported Python AST features', () => {
    const config = buildExamConfig({
      sections: [],
      puzzles: [{
        title: 'P1', language: 'Python', subtasks: [],
        specialRules: [{
          id: 'bad-feature', type: 'pythonFeature', constraint: 'MUST_HAVE',
          message: 'Unsupported', params: { features: ['MAGIC'] },
        }],
      }],
    } as Partial<ReturnType<typeof buildExamConfig>>);

    expect(examConfigSchema.safeParse(config).success).toBe(false);
  });
});
