import * as crypto from 'node:crypto';
import { cryptoService, PASSWORD_KDF_ITERATIONS } from './crypto.service';
import {
  examConfigPayloadSchema,
  type BackendExamConfig,
  type EncryptedEnvelope,
  type ExamConfigPayload
} from '../schemas/examConfig.schema';

function encrypt(plaintext: string, keyHex: string): EncryptedEnvelope {
  const { iv, ciphertext, tag } = cryptoService.encryptAesPayload(plaintext, keyHex, '');
  return { iv, ciphertext, tag };
}

/** Convert a backend config.json into the same sealed paper it exports. */
export function prepareOfflineBundle(config: BackendExamConfig): ExamConfigPayload {
  const examKey = crypto.randomBytes(32).toString('hex');
  const salt = crypto.randomBytes(16);
  const wrappingKey = crypto.pbkdf2Sync(
    config.environmentVariables.startPassword,
    salt,
    PASSWORD_KDF_ITERATIONS,
    32,
    'sha256'
  );

  const wrappedExamKey = {
    salt: salt.toString('base64'),
    ...encrypt(examKey, wrappingKey.toString('hex'))
  };
  const meta = {
    testTitle: config.testTitle,
    description: config.description,
    accessibleUsers: config.accessibleUsers,
    judgerSettings: config.judgerSettings,
    submitGraceSeconds: config.submitGraceSeconds,
    sections: config.sections.map((section) => ({
      id: section.id,
      title: section.title,
      description: section.description,
      maxScore: section.maxScore,
      puzzles: section.puzzles.map((puzzle) => ({
        id: puzzle.id,
        language: puzzle.language,
        timeLimit: puzzle.timeLimit,
        memoryLimit: puzzle.memoryLimit
      }))
    })),
    wrappedExamKey
  };
  const secret = {
    puzzles: config.sections.flatMap((section) =>
      section.puzzles.map((puzzle) => ({
        id: puzzle.id,
        title: puzzle.title,
        score: puzzle.score,
        subtasks: puzzle.subtasks,
        specialRules: puzzle.specialRules
      }))
    ),
    globalSpecialRules: config.globalSpecialRules
  };

  return examConfigPayloadSchema.parse({
    meta,
    cipher: encrypt(JSON.stringify(secret), examKey)
  });
}
