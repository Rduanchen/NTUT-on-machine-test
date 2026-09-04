import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { derivePage } from '../../src/renderer/router/phase-derivation';

/**
 * The INITIALIZED phase must not offer a way to log in.
 *
 * Machines register and check their toolchain in an empty room; students are
 * not meant to be sitting at them yet. A login box here would invite someone to
 * start before registration has closed — the window this whole phase split
 * exists to shut.
 *
 * Asserted against the source rather than a mounted component: the renderer
 * runs under `environment: node` here, and what matters is that no login route
 * or entry point exists in the page at all, which reads directly.
 */
const source = readFileSync(
  resolve(__dirname, '../../src/renderer/pages/StandbyPage.vue'),
  'utf-8'
);

describe('StandbyPage', () => {
  it('offers no route to the login page', () => {
    expect(source).not.toMatch(/['"]\/login['"]/);
    expect(source).not.toMatch(/name:\s*['"]login['"]/);
  });

  it('offers no student identifier input', () => {
    expect(source).not.toMatch(/v-text-field/);
    expect(source).not.toMatch(/studentId/i);
  });

  it('does not call the login handler', () => {
    expect(source).not.toMatch(/auth\??\.\??login/);
  });

  it('shows the two things this phase is for', () => {
    expect(source).toContain('data-test="registration-status"');
    expect(source).toContain('data-test="environment-status"');
  });

  it('lets a failed environment check be retried on the spot', () => {
    // A seat that cannot compile is the one thing an invigilator must act on
    // before students arrive, so it should not need a restart to re-check.
    expect(source).toContain('data-test="retry-environment"');
  });
});

describe('the phase that routes here', () => {
  it('is the only phase that resolves to standby', () => {
    expect(derivePage('INITIALIZED', 'UNREGISTERED')).toBe('standby');
    expect(derivePage('INITIALIZED', 'REGISTERED')).toBe('standby');

    for (const phase of ['UNINITIALIZED', 'SETUP_FINISHED', 'IN_PROGRESS', 'FINISHED'] as const) {
      expect(derivePage(phase, 'REGISTERED')).not.toBe('standby');
    }
  });
});
