import { z } from 'zod';

const supportedLanguages = ['C', 'Cpp', 'Python', 'JavaScript', 'Java'] as const;

const testCaseSchema = z.object({
  input: z.string(),
  output: z.string()
});

const specialRuleBaseSchema = z.object({
  id: z.string(),
  type: z.enum(["regex", "use", "composite", "nestedLoop"]),
  constraint: z.enum(["MUST_HAVE", "MUST_NOT_HAVE"]),
  message: z.string(),
  severity: z.enum(["info", "warn"]).optional(),
  multiplier: z.number().min(0).max(1).optional().default(1),
  params: z.unknown(),
});

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

export const examConfigSchema = z.object({
  testTitle: z.string(),
  description: z.string(),
  startPassword: z.string().optional(),
  judgerSettings: judgerSettingsSchema,
  accessibleUsers: z.array(accessUserSchema),
  globalSpecialRules: z.array(specialRuleBaseSchema).optional(),
  sections: z.array(sectionSchema).optional().default([]),
  // Legacy flat puzzles array for backwards compat (optional)
  puzzles: z.array(puzzleSchema).optional(),
});

export type ExamConfigSchema = z.infer<typeof examConfigSchema>;
