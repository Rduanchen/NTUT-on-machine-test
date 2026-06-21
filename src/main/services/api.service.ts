import axios, { AxiosInstance } from 'axios';
import { ramStore } from './ramStore.service';
import { cryptoService } from './crypto.service';
import { logger } from './logger.service';
import * as os from 'os';
import * as si from 'systeminformation';
import type {
  ExamConfig,
  LogActionPayload,
  IpcResponse,
  ServerMessage
} from '../../common/types';
import { getMainWindow } from '../system/windowManager';

const API_TIMEOUT = 5000;

let cachedDeviceUuid: string | null = null;

export async function getDeviceUuid(): Promise<string> {
  if (cachedDeviceUuid) return cachedDeviceUuid;

  try {
    const baseboard = await si.baseboard();
    if (baseboard.serial && baseboard.serial !== '-' && baseboard.serial.toLowerCase() !== 'unknown') {
      cachedDeviceUuid = baseboard.serial;
      return cachedDeviceUuid;
    }
    const system = await si.system();
    if (system.uuid && system.uuid !== '-' && system.uuid.toLowerCase() !== 'unknown') {
      cachedDeviceUuid = system.uuid;
      return cachedDeviceUuid;
    }
  } catch (e) {
    logger.warn('[getDeviceUuid] Failed to get hardware info, falling back to mac address');
  }

  const interfaces = os.networkInterfaces();
  for (const name in interfaces) {
    const nets = interfaces[name];
    if (!nets) continue;
    for (const net of nets) {
      if (!net.internal && net.mac !== '00:00:00:00:00:00') {
        cachedDeviceUuid = net.mac;
        return cachedDeviceUuid;
      }
    }
  }
  
  cachedDeviceUuid = 'fallback-uuid-' + Date.now();
  return cachedDeviceUuid;
}

function createPublicClient(): AxiosInstance {
  const client = axios.create({
    timeout: API_TIMEOUT,
    headers: { 'Content-Type': 'application/json' }
  });
  return client;
}

function createAuthenticatedClient(): AxiosInstance {
  const client = axios.create({
    timeout: API_TIMEOUT,
    headers: { 'Content-Type': 'application/json' }
  });

  client.interceptors.request.use(async (config) => {
    try {
      const cryptoState = ramStore.cryptoState;
      if (!cryptoState) throw new Error('Crypto state not initialized');

      const deviceUuid = await getDeviceUuid();
      let originalData = config.data;
      if (typeof originalData === 'string') {
        try { originalData = JSON.parse(originalData); } catch (e) {}
      }

      const payloadObj = {
        ...(originalData || {}),
        timestamp: Date.now(),
        nonce: cryptoService.generateRandomString(),
        session_token: cryptoState.userSessionID
      };
      
      const encryptedPayload = cryptoService.encryptAesPayload(
        JSON.stringify(payloadObj), 
        cryptoState.aesKeyHex, 
        deviceUuid
      );
      
      config.data = encryptedPayload;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.silly(`[API] Failed to encrypt body for authenticated request: ${msg}`);
      return Promise.reject(err);
    }
    return config;
  });

  return client;
}

const publicClient = createPublicClient();
const authClient = createAuthenticatedClient();

function getBaseUrl(): string {
  const url = ramStore.backendUrl;
  if (!url) throw new Error('Backend URL not configured');
  return url.replace(/\/+$/, '') + '/user';
}

// ─── Auth APIs ──────────────────────────────────────────────────────

export async function getStudentIdByIp(): Promise<IpcResponse<{ testId: string }>> {
  try {
    const response = await publicClient.get(`${getBaseUrl()}/auth/student-id`);
    return { success: true, data: response.data };
  } catch (error) {
    return makeErrorResponse('getStudentIdByIp', error);
  }
}

export async function getPublicKey(): Promise<IpcResponse<{ publicKey: string }>> {
  try {
    const response = await publicClient.get(`${getBaseUrl()}/auth/rsa-public-key`);
    return { success: true, data: response.data };
  } catch (error) {
    return makeErrorResponse('getPublicKey', error);
  }
}

export async function registerDevice(device_uuid: string, encrypted_aes_key: string): Promise<IpcResponse<void>> {
  try {
    const response = await publicClient.post(`${getBaseUrl()}/auth/register-device`, { device_uuid, encrypted_aes_key });
    return { success: true, data: response.data };
  } catch (error) {
    return makeErrorResponse('registerDevice', error);
  }
}

export async function login(payload: { testId: string; password?: string }): Promise<IpcResponse<{ session_token: string }>> {
  try {
    const response = await authClient.post(`${getBaseUrl()}/auth/login`, payload);
    return { success: true, data: response.data };
  } catch (error) {
    return makeErrorResponse('login', error);
  }
}

// ─── Exam APIs ──────────────────────────────────────────────────────

