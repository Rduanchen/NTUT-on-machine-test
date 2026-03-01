import { preSettingsSchema, type PreSettingsSchema } from '../schemas/presettings.schema';

export function validatePreSettingsFormat(
  data: unknown
): { success: true; data: PreSettingsSchema } | { success: false; error: string } {
  const result = preSettingsSchema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const formatted = result.error.issues
    .map((err) => {
      const path = err.path.length ? err.path.join('.') : '(root)';
      return `${path}: ${err.message}`;
    })
    .join('\n');

  return {
    success: false,
    error: formatted
  };
}
