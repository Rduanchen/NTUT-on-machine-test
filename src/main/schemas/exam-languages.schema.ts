import { z } from 'zod';
export const LANGUAGE_ORDER = ['C', 'Cpp', 'Python', 'JavaScript', 'Java'] as const;
export const examLanguagesSchema = z.object({
  languages: z.array(z.enum(LANGUAGE_ORDER)).max(5).refine(
    values => values.every((v, i) => i === 0 || LANGUAGE_ORDER.indexOf(values[i - 1]) < LANGUAGE_ORDER.indexOf(v)),
    'Languages must be unique and in canonical order'
  )
}).strict();
export type ExamLanguages = z.infer<typeof examLanguagesSchema>;
