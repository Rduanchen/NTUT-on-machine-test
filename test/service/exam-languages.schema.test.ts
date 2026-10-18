import { describe, it, expect } from 'vitest';
import { examLanguagesSchema } from '../../src/main/schemas/exam-languages.schema';
import fixture from '../fixtures/exam-languages.fixture.json';
describe('exam language contract', () => {
  it.each(fixture.valid)('accepts canonical response %j', value => expect(examLanguagesSchema.safeParse(value).success).toBe(true));
  it.each(fixture.invalid)('rejects malformed response %j', value => expect(examLanguagesSchema.safeParse(value).success).toBe(false));
});
