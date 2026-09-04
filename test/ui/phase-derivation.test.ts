import { describe, expect, it } from 'vitest';

import {
  derivePage,
  isSettingsReachable,
  type DerivedPage,
  type DeviceState
} from '../../src/renderer/router/phase-derivation';
import type { ExamState } from '../../src/common/types';

const PHASES: ExamState[] = [
  'UNINITIALIZED',
  'INITIALIZED',
  'SETUP_FINISHED',
  'IN_PROGRESS',
  'FINISHED'
];

const DEVICE_STATES: DeviceState[] = ['UNREGISTERED', 'REGISTERED', 'LOGGED_IN'];

/**
 * The expected table, written out independently of the implementation.
 *
 * Mirrors EXAM-LIFECYCLE.md §4.2 by hand rather than importing anything from
 * the module under test — a table checked against itself proves nothing.
 */
const EXPECTED: Record<ExamState, Record<DeviceState, DerivedPage>> = {
  UNINITIALIZED: {
    UNREGISTERED: 'not-initialized',
    REGISTERED: 'not-initialized',
    LOGGED_IN: 'not-initialized'
  },
  INITIALIZED: {
    UNREGISTERED: 'standby',
    REGISTERED: 'standby',
    LOGGED_IN: 'standby'
  },
  SETUP_FINISHED: {
    UNREGISTERED: 'pending-approval',
    REGISTERED: 'login',
    LOGGED_IN: 'waiting'
  },
  IN_PROGRESS: {
    UNREGISTERED: 'pending-approval',
    REGISTERED: 'login',
    LOGGED_IN: 'exam'
  },
  FINISHED: {
    UNREGISTERED: 'finished',
    REGISTERED: 'finished',
    LOGGED_IN: 'finished'
  }
};

describe('derivePage', () => {
  for (const phase of PHASES) {
    for (const device of DEVICE_STATES) {
      it(`sends a ${device} machine to ${EXPECTED[phase][device]} in ${phase}`, () => {
        expect(derivePage(phase, device)).toBe(EXPECTED[phase][device]);
      });
    }
  }

  it('grants nothing for a phase this build does not know', () => {
    // A backend that is older or newer than this client must not resolve to a
    // page that lets a student do something.
    expect(derivePage('NOT_STARTED' as ExamState, 'LOGGED_IN')).toBe('not-initialized');
  });

  describe('the properties behind the table', () => {
    it('never offers login before students are meant to be in the room', () => {
      for (const device of DEVICE_STATES) {
        expect(derivePage('INITIALIZED', device)).not.toBe('login');
        expect(derivePage('INITIALIZED', device)).not.toBe('exam');
      }
    });

    it('never shows the exam to a machine that has not logged in', () => {
      expect(derivePage('IN_PROGRESS', 'UNREGISTERED')).not.toBe('exam');
      expect(derivePage('IN_PROGRESS', 'REGISTERED')).not.toBe('exam');
    });

    it('sends an unregistered machine to approval once the gate has closed', () => {
      // A restart loses the in-memory key, so a machine that was mid-exam
      // arrives here. It re-enters through the gate rather than being stuck.
      expect(derivePage('SETUP_FINISHED', 'UNREGISTERED')).toBe('pending-approval');
      expect(derivePage('IN_PROGRESS', 'UNREGISTERED')).toBe('pending-approval');
    });

    it('ends the exam for everyone regardless of local state', () => {
      const pages = DEVICE_STATES.map((device) => derivePage('FINISHED', device));
      expect(new Set(pages)).toEqual(new Set(['finished']));
    });
  });
});

describe('isSettingsReachable', () => {
  it.each(['UNINITIALIZED', 'INITIALIZED'] as ExamState[])('is open in %s', (phase) => {
    expect(isSettingsReachable(phase)).toBe(true);
  });

  it.each(['SETUP_FINISHED', 'IN_PROGRESS', 'FINISHED'] as ExamState[])(
    'is closed in %s',
    (phase) => {
      expect(isSettingsReachable(phase)).toBe(false);
    }
  );

  it('is closed for an unknown phase', () => {
    expect(isSettingsReachable('NOT_STARTED' as ExamState)).toBe(false);
  });
});
