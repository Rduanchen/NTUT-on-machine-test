import { z } from 'zod';

export const preSettingsSchema = z.object({
  testTitle: z.string().optional(),
  description: z.string().optional(),
  remoteHost: z.string().url().optional()
});

export type PreSettingsSchema = z.infer<typeof preSettingsSchema>;
