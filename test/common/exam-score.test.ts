import { describe, expect, it } from 'vitest';
import { formatScore, summarizeExamScore } from '../../src/common/exam-score';
import type { ExamConfig, JudgeRunResult, SpecialRuleResultRecord } from '../../src/common/types';

const config = {
  sections: [{
    id: 's1', title: '第一區', maxScore: 2,
    puzzles: [
      { id: 'p1', title: '題一', multiplier: 0.5, subtasks: [{ score: 1.1111 }, { score: 1.1111 }] },
      { id: 'p2', title: '題二', subtasks: [{ score: 1 }] }
    ]
  }, {
    id: 's2', title: '第二區', maxScore: 1,
    puzzles: [{ id: 'p3', title: '題三', subtasks: [{ score: 1 }] }]
  }]
} as ExamConfig;

const ac = [{ statusCode: 'AC' }];
const failedRule = [{ passed: false }] as SpecialRuleResultRecord[];

describe('exam score presentation', () => {
  it('uses nonempty fully accepted subtasks, penalties, section caps and one final rounding', () => {
    const results = {
      p1: { subtasks: [ac, ac] },
      p2: { subtasks: [[]] },
      p3: { subtasks: [ac] }
    } as Record<string, JudgeRunResult>;
    const summary = summarizeExamScore(config, results, { p1: failedRule }, '預設區');

    expect(summary.sections.map((section) => section.score)).toEqual([1.1111, 1]);
    expect(summary.sections.map((section) => section.passedSubtasks)).toEqual([2, 1]);
    expect(summary.total).toBe(2);
    expect(summary.maxScore).toBe(3);
    expect(summary.sections.map((section) => formatScore(section.score))).toEqual(['1.111', '1']);
  });

  it('does not cap a legacy flat paper at zero', () => {
    const flat = { sections: [], puzzles: [{ id: 'p', title: '題目', subtasks: [{ score: 2.5 }] }] } as ExamConfig;
    const summary = summarizeExamScore(flat, { p: { subtasks: [ac] } } as any, {}, '預設區');
    expect(summary.sections[0].score).toBe(2.5);
    expect(summary.sections[0].maxScore).toBe(2.5);
    expect(summary.total).toBe(3);
  });

  it('formats no more than three decimal places', () => {
    expect(formatScore(12.3456)).toBe('12.346');
    expect(formatScore(12.5)).toBe('12.5');
  });
});
