import type { ExamState } from '../../common/types';

/**
 * What this machine has achieved locally, independent of the global phase.
 *
 * Kept to three values on purpose. The desktop holds no exam phase of its own —
 * before feature 007 it effectively did, spread across a router guard and a
 * `router.push` in five different pages, and those copies could disagree with
 * each other and with the backend.
 */
export type DeviceState = 'UNREGISTERED' | 'REGISTERED' | 'LOGGED_IN';

export type DerivedPage =
  | 'not-initialized'
  | 'standby'
  | 'pending-approval'
  | 'login'
  | 'waiting'
  | 'exam'
  | 'finished';

/**
 * The page this machine belongs on, derived rather than remembered.
 *
 * This is the whole of the student-side state model: page = f(global phase,
 * local device state). Nothing else is stored, so nothing else can drift — and
 * "going back a step" needs no mechanism, because clearing the device state and
 * re-deriving lands in the right place on its own.
 *
 * Mirrors EXAM-LIFECYCLE.md §4.2.
 */
export function derivePage(examStatus: ExamState, device: DeviceState): DerivedPage {
  switch (examStatus) {
    case 'UNINITIALIZED':
      // Nothing exists to register against yet, whatever this machine has done.
      return 'not-initialized';

    case 'INITIALIZED':
      // Machines are in the room, students are not. Register, check the
      // environment, then wait — with no way to log in.
      return 'standby';

    case 'SETUP_FINISHED':
      if (device === 'LOGGED_IN') return 'waiting';
      if (device === 'REGISTERED') return 'login';
      return 'pending-approval';

    case 'IN_PROGRESS':
      if (device === 'LOGGED_IN') return 'exam';
      if (device === 'REGISTERED') return 'login';
      return 'pending-approval';

    case 'FINISHED':
      return 'finished';

    default:
      /* An unknown phase — an older or newer backend, or a corrupt value —
       * resolves to the page that grants nothing. */
      return 'not-initialized';
  }
}

/**
 * Whether the settings page may be opened.
 *
 * Settings can change the backend URL and load an exam paper from a file. Once
 * students are in the room that is a way for one of them to detach their own
 * machine from every server-side control — force logout, phase broadcasts,
 * violation reporting — while still being able to answer questions. From the
 * invigilator's console it is indistinguishable from a network fault.
 */
export function isSettingsReachable(examStatus: ExamState): boolean {
  return examStatus === 'UNINITIALIZED' || examStatus === 'INITIALIZED';
}
