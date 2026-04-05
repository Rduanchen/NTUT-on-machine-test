import { z } from "zod";


const supportedLanguages = ["C", "Cpp", "Python", "JavaScript", "Java"]


// 單一測資的格式
const testCaseSchema = z.object({
    input: z.string(),
    output: z.string(),
});

// 子任務 (subtask) 的格式
const subtaskSchema = z.object({
    title: z.string(),
    visible: z.array(testCaseSchema),
    hidden: z.array(testCaseSchema),
});

// 每一題 (puzzle) 的格式
const puzzleSchema = z.object({
    title: z.string(),
    language: z.enum(supportedLanguages),
    timeLimit: z.number().optional(),   // 只有某些題目有，故設為 optional
    memoryLimit: z.number().optional(), // 同上
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

// 可以存取考試的使用者
const accessUserSchema = z.object({
    id: z.string(),
    name: z.string(),
});

// 整體 midterm_test_config.json 的 schema
export const examConfigSchema = z.object({
    testTitle: z.string(),
    description: z.string(),
    judgerSettings: z.object({
        timeLimit: z.number(),
        memoryLimit: z.number(),
    }),
    accessableUsers: z.array(accessUserSchema),
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
    puzzles: z.array(puzzleSchema),
});

// 對應的 TypeScript 型別
export type ExamConfig = z.infer<typeof examConfigSchema>;