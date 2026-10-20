import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  examConfigSchema,
  examConfigMetaSchema,
  examConfigSecretSchema,
  mergeExamConfig,
  type ExamConfigMeta,
  type ExamConfigSecret
} from '../../src/main/schemas/examConfig.schema';

/**
 * The contract anchor shared with the backend and the admin console.
 *
 * Three definitions of this shape exist and share no code. Reading the same
 * bytes all three are checked against is the only thing that can catch them
 * drifting — and the zod majors differ here, so "it parses on the backend" is
 * not evidence that it parses on this side.
 */
const fixture = JSON.parse(
  readFileSync(resolve(__dirname, '../fixtures/exam-config-payload.fixture.json'), 'utf-8')
);

const meta = (): ExamConfigMeta => examConfigMetaSchema.parse(fixture.full.payload.meta);
const secret = (): ExamConfigSecret => examConfigSecretSchema.parse(fixture.full.secret);

describe('the contract fixture', () => {
  it('parses as a meta half, with every optional field present', () => {
    expect(() => examConfigMetaSchema.parse(fixture.full.payload.meta)).not.toThrow();
  });

  it('parses as a meta half with every optional field absent', () => {
    // Where the two zod majors would disagree about filling defaults, if they do.
    expect(() => examConfigMetaSchema.parse(fixture.minimal.payload.meta)).not.toThrow();
  });

  it.each(['full', 'minimal'])('parses the %s secret half', (variant) => {
    expect(() => examConfigSecretSchema.parse(fixture[variant].secret)).not.toThrow();
  });

  it('rejects a meta half carrying test cases', () => {
    /* Not a schema nicety. If this shape were accepted, the backend could send
     * the answers in the half that arrives before the exam starts. */
    const leaky = JSON.parse(JSON.stringify(fixture.full.payload.meta));
    leaky.sections[0].puzzles[0].subtasks = [{ title: 'x', score: 1, visible: [], hidden: [] }];

    const parsed = examConfigMetaSchema.parse(leaky);
    expect(parsed.sections[0].puzzles[0]).not.toHaveProperty('subtasks');
  });
});

describe('mergeExamConfig', () => {
  it('produces a config the rest of the app already understands', () => {
    /* The measure of whether the split is in the right place: everything
     * downstream — judger, screens, rule engine — carries on unchanged. */
    const merged = mergeExamConfig(meta(), secret());

    expect(() => examConfigSchema.parse(merged)).not.toThrow();
  });

  it('restores each puzzle from both halves', () => {
    const merged = mergeExamConfig(meta(), secret());

    const puzzle = merged.sections![0].puzzles[0];
    expect(puzzle.id).toBe('P1');
    expect(puzzle.language).toBe('Cpp'); // from meta
    expect(puzzle.title).toBe('兩數相加'); // from the ciphered half
    expect(puzzle.subtasks[0].hidden.length).toBeGreaterThan(0);
  });

  it('keeps section structure and global rules', () => {
    const merged = mergeExamConfig(meta(), secret());

    expect(merged.sections).toHaveLength(2);
    expect(merged.globalSpecialRules).toHaveLength(1);
  });

  it('never carries the invigilator password onto this machine', () => {
    /* It unwraps the exam key. Sending it would hand over the paper. */
    const merged = mergeExamConfig(meta(), secret());

    expect(merged.environmentVariables.startPassword).toBe('');
  });

  describe('when the halves disagree', () => {
    it('refuses a puzzle the ciphered half does not contain', () => {
      const half = secret();
      half.puzzles = half.puzzles.filter((p) => p.id !== 'P2');

      expect(() => mergeExamConfig(meta(), half)).toThrow(/P2/);
    });

    it('refuses a puzzle the meta half does not contain', () => {
      const half = secret();
      half.puzzles.push({ ...half.puzzles[0], id: 'P99' });

      expect(() => mergeExamConfig(meta(), half)).toThrow(/P99/);
    });

    it('says which puzzles are the problem', () => {
      // A mismatch means a student marked against a question the paper does
      // not have, or shown one with no cases. Failing loudly beats either.
      const half = secret();
      half.puzzles = [];

      expect(() => mergeExamConfig(meta(), half)).toThrow(/P1.*P2.*P3/s);
    });
  });

  it('merges the minimal paper too', () => {
    const merged = mergeExamConfig(
      examConfigMetaSchema.parse(fixture.minimal.payload.meta),
      examConfigSecretSchema.parse(fixture.minimal.secret)
    );

    expect(merged.sections![0].puzzles[0].title).toBe('輸出 Hello');
  });
});
