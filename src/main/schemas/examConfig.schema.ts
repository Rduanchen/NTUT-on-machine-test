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

export type ExamConfigSchema = z.infer<typeof examConfigSchema>;
