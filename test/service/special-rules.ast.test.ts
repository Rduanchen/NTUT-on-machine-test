import { describe, expect, it } from 'vitest';
import { evaluateSpecialRules } from '../../src/main/services/special-rules.service';

describe('Python AST rules through the shared engine', () => {
  it('evaluates a Python feature', async () => {
    const results = await evaluateSpecialRules({
      rules: [{
        id: 'python-if', type: 'pythonFeature', constraint: 'MUST_HAVE',
        message: 'Use an if statement', params: { features: ['IF'] },
      }],
      language: 'Python',
      sourceText: 'if value:\n    print(value)\n',
      checkedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(results).toEqual([
      expect.objectContaining({ ruleId: 'python-if', passed: true, checkedAt: '2026-01-01T00:00:00.000Z' }),
    ]);
  });

  it('evaluates a Python feature nested in a composite', async () => {
    const results = await evaluateSpecialRules({
      rules: [{
        id: 'composite-if', type: 'composite', constraint: 'MUST_HAVE',
        message: 'Use an if statement',
        params: {
          op: 'AND',
          rules: [{
            id: 'nested-python-if', type: 'pythonFeature', constraint: 'MUST_HAVE',
            message: 'Use an if statement', params: { features: ['IF'] },
          }],
        },
      }],
      language: 'Python',
      sourceText: 'if value:\n    print(value)\n',
    });

    expect(results).toMatchObject([{ ruleId: 'composite-if', passed: true }]);
  });
});
