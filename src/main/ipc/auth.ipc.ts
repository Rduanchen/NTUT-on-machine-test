import { ipcMain } from 'electron';
import { ramStore } from '../services/ramStore.service';
import { cryptoService } from '../services/crypto.service';
import { getStudentIdByIp, getPublicKey, registerDevice, login, getMacAddresses } from '../services/api.service';
import { logger } from '../services/logger.service';
import type { IpcResponse } from '../../common/types';
import { ErrorCode } from '../../common/errorCodes';
import { messageSyncService } from '../services/message-sync.service';

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
   * Device Registration Flow:
   * 1. Get RSA public key
   * 2. Generate AES key + session ID
   * 3. Encrypt and register with server
   */
  ipcMain.handle('auth:register', async (_event): Promise<IpcResponse<void>> => {
    logger.info(`[Auth] Manual device registration attempt`);
    try {
      const keyResponse = await getPublicKey();
      if (!keyResponse.success || !keyResponse.data?.publicKey) {
        return { success: false, error: { code: ErrorCode.REGISTRATION_FAILED, message: 'Failed to get RSA public key' } };
      }

      const deviceUuid = getMacAddresses();
      const { encrypted_aes_key } = cryptoService.buildRegistrationPayload(keyResponse.data.publicKey, deviceUuid);
      const registerResponse = await registerDevice(deviceUuid, encrypted_aes_key);

      if (!registerResponse.success) {
        return { success: false, error: { code: ErrorCode.REGISTRATION_FAILED, message: 'Failed to register device' } };
      }

      messageSyncService.registerSocket();
      return { success: true };
    } catch (error) {
      logger.error('[Auth] Error during registration:', error);
      return { success: false, error: { code: ErrorCode.REGISTRATION_FAILED, message: 'Server unreachable' } };
    }
  });

  /**
   * Login flow:
   * 1. Check student ID with server
   * 2. If valid → perform login
   */
  ipcMain.handle('auth:login', async (_event, manualTestId?: string): Promise<IpcResponse<void>> => {
    logger.info(`[Auth] Auto-login attempt via IP or manual login`);

    try {
      // 1. Ensure device is registered
      if (!ramStore.cryptoState) {
        const keyResponse = await getPublicKey();
        if (!keyResponse.success || !keyResponse.data?.publicKey) {
          return { success: false, error: { code: ErrorCode.REGISTRATION_FAILED, message: 'Failed to get RSA public key' } };
        }
        const deviceUuid = getMacAddresses();
        const { encrypted_aes_key } = cryptoService.buildRegistrationPayload(keyResponse.data.publicKey, deviceUuid);
        const registerResponse = await registerDevice(deviceUuid, encrypted_aes_key);
        if (!registerResponse.success) {
          return { success: false, error: { code: ErrorCode.REGISTRATION_FAILED, message: 'Failed to register device with server' } };
        }
        messageSyncService.registerSocket();
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
          return { success: true };
        } else {
          ramStore.cryptoState = null;
          return {
            success: false,
            error: {
              code: ErrorCode.STUDENT_NOT_FOUND,
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
      logger.error('[Auth] Error during login:', error);
      ramStore.cryptoState = null;
      return {
        success: false,
        error: {
          code: ErrorCode.REGISTRATION_FAILED,
          message: 'Server unreachable or error during login'
        }
      };
    }
  });

  ipcMain.handle('auth:is-verified', () => {
    return ramStore.isStudentVerified;
  });

  ipcMain.handle('auth:get-student-info', () => {
    return ramStore.studentInfo;
  });
}
