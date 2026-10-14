import { ipcMain } from 'electron';
import { ramStore } from '../services/ramStore.service';
import { cryptoService } from '../services/crypto.service';
import { getStudentIdByIp, getPublicKey, registerDevice, login, getDeviceUuid, getSubmissions } from '../services/api.service';
import { logger, logServerEvent } from '../services/logger.service';
import type { IpcResponse } from '../../common/types';
import { ErrorCode } from '../../common/errorCodes';
import { messageSyncService } from '../services/message-sync.service';
import { configService } from '../services/config.service';
import { judgeManager } from '../services/judge-manager.service';
import { getExtensionForLanguage } from '../services/node-judger.service';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';

/**
 * Auth IPC Handlers
 *
 * Channels:
 * - auth:login               → Verify student ID + register crypto
 * - auth:is-verified         → Check if student is verified
 * - auth:get-student-info    → Get current student information
 */
/**
 * Register this machine with the backend and keep the key in memory.
 *
 * Its own step, not a side effect of logging in.
 *
 * Registration used to happen lazily inside `auth:login`, which tied it to a
 * phase where login is open. Machines are meant to register in INITIALIZED —
 * in an empty room, before any student can log in — so the two had to come
 * apart. It also means a machine that is refused registration says so, instead
 * of surfacing as a failed login.
 */
async function registerThisDevice(): Promise<IpcResponse<void>> {
  logger.info('[Auth] Device registration attempt');
  try {
    const keyResponse = await getPublicKey();
    if (!keyResponse.success || !keyResponse.data?.publicKey) {
      return {
        success: false,
        error: { code: ErrorCode.REGISTRATION_FAILED, message: 'Failed to get RSA public key' }
      };
    }

    const deviceUuid = await getDeviceUuid();
    const { encrypted_aes_key } = cryptoService.buildRegistrationPayload(
      keyResponse.data.publicKey,
      deviceUuid
    );
    const registerResponse = await registerDevice(deviceUuid, encrypted_aes_key);

    if (!registerResponse.success) {
      /* The key was written to memory before the request. Clearing it keeps
       * "holds a key" meaning "the backend knows this key", which is what the
       * page derivation reads — so a machine waiting for approval derives to
       * the approval screen rather than appearing registered. */
      ramStore.cryptoState = null;

      const code = registerResponse.error?.code;
      if (code === 'entry_pending') {
        /* Not a failure to report to the student as an error. The machine has
         * been queued for a TA, which is the normal path for anything arriving
         * after the room has filled — including a restart. */
        logger.info('[Auth] Registration is closed; waiting for TA approval.');
        return {
          success: false,
          error: {
            code: ErrorCode.ENTRY_PENDING,
            message: registerResponse.error?.message ?? 'Waiting for the invigilator to approve this machine.'
          }
        };
      }

      return {
        success: false,
        error: {
          code: code ?? ErrorCode.REGISTRATION_FAILED,
          message: registerResponse.error?.message ?? 'Failed to register device'
        }
      };
    }

    /* From here on this machine is an online one, whatever happens to the
     * connection later. A drop is a drop; it is not a different kind of
     * machine. */
    ramStore.hasEverRegistered = true;
    messageSyncService.registerSocket();
    return { success: true };
  } catch (error) {
    logger.error('[Auth] Error during registration:', error);
    ramStore.cryptoState = null;
    return {
      success: false,
      error: { code: ErrorCode.REGISTRATION_FAILED, message: 'Server unreachable' }
    };
  }
}

/**
 * The roster entry for a student, from whichever half of the paper is in hand.
 *
 * The meta half carries the roster and arrives long before the exam starts;
 * `examConfig` only exists once the paper has been opened. Looking only at the
 * latter meant that before the exam started — and on an offline machine, at any
 * point — there was no roster to check against, and `knownRoster` says so
 * rather than pretending everyone is on it.
 */
