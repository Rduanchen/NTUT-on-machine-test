import { z } from 'zod';

const supportedLanguages = ['C', 'Cpp', 'Python', 'JavaScript', 'Java'] as const;

const testCaseSchema = z.object({
  input: z.string(),
  output: z.string()
});

const pythonFeatureSchema = z.enum([
  "IF", "FOR", "WHILE", "FUNCTION", "NESTED_LOOP", "RECURSION",
  "LAMBDA", "LIST", "DICT", "SET", "SORT", "SORTED",
]);

const specialRuleBaseSchema: z.ZodType<any> = z.lazy(() => z.object({
  id: z.string(),
  type: z.enum(["regex", "use", "composite", "nestedLoop", "pythonFeature"]),
  constraint: z.enum(["MUST_HAVE", "MUST_NOT_HAVE"]),
  message: z.string(),
  severity: z.enum(["info", "warn"]).optional(),
  params: z.unknown(),
}).superRefine((rule, context) => {
  if (rule.type === "pythonFeature") {
    const parsed = z.object({ features: z.array(pythonFeatureSchema).min(1) }).safeParse(rule.params);
    if (!parsed.success) {
      context.addIssue({ code: "custom", path: ["params"], message: "pythonFeature params.features must be a non-empty list of supported Python features" });
    }
  }

  if (rule.type === "composite") {
    const parsed = z.object({
      op: z.enum(["AND", "OR"]),
      rules: z.array(specialRuleBaseSchema),
    }).safeParse(rule.params);
    if (!parsed.success) {
      context.addIssue({ code: "custom", path: ["params"], message: "composite params must include op AND|OR and a rules array" });
    }
  }
}));

const subtaskSchema = z.object({
  title: z.string(),
  score: z.number().min(0).optional().default(0),
  visible: z.array(testCaseSchema),
  hidden: z.array(testCaseSchema)
});

const puzzleSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  score: z.number().min(0).optional().default(0),
  multiplier: z.number().min(0).max(1).optional().default(0.5),
  language: z.enum(supportedLanguages),
  timeLimit: z.number().optional(),
  memoryLimit: z.number().optional(),
  subtasks: z.array(subtaskSchema),
  specialRules: z.array(specialRuleBaseSchema).optional(),
});

const sectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  maxScore: z.number().min(0),
  puzzles: z.array(puzzleSchema),
});

const accessUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  ip: z.string().optional(),
});

const judgerSettingsSchema = z.object({
  timeLimit: z.number(),
  memoryLimit: z.number()
});

const environmentVariablesSchema = z.object({
  startPassword: z.string()
}).catchall(z.union([z.string(), z.number(), z.boolean()]));

export const examConfigSchema = z.object({
  testTitle: z.string(),
  description: z.string(),
  environmentVariables: environmentVariablesSchema,
  judgerSettings: judgerSettingsSchema,
  accessibleUsers: z.array(accessUserSchema),
  globalSpecialRules: z.array(specialRuleBaseSchema).optional(),
  sections: z.array(sectionSchema).optional().default([]),
  // Legacy flat puzzles array for backwards compat (optional)
  puzzles: z.array(puzzleSchema).optional(),
});

/* ── Feature 007: the paper arrives in two halves ─────────────────────────
 *
 * The half that may reach this machine before the exam starts, and the half
 * that may not. The device key protects transport, but this machine holds it —
 * so it cannot keep a paper unreadable from the student sitting here. A second
 * key does that, and the backend withholds it until the exam begins.
 */

const encryptedEnvelopeSchema = z.object({
  iv: z.string(),
  ciphertext: z.string(),
  tag: z.string()
});

export const wrappedExamKeySchema = z.object({
  salt: z.string(),
  iv: z.string(),
  ciphertext: z.string(),
  tag: z.string()
});

/** Enough to probe this machine's toolchain, and nothing about the questions. */
const puzzleSkeletonSchema = z.object({
  id: z.string(),
  language: z.enum(supportedLanguages),
  timeLimit: z.number().optional(),
  memoryLimit: z.number().optional()
});

const sectionSkeletonSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  maxScore: z.number().min(0),
  puzzles: z.array(puzzleSkeletonSchema)
});

export const examConfigMetaSchema = z.object({
  testTitle: z.string(),
  description: z.string(),
  accessibleUsers: z.array(accessUserSchema),
  judgerSettings: z.object({
    timeLimit: z.number(),
    memoryLimit: z.number(),
    compareMode: z.enum(['strict', 'loose']).optional(),
    compileTimeout: z.number().optional(),
    compileMemoryLimit: z.number().optional(),
    maxConcurrentJobs: z.number().optional(),
    maxSystemRetries: z.number().optional()
  }),
  submitGraceSeconds: z.number().min(0).optional(),
  sections: z.array(sectionSkeletonSchema),
  wrappedExamKey: wrappedExamKeySchema
});

export const examConfigSecretSchema = z.object({
  puzzles: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      score: z.number().min(0),
      subtasks: z.array(subtaskSchema),
      specialRules: z.array(specialRuleBaseSchema).optional()
    })
  ),
  globalSpecialRules: z.array(specialRuleBaseSchema).optional()
});

export const examConfigPayloadSchema = z.object({
  meta: examConfigMetaSchema,
  cipher: encryptedEnvelopeSchema
});

export type EncryptedEnvelope = z.infer<typeof encryptedEnvelopeSchema>;
export type WrappedExamKey = z.infer<typeof wrappedExamKeySchema>;
export type ExamConfigMeta = z.infer<typeof examConfigMetaSchema>;
export type ExamConfigSecret = z.infer<typeof examConfigSecretSchema>;
export type ExamConfigPayload = z.infer<typeof examConfigPayloadSchema>;

/**
 * Put the two halves back together.
 *
 * The result must be the config shape this app already has, so the judger, the
 * screens and the rule engine carry on unchanged — if any of them needed
 * adjusting, the split would be in the wrong place.
 *
 * A puzzle present in one half and missing from the other is an error, not
 * something to paper over: a student marked against a question the paper does
 * not contain, or shown one with no test cases, is worse than a visible
 * failure.
 */
export function mergeExamConfig(meta: ExamConfigMeta, secret: ExamConfigSecret): ExamConfigSchema {
  const byId = new Map(secret.puzzles.map((puzzle) => [puzzle.id, puzzle]));

  const metaIds = meta.sections.flatMap((section) => section.puzzles.map((p) => p.id));
  const secretIds = secret.puzzles.map((p) => p.id);
  const missing = metaIds.filter((id) => !byId.has(id));
  const extra = secretIds.filter((id) => !metaIds.includes(id));

  if (missing.length || extra.length) {
    throw new Error(
      `Exam paper halves do not match. Missing: [${missing.join(', ')}], unexpected: [${extra.join(', ')}]`
    );
  }

  const merged = {
    testTitle: meta.testTitle,
    description: meta.description,
    environmentVariables: {
      /* The invigilator's password never reaches this machine. It is the key
       * that unwraps the exam key, so sending it would hand over the paper. */
      startPassword: ''
    },
    judgerSettings: meta.judgerSettings,
    accessibleUsers: meta.accessibleUsers,
    globalSpecialRules: secret.globalSpecialRules,
    sections: meta.sections.map((section) => ({
      ...section,
      puzzles: section.puzzles.map((puzzle) => {
        const secretPuzzle = byId.get(puzzle.id)!;
        return {
          id: puzzle.id,
          language: puzzle.language,
          timeLimit: puzzle.timeLimit,
          memoryLimit: puzzle.memoryLimit,
          title: secretPuzzle.title,
          score: secretPuzzle.score,
          subtasks: secretPuzzle.subtasks,
          specialRules: secretPuzzle.specialRules
        };
      })
    }))
  };

  return examConfigSchema.parse(merged);
}

export type ExamConfigSchema = z.infer<typeof examConfigSchema>;
