import { ipcMain } from 'electron';
import { ramStore } from '../services/ramStore.service';
import { cryptoService } from '../services/crypto.service';
import { checkStudentId, getPublicKey, registerUser } from '../services/api.service';
import { logger } from '../services/logger.service';
import type { IpcResponse } from '../../common/types';
import { ErrorCode } from '../../common/errorCodes';

/**
 * Auth IPC Handlers
 *
 * Channels:
 * - auth:login               → Verify student ID + register crypto
 * - auth:is-verified         → Check if student is verified
 * - auth:get-student-info    → Get current student information
 */
export function registerAuthIpc(): void {
  /**
   * Login flow:
   * 1. Check student ID with server (or fallback to local config)
   * 2. If valid → get RSA public key
   * 3. Generate AES key + session ID
   * 4. Encrypt and register with server
   * 5. Save student info + crypto state to RAM
   */
  ipcMain.handle('auth:login', async (_event, studentID: string): Promise<IpcResponse<void>> => {
    logger.info(`[Auth] Login attempt for student: ${studentID}`);

    // Try server verification first
    const serverResponse = await checkStudentId(studentID);

    if (serverResponse.success) {
      // Server is available - do full crypto registration
      try {
        // Get RSA public key
        const keyResponse = await getPublicKey();
        if (!keyResponse.success || !keyResponse.data?.publicKey) {
          return {
            success: false,
            error: { code: ErrorCode.REGISTRATION_FAILED, message: 'Failed to get RSA public key' }
          };
        }

        // Set student info in RAM
        ramStore.studentInfo = { id: studentID, name: serverResponse.data?.name || studentID };

        // Generate crypto keys and register
        const { encryptedPayload } = cryptoService.initializeCrypto(keyResponse.data.publicKey);
        const registerResponse = await registerUser(encryptedPayload);

        if (!registerResponse.success) {
          return {
            success: false,
            error: {
              code: ErrorCode.REGISTRATION_FAILED,
              message: 'Failed to register with server'
            }
          };
        }

        ramStore.isStudentVerified = true;
        logger.info(`[Auth] Student ${studentID} registered successfully with server`);
        return { success: true };
      } catch (error) {
        logger.error('[Auth] Error during server registration:', error);
        // Fall through to offline verification
      }
    }

    // Offline verification: check against accessibleUsers in config
    const config = ramStore.examConfig;
    if (!config) {
      return {
        success: false,
        error: {
          code: ErrorCode.STUDENT_NOT_FOUND,
          message: 'No config loaded and server unavailable'
        }
      };
    }

    const user = config.accessibleUsers.find((u) => u.id === studentID);
    if (!user) {
      return {
        success: false,
        error: { code: ErrorCode.STUDENT_NOT_FOUND, message: 'Student ID not found' }
      };
    }

    ramStore.studentInfo = { id: user.id, name: user.name };
    ramStore.isStudentVerified = true;
    logger.info(`[Auth] Student ${studentID} verified offline`);
    return { success: true };
  });

  ipcMain.handle('auth:is-verified', () => {
    return ramStore.isStudentVerified;
  });

  ipcMain.handle('auth:get-student-info', () => {
    return ramStore.studentInfo;
  });
}
