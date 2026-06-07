import type {
    ExamConfig,
    SpecialRule,
    SupportedLanguage,
    SpecialRuleResultRecord,
} from '../../common/types';

import { evaluateRules } from 'special-rule-engine';

export function getEffectiveSpecialRules(input: {
    examConfig: ExamConfig;
    puzzleIndex: number;
}): SpecialRule[] {
    const { examConfig, puzzleIndex } = input;
    const globalRules = examConfig.globalSpecialRules ?? [];

    // Flatten puzzles from sections first, then fall back to legacy flat puzzles array
    const allPuzzles = examConfig.sections
        ? examConfig.sections.flatMap((s) => s.puzzles)
        : (examConfig.puzzles ?? []);

    const puzzleRules = allPuzzles[puzzleIndex]?.specialRules ?? [];
    return [...globalRules, ...puzzleRules];
}

export function evaluateSpecialRules(input: {
    rules: SpecialRule[];
    language: SupportedLanguage;
    sourceText: string;
    checkedAt?: string;
}): SpecialRuleResultRecord[] {
    const checkedAt = input.checkedAt ?? new Date().toISOString();

    if (!input.rules.length) return [];

    const results = evaluateRules(input.rules as any, {
        // Engine accepts `language` as a string selector for normalization.
        language: input.language,
        sourceText: input.sourceText,
    } as any);

    return (results as Array<{ ruleId: string; passed: boolean; message: string; reason?: string }>).map(
        (r) => ({
            ruleId: r.ruleId,
            passed: r.passed,
            message: r.message,
            reason: r.reason,
            checkedAt,
        }),
    );
}
