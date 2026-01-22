import { ExamPreSettings, examPreSettingsSchema } from '../schemas/presettings.schema';

export function validatePreSettingsFormat(
    data: unknown
): { success: true; data: ExamPreSettings } | { success: false; error: string } {
    const result = examPreSettingsSchema.safeParse(data);

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
        error: formatted,
    };
}
