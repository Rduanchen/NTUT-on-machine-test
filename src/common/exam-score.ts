import type { ExamConfig, JudgeRunResult, Puzzle, SpecialRuleResultRecord } from './types';
import { applyPuzzleRuleMultiplier, roundFinalScore } from './special-rule-score';

export function isPassedSubtask(cases: unknown): boolean {
  return Array.isArray(cases) && cases.length > 0 &&
    cases.every((item) => item?.statusCode === 'AC');
}

export function calculatePuzzleScore(
  puzzle: Pick<Puzzle, 'subtasks' | 'multiplier'>,
  result: JudgeRunResult | undefined,
  rules: SpecialRuleResultRecord[] = []
): number {
  const baseScore = (puzzle.subtasks ?? []).reduce((score, subtask, index) =>
    score + (isPassedSubtask(result?.subtasks?.[index]) ? (subtask.score ?? 0) : 0), 0);
  return applyPuzzleRuleMultiplier(baseScore, rules, puzzle.multiplier ?? 0.5);
}

export function formatScore(score: number): string {
  return Number(score.toFixed(3)).toString();
}

export function summarizeExamScore(
  config: ExamConfig | null,
  results: Record<string, JudgeRunResult>,
  rules: Record<string, SpecialRuleResultRecord[]>,
  defaultSectionTitle: string
) {
  if (!config) return { sections: [], total: 0, maxScore: 0 };
  const hasSections = Boolean(config.sections?.length);
  const configuredSections = hasSections
    ? config.sections
    : [{ id: 'default', title: defaultSectionTitle, puzzles: config.puzzles ?? [], maxScore: undefined }];
  const allPuzzles = configuredSections.flatMap((section) => section.puzzles);

  const sections = configuredSections.map((section) => {
    let score = 0;
    let passedSubtasks = 0;
    let totalSubtasks = 0;
    for (const puzzle of section.puzzles) {
      const index = allPuzzles.indexOf(puzzle);
      const fallbackKey = String(index);
      const key = hasSections
        ? (puzzle.id && results[puzzle.id]
          ? puzzle.id
          : (results[fallbackKey] ? fallbackKey : (puzzle.id || '')))
        : (puzzle.id || puzzle.title);
      const result = results[key];
      totalSubtasks += puzzle.subtasks?.length ?? 0;
      passedSubtasks += (puzzle.subtasks ?? []).filter((_, i) => isPassedSubtask(result?.subtasks?.[i])).length;
      score += calculatePuzzleScore(puzzle, result, rules[key] ?? []);
    }
    const maxScore = section.maxScore ?? section.puzzles.reduce((points, puzzle) =>
      points + (puzzle.subtasks ?? []).reduce((value, subtask) => value + (subtask.score ?? 0), 0), 0);
    return {
      id: section.id,
      title: section.title,
      passedSubtasks,
      totalSubtasks,
      score: section.maxScore !== undefined && section.maxScore >= 0 ? Math.min(score, section.maxScore) : score,
      maxScore
    };
  });

  const maxScore = configuredSections.reduce((sum, section) =>
    sum + (section.maxScore ?? section.puzzles.reduce((points, puzzle) =>
      points + (puzzle.subtasks ?? []).reduce((value, subtask) => value + (subtask.score ?? 0), 0), 0)), 0);
  return {
    sections,
    total: roundFinalScore(sections.reduce((sum, section) => sum + section.score, 0)),
    maxScore
  };
}
