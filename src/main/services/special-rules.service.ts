import type {
    ExamConfig,
    SpecialRule,
    SupportedLanguage,
    SpecialRuleResultRecord,
} from '../../common/types';

import { evaluateRules } from 'special-rule-engine';

export function getEffectiveSpecialRules(input: {
    examConfig: ExamConfig;
    puzzleId: string;
}): SpecialRule[] {
    const { examConfig, puzzleId } = input;
    const globalRules = examConfig.globalSpecialRules ?? [];

    // Flatten puzzles from sections first, then fall back to legacy flat puzzles array
    const allPuzzles = examConfig.sections
        ? examConfig.sections.flatMap((s) => s.puzzles)
        : (examConfig.puzzles ?? []);

    const puzzle = allPuzzles.find((p, idx) => (p.id ?? String(idx)) === puzzleId);
    const puzzleRules = puzzle?.specialRules ?? [];
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
