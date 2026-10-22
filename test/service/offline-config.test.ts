import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { examConfigSchema as backendSchema } from '../../../host/backend/src/schemas/config.schema';
import {
  backendExamConfigSchema,
  examConfigPayloadSchema,
  examConfigSecretSchema,
  mergeExamConfig
} from '../../src/main/schemas/examConfig.schema';
import { prepareOfflineBundle } from '../../src/main/services/offline-bundle.service';
import { cryptoService } from '../../src/main/services/crypto.service';

const source = JSON.parse(
  readFileSync(resolve(__dirname, '../fixtures/valid_config_file.json'), 'utf-8')
);

describe('backend config.json import', () => {
  it('parses the same paper and applies the same defaults as the backend', () => {
    expect(backendExamConfigSchema.parse(source)).toEqual(backendSchema.parse(source));
  });

  it.each([
    ['missing sections', { ...source, sections: undefined }],
    ['empty start password', { ...source, environmentVariables: { startPassword: '' } }],
    ['invalid IP', { ...source, accessibleUsers: [{ id: '1', name: 'Student', ip: 'invalid' }] }]
  ])('rejects %s just as the backend does', (_name, value) => {
    expect(backendSchema.safeParse(value).success).toBe(false);
    expect(backendExamConfigSchema.safeParse(value).success).toBe(false);
  });

  it('seals the plain config and opens it with its start password', () => {
    const parsed = backendExamConfigSchema.parse(source);
    const bundle = prepareOfflineBundle(parsed);
    expect(examConfigPayloadSchema.safeParse(bundle).success).toBe(true);

    const examKey = cryptoService.unwrapExamKey(
      bundle.meta.wrappedExamKey,
      parsed.environmentVariables.startPassword
    );
    const secret = examConfigSecretSchema.parse(
      cryptoService.decryptExamPaper(bundle.cipher, examKey)
    );
    const merged = mergeExamConfig(bundle.meta, secret);

    expect(merged.sections?.[0].puzzles[0].title).toBe(parsed.sections[0].puzzles[0].title);
    expect(merged.sections?.[0].puzzles[0].subtasks).toEqual(parsed.sections[0].puzzles[0].subtasks);
  });
});