function rosterFor(testId: string): {
  knownRoster: boolean;
  entry: { id: string; name: string } | undefined;
} {
  const users =
    ramStore.examConfig?.accessibleUsers ?? ramStore.examConfigMeta?.accessibleUsers ?? [];
  if (users.length === 0) return { knownRoster: false, entry: undefined };
  return {
    knownRoster: true,
    entry: users.find((user) => String(user.id) === String(testId))
  };
}

export function registerAuthIpc(): void {
  /**
   * Device Registration Flow:
   * 1. Get RSA public key
   * 2. Generate AES key + session ID
   * 3. Encrypt and register with server
   */
  ipcMain.handle('auth:register', async (): Promise<IpcResponse<void>> => {
    return registerThisDevice();
  });

  /**
   * Login flow:
   * 1. Check student ID with server
   * 2. If valid → perform login
   */
  ipcMain.handle('auth:login', async (_event, manualTestId?: string): Promise<IpcResponse<void>> => {
    logger.info(`[Auth] Auto-login attempt via IP or manual login`);

    try {
      // 0. Complete Offline Mode Bypass
      if (ramStore.isOfflineMode) {
        if (!manualTestId) {
          return { success: false, error: { code: ErrorCode.STUDENT_NOT_FOUND, message: 'Offline mode requires manual student ID input' } };
        }
        /* The roster comes from the meta half, which an offline machine has
         * and can read. Reading it off `examConfig` meant reading it off the
         * *opened* paper — which does not exist until the exam starts, so the
         * check silently passed everyone through on exactly the path where it
         * is the only check there is. */
        const roster = rosterFor(manualTestId);
        if (roster.knownRoster && !roster.entry) {
          return { success: false, error: { code: ErrorCode.STUDENT_NOT_FOUND, message: '此學號不在本次考試的名單內' } };
        }
        const studentName = roster.entry?.name || manualTestId;
        ramStore.studentInfo = { id: manualTestId, name: studentName };
        ramStore.isStudentVerified = true;
        logger.info(`[Auth] Student ${manualTestId} logged in successfully (Offline Mode Bypass)`);
        return { success: true };
      }

      /* 1. Registration is a prerequisite, not a step of logging in.
       *
       * Doing it here used to mean a machine could register at any phase where
       * login is open — including during the exam, with students in the room.
       * Registration belongs to INITIALIZED; after that it goes through TA
       * approval, and this reports that plainly rather than as a login failure. */
      if (!ramStore.cryptoState) {
        return {
          success: false,
          error: {
            code: ErrorCode.REGISTRATION_FAILED,
            message: 'This machine is not registered yet.'
          }
        };
      }

      // 2. Determine student ID (manual vs IP)
      let testId = manualTestId;
      if (!testId) {
        const idResponse = await getStudentIdByIp();
        if (idResponse.success && idResponse.data?.testId) {
          testId = idResponse.data.testId;
        }
      }
      
      if (testId) {
        // 4. Perform login
        const loginResponse = await login({ testId });
        
        if (loginResponse.success && loginResponse.data?.session_token) {
          const sessionToken = loginResponse.data.session_token;
          
          if (ramStore.cryptoState) {
             ramStore.cryptoState.userSessionID = sessionToken;
          }
          
          ramStore.studentInfo = { id: testId, name: testId }; // Can update name if provided by API
          ramStore.isStudentVerified = true;
          logger.info(`[Auth] Student ${testId} logged in successfully`);
          logServerEvent('USER_LOGIN', `Student ${testId} logged in successfully`);

          // Fetch the config right away now that we have the session token
          const configResult = await configService.fetchAndSaveConfig();
          if (!configResult?.success) {
            logger.error(
              `[Auth] Logged in but the exam paper could not be fetched: ${configResult.error?.message}`
            );
          }

          /* Open the paper if the exam is already running.
           *
           * A machine re-entering mid-exam never sees the phase turn to
           * IN_PROGRESS — `/user/exam/status` is public, so it had already read
           * that value before logging in — and the key used to be fetched only
           * on that turn. The result was a machine holding both sealed halves,
           * no key, and an exam page rendered from a null config: blank, with
           * nothing to say why. */
          const paperResult = await configService.ensureExamPaperReadable();
          if (!paperResult?.success) {
            logger.error(
              `[Auth] Logged in but the exam paper is still sealed: ${paperResult.error?.message}`
            );
          }

          const rosterEntry = rosterFor(testId).entry;
          if (rosterEntry?.name) {
            ramStore.studentInfo = { id: testId, name: rosterEntry.name };
          }
          
          // Refresh messages immediately since initial sync likely failed due to no crypto
          await messageSyncService.manualRefresh();

          // Recover previous submissions if any
          try {
            const submissionsResponse = await getSubmissions();
            if (submissionsResponse.success && submissionsResponse.data) {
              for (const sub of submissionsResponse.data) {
                const ext = getExtensionForLanguage(sub.language);
                const tempPath = path.join(app.getPath('temp'), `recovered_${sub.questionId}.${ext}`);
                fs.writeFileSync(tempPath, sub.codeContent);
                // judgeManager will also save it in localProgramStore
                await judgeManager.runJudge(sub.questionId, tempPath);
                fs.unlinkSync(tempPath);
              }
            }
          } catch (e) {
            logger.error('[Auth] Code recovery failed:', e);
          }
          
          return { success: true };
        } else {
          // 5. Offline Fallback for registered devices
          if (loginResponse.error?.code === 'NETWORK_ERROR' && ramStore.cryptoState) {
            logger.warn(`[Auth] Network down, falling back to offline login for registered device`);
            const roster = rosterFor(testId);
            if (roster.knownRoster && !roster.entry) {
              return { success: false, error: { code: ErrorCode.STUDENT_NOT_FOUND, message: '伺服器無法連線，且此學號不在離線名單內' } };
            }
            const studentName = roster.entry?.name || testId;
            ramStore.studentInfo = { id: testId, name: studentName };
            ramStore.isStudentVerified = true;
            ramStore.pendingLoginSync = true;
            logger.info(`[Auth] Student ${testId} logged in successfully (Retroactive Offline Fallback)`);
            return { success: true };
          }

          // Login failed but not a network error
          const errorCode = loginResponse.error?.code || ErrorCode.STUDENT_NOT_FOUND;

          /* The registration survives the failed login.
           *
           * Registration and login are two independent layers: being refused
           * as a student says nothing about whether this machine's key is
           * known to the backend. Discarding the key here sent the machine
           * back to the approval screen, which retries registration every five
           * seconds — and with registration closed, every retry filed another
           * request for a TA. One binding conflict became an unbounded queue.
           *
           * The device layer has its own signal for "this machine is not
           * registered": the backend answers 401 and `makeErrorResponse` raises
           * a force-logout, which clears the key on the way past. */
          return {
            success: false,
            error: {
              code: errorCode,
              message: loginResponse.error?.message || 'Login failed'
            }
          };
        }
      }
      
      return {
        success: false,
        error: { code: ErrorCode.STUDENT_NOT_FOUND, message: 'Auto-login failed. IP not recognized or login failed.' }
      };

    } catch (error) {
      /* Same reasoning as the refusal above: an unreachable server is the least
       * likely moment to throw away a working registration, since re-registering
       * needs that same server. */
      logger.error('[Auth] Error during login:', error);
      return {
        success: false,
        error: {
          code: ErrorCode.NO_RESPONSE,
          message: 'Server unreachable or error during login'
        }
      };
    }
  });

  ipcMain.handle('auth:is-verified', () => {
    return ramStore.isStudentVerified;
  });

  /* Whether this machine currently holds a device key.
   *
   * The key lives in memory only, so a restart loses it and this reports false
   * again — which is the honest answer: to the backend that machine is now
   * indistinguishable from an unregistered one, and it has to re-enter through
   * the same gate. The router derives the page from this. */
  ipcMain.handle('auth:is-registered', () => {
    return ramStore.cryptoState !== null;
  });

  ipcMain.handle('auth:get-student-info', () => {
    return ramStore.studentInfo;
  });
}
