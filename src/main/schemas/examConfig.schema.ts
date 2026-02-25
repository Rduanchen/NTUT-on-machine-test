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
  subtasks: z.array(subtaskSchema)
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
  accessableUsers: z.array(accessUserSchema),
  puzzles: z.array(puzzleSchema)
});

export type ExamConfigSchema = z.infer<typeof examConfigSchema>;
