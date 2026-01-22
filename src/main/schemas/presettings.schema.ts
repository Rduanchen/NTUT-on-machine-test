import { z } from 'zod';

export const examPreSettingsSchema = z.object({
    testTitle: z.string(),
    description: z.string(),
    remoteHost: z.url().optional(),
});

export type ExamPreSettings = z.infer<typeof examPreSettingsSchema>;