export async function getExamStatus(): Promise<IpcResponse<{ status: string }>> {
  try {
    const response = await publicClient.get(`${getBaseUrl()}/exam/status`);
    return { success: true, data: response.data };
  } catch (error) {
    return makeErrorResponse('getExamStatus', error);
  }
}

export async function fetchSecureExamConfig(): Promise<IpcResponse<ExamConfig>> {
  try {
    const response = await authClient.post(`${getBaseUrl()}/exam/config`, {});
    const encryptedConfig = response.data;
    
    if (!encryptedConfig) {
      throw new Error('Missing encryptedConfig payload');
    }

    const cryptoState = ramStore.cryptoState;
    if (!cryptoState) {
      throw new Error('Crypto credentials not initialized');
    }

    const decrypted = cryptoService.decryptAesPayload(encryptedConfig, cryptoState.aesKeyHex);
    const parsed = JSON.parse(decrypted) as ExamConfig;
    return { success: true, data: parsed };
  } catch (error) {
    return makeErrorResponse('fetchSecureExamConfig', error);
  }
}

export async function submitCode(codeContent: string, questionId: string, language: string): Promise<IpcResponse<void>> {
  try {
    const response = await authClient.post(`${getBaseUrl()}/submissions/code`, { codeContent, questionId, language });
    return { success: true, data: response.data };
  } catch (error) {
    return makeErrorResponse('submitCode', error);
  }
}

export async function getSubmissions(): Promise<IpcResponse<any[]>> {
  try {
    const response = await authClient.get(`${getBaseUrl()}/submissions/codes`);
    return { success: true, data: response.data };
  } catch (error) {
    return makeErrorResponse('getSubmissions', error);
  }
}

export async function submitScore(payload: { 
  score: number, 
  puzzleResults?: any, 
  subtaskAmount?: number, 
  passedSubtaskAmount?: number, 
  puzzleAmount?: number, 
  passedPuzzleAmount?: number 
}): Promise<IpcResponse<void>> {
  try {
    const response = await authClient.post(`${getBaseUrl()}/submissions/score`, payload);
    return { success: true, data: response.data };
  } catch (error) {
    return makeErrorResponse('submitScore', error);
  }
}

// ─── Log APIs ───────────────────────────────────────────────────────

export async function logAction(payload: LogActionPayload): Promise<IpcResponse<void>> {
  try {
    if (!ramStore.cryptoState?.userSessionID) {
       return { success: false, error: { code: 'NOT_LOGGED_IN', message: 'Cannot send logs before login' } };
    }

    const mappedPayload = {
      ...payload,
      actionType: payload.action
    };
    const response = await authClient.post(`${getBaseUrl()}/log`, mappedPayload);
    return { success: true, data: response.data };
  } catch (error) {
    return makeErrorResponse('logAction', error);
  }
}

// ─── Message APIs ───────────────────────────────────────────────────

export async function getMessages(afterId?: string): Promise<IpcResponse<ServerMessage[]>> {
  try {
    const response = await authClient.post(`${getBaseUrl()}/exam/messages`, { lastMessageId: afterId || 0 });
    const payload = response.data;

    const cryptoState = ramStore.cryptoState;
    if (!cryptoState) {
      throw new Error('Crypto credentials not initialized');
    }

    const decrypted = cryptoService.decryptAesPayload(payload, cryptoState.aesKeyHex);
    const parsed = JSON.parse(decrypted);

    const normalized = Array.isArray(parsed) ? parsed : [];
    return { success: true, data: normalized as ServerMessage[] };
  } catch (error) {
    return makeErrorResponse('getMessages', error);
  }
}

// ─── Health Check ───────────────────────────────────────────────────

export async function healthCheck(host?: string): Promise<boolean> {
  try {
    const baseUrl = host ? host.replace(/\/+$/, '') : ramStore.backendUrl.replace(/\/+$/, '');
    // Use the public status endpoint for health check
    await publicClient.get(`${baseUrl}/user/exam/status`, { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

// ─── Error Helper ───────────────────────────────────────────────────

function makeErrorResponse(context: string, error: unknown): IpcResponse<any> {
  let message = '';
  let code = 'NETWORK_ERROR';
  if (axios.isAxiosError(error)) {
    if (error.response) {
      code = error.response.data?.code || `HTTP_${error.response.status}`;
      message = error.response.data?.error || error.response.data?.message || error.message;
    } else {
      code = 'NETWORK_ERROR';
      message = error.message;
    }
  } else if (error instanceof Error) {
    message = error.message;
  } else {
    message = String(error);
  }
  
  if (code === 'CRYPTO_VERIFICATION_FAILED' || 
      code === 'HTTP_401' ||
      (typeof message === 'string' && (message.includes('not registered') || message.includes('Unauthorized')))) {
    try {
      const win = getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents?.send('app:force-logout', message || '您的裝置已被登出或解除綁定。');
      }
    } catch (e) {
      // Ignore if window not available
    }
  }

  logger.silly(`[API] ${context}: ${message}`);
  return {
    success: false,
    error: {
      code,
      message
    }
  };
}
