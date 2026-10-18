import type { SpecialRuleResultRecord } from './types';

/** Apply one puzzle-level penalty if any effective special rule failed. */
export function applyPuzzleRuleMultiplier(
  score: number,
  results: Pick<SpecialRuleResultRecord, 'passed'>[],
  puzzleMultiplier = 0.5,
): number {
  const multiplier = results.some((result) => !result.passed) ? puzzleMultiplier : 1;
  return score * multiplier;
}

/** Round the accumulated exam score once, after all puzzle and section scores are added. */
export function roundFinalScore(score: number): number {
  return Math.round(score);
}
