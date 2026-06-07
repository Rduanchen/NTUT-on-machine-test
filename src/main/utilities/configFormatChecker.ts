import { examConfigSchema, ExamConfig } from "../schemas/config.schema";

/**
 * 驗證給定的資料是否符合 midterm_test_config.json 的格式
 * @param data - 待驗證的資料
 * @returns 驗證結果，成功時回傳解析後的資料，失敗時回傳錯誤訊息
 */

export function validateConfigFormat(
    data: unknown
): { success: true; data: ExamConfig } | { success: false; error: string } {
    const result = examConfigSchema.safeParse(data);

    if (result.success) {
        return { success: true, data: result.data };
    }

    const formatted = result.error.issues
        .map((err) => {
            const path = err.path.length ? err.path.join(".") : "(root)";
            return `${path}: ${err.message}`;
        })
        .join("\n");

    return {
        success: false,
        error: formatted,
    };
}