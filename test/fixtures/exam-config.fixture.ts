import type { ExamConfigSchema } from '../../src/main/schemas/examConfig.schema';

type ExamConfig = ExamConfigSchema;

/**
 * Single source of truth for a valid exam configuration in tests.
 *
 * The return type is the production schema's inferred type, so a schema change
 * breaks compilation here instead of rotting silently. That is not a
 * hypothetical: `environmentVariables` became required and three test files
 * carrying their own copy of a config kept passing type-check while failing at
 * runtime, because nothing bound those copies to the schema.
 *
 * The same failure is recorded in host's `knowledge/experience.md` §4, where it
 * went unnoticed for two months. Copies rot; a fixture with no oracle rots
 * silently. Bind it to the type and the type system becomes the oracle.
 */
export const buildExamConfig = (overrides: Partial<ExamConfig> = {}): ExamConfig => ({
  testTitle: 'NTUT Midterm Exam',
  description: 'Midterm exam for NTUT students',
  environmentVariables: {
    startPassword: 'exam-start-password'
  },
  judgerSettings: {
    timeLimit: 5000,
    memoryLimit: 65536
  },
  accessibleUsers: [
    { id: '109590001', name: 'Alice', ip: '192.168.1.10' },
    { id: '109590002', name: 'Bob' }
  ],
  sections: [
    {
      id: 'S1',
      title: 'Section 1',
      maxScore: 100,
      puzzles: [
        {
          id: 'Q1',
          title: 'Two Sum',
          score: 100,
          language: 'Python',
          subtasks: [
            {
              title: 'Subtask 1',
              score: 100,
              visible: [{ input: '1 2\n', output: '3\n' }],
              hidden: [{ input: '3 4\n', output: '7\n' }]
            }
          ]
        }
      ]
    }
  ],
  ...overrides
});
