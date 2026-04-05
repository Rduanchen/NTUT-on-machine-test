import { describe, expect, it } from 'vitest';

import type { SpecialRule, SpecialRuleResultRecord } from '../../src/common/types';

function summarizeRulesChip(input: {
  effectiveSpecialRules: SpecialRule[];
  specialRuleResults?: SpecialRuleResultRecord[];
}) {
  const effectiveRuleCount = input.effectiveSpecialRules.length;
  if (effectiveRuleCount === 0) return { text: 'Rules N/A', color: 'grey' };

  const results = input.specialRuleResults;
  if (!results || results.length === 0) {
    return { text: `Rules 0/${effectiveRuleCount}`, color: 'grey' };
  }

  const effectiveIds = new Set(input.effectiveSpecialRules.map((r) => r.id));
  const effectiveResults = results.filter((r) => effectiveIds.has(r.ruleId));
  const passed = effectiveResults.filter((r) => r.passed).length;
  const allPassed = effectiveResults.length === effectiveRuleCount && passed === effectiveRuleCount;

  return { text: `Rules ${passed}/${effectiveRuleCount}`, color: allPassed ? 'success' : 'error' };
}

describe('special rules UI mapping', () => {
  it('counts only effective rules and ignores stale results', () => {
    const effective: SpecialRule[] = [
      {
        id: 'r1',
        type: 'includes',
        constraint: 'MUST_HAVE',
        message: 'must include main',
        params: { needle: 'main' },
      },
    ];

    const results: SpecialRuleResultRecord[] = [
      {
        ruleId: '__engine_error__',
        passed: false,
        message: 'Special rule evaluation failed',
        reason: 'boom',
        checkedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        ruleId: 'r1',
        passed: true,
        message: 'must include main',
        checkedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    expect(summarizeRulesChip({ effectiveSpecialRules: effective, specialRuleResults: results })).toEqual({
      text: 'Rules 1/1',
      color: 'success',
    });
  });

  it('shows error if any effective rule fails', () => {
    const effective: SpecialRule[] = [
      {
        id: 'r1',
        type: 'includes',
        constraint: 'MUST_HAVE',
        message: 'must include main',
        params: { needle: 'main' },
      },
      {
        id: 'r2',
        type: 'includes',
        constraint: 'MUST_HAVE',
        message: 'must include scanf',
        params: { needle: 'scanf' },
      },
    ];

    const results: SpecialRuleResultRecord[] = [
      {
        ruleId: 'r1',
        passed: true,
        message: 'must include main',
        checkedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        ruleId: 'r2',
        passed: false,
        message: 'must include scanf',
        reason: 'missing',
        checkedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    expect(summarizeRulesChip({ effectiveSpecialRules: effective, specialRuleResults: results })).toEqual({
      text: 'Rules 1/2',
      color: 'error',
    });
  });
});
