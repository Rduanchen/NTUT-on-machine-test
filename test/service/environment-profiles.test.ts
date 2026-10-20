import { describe, expect, it } from 'vitest';
import {
  ENVIRONMENT_LANGUAGE_ORDER,
  ENVIRONMENT_LANGUAGE_PROFILES
} from '../../src/main/judge/node-judger/environment-profiles';

describe('environment language profiles', () => {
  it('defines bounded smoke, TLE, and MLE diagnostics for every supported language', () => {
    expect(ENVIRONMENT_LANGUAGE_ORDER).toEqual(['C', 'Cpp', 'Python', 'JavaScript', 'Java']);
    for (const language of ENVIRONMENT_LANGUAGE_ORDER) {
      const profile = ENVIRONMENT_LANGUAGE_PROFILES[language];
      expect(profile.language).toBe(language);
      expect(profile.tools.length).toBeGreaterThan(0);
      for (const diagnostic of [profile.smoke, profile.tle, profile.mle]) {
        expect(diagnostic.source.length).toBeGreaterThan(0);
        expect(diagnostic.source.length).toBeLessThan(2_000);
        expect(diagnostic.timeLimitMs).toBeGreaterThan(0);
        expect(diagnostic.timeLimitMs).toBeLessThanOrEqual(10_000);
        expect(diagnostic.memoryLimitBytes).toBeGreaterThan(0);
      }
    }
  });

  it('checks both the Java compiler and runtime', () => {
    expect(ENVIRONMENT_LANGUAGE_PROFILES.Java.tools.map((tool) => tool.command)).toEqual([
      'javac',
      'java'
    ]);
  });
});
