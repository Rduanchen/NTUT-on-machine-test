import { z } from 'zod';

const supportedLanguages = ['C', 'Cpp', 'Python', 'JavaScript', 'Java'] as const;

const testCaseSchema = z.object({
  input: z.string(),
  output: z.string()
});

const subtaskSchema = z.object({
  title: z.string(),
  visible: z.array(testCaseSchema),
  hidden: z.array(testCaseSchema)
});

const puzzleSchema = z.object({
  title: z.string(),
  language: z.enum(supportedLanguages),
  timeLimit: z.number().optional(),
  memoryLimit: z.number().optional(),
  subtasks: z.array(subtaskSchema),
  specialRules: z
    .array(
      z.object({
        id: z.string(),
        type: z.enum(["regex", "use", "composite"]),
        constraint: z.enum(["MUST_HAVE", "MUST_NOT_HAVE"]),
        message: z.string(),
        severity: z.enum(["info", "warn"]).optional(),
        params: z.unknown(),
      }),
    )
    .optional(),
});

const accessUserSchema = z.object({
  id: z.string(),
  name: z.string()
});

const judgerSettingsSchema = z.object({
  timeLimit: z.number(),
  memoryLimit: z.number()
});

export const examConfigSchema = z.object({
  testTitle: z.string(),
  description: z.string(),
  judgerSettings: judgerSettingsSchema,
  accessibleUsers: z.array(accessUserSchema),
  globalSpecialRules: z
    .array(
      z.object({
        id: z.string(),
        type: z.enum(["regex", "use", "composite"]),
        constraint: z.enum(["MUST_HAVE", "MUST_NOT_HAVE"]),
        message: z.string(),
        severity: z.enum(["info", "warn"]).optional(),
        params: z.unknown(),
      }),
    )
    .optional(),
  puzzles: z.array(puzzleSchema)
});

export type ExamConfigSchema = z.infer<typeof examConfigSchema>;
