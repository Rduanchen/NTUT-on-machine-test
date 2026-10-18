import { describe, expect, it } from 'vitest';
import {
  EnvironmentCheckRunner,
  probeEnvironmentTool
} from '../../src/main/judge/node-judger/environment-check-runner';
import {
  ENVIRONMENT_LANGUAGE_ORDER,
  ENVIRONMENT_LANGUAGE_PROFILES
} from '../../src/main/judge/node-judger/environment-profiles';

const runIntegration = process.env.RUN_ENVIRONMENT_CHECK_INTEGRATION === '1';

describe.skipIf(!runIntegration)('installed compiler/runtime integration matrix', () => {
  for (const language of ENVIRONMENT_LANGUAGE_ORDER) {
    it(`${language}: probe, smoke, TLE and MLE`, async (context) => {
      const profile = ENVIRONMENT_LANGUAGE_PROFILES[language];
      const controller = new AbortController();
      const probes = await Promise.all(
        profile.tools.map((tool) => probeEnvironmentTool(tool, controller.signal))
      );
      if (probes.some((probe) => probe.status === 'failed')) {
        console.warn(
          `[environment integration] ${language} skipped: required tool is not installed`
        );
        context.skip();
        return;
      }
      const result = await new EnvironmentCheckRunner().runLanguage(profile, controller.signal);
      expect(result.status).toBe('passed');
      expect(result.checks).toEqual([
        expect.objectContaining({ kind: 'smoke', status: 'passed' }),
        expect.objectContaining({ kind: 'tle', status: 'passed' }),
        expect.objectContaining({ kind: 'mle', status: 'passed' })
      ]);
    }, 20_000);
  }
});
