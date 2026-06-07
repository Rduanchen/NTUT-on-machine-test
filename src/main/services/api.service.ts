import axios, { AxiosInstance } from 'axios';
import { ramStore } from './ramStore.service';
import { cryptoService } from './crypto.service';
import { logger } from './logger.service';
import * as os from 'os';
import type {
  ExamConfig,
  LogActionPayload,
  IpcResponse,
  ServerMessage
} from '../../common/types';

const API_TIMEOUT = 5000;

export function getMacAddresses() {
  const interfaces = os.networkInterfaces();
  for (const name in interfaces) {
    const nets = interfaces[name];
    if (!nets) continue;
    for (const net of nets) {
      if (!net.internal && net.mac !== '00:00:00:00:00:00') {
        return net.mac;
      }
    }
  }
  return 'unknown';
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

  client.interceptors.request.use((config) => {
    try {
      const cryptoState = ramStore.cryptoState;
      if (!cryptoState) throw new Error('Crypto state not initialized');

      const deviceUuid = getMacAddresses();
      const payloadObj = {
        timestamp: Date.now(),
        nonce: cryptoService.generateRandomString(),
        session_token: cryptoState.userSessionID,
        ...(config.data || {})
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

export async function submitScore(score: number): Promise<IpcResponse<void>> {
  try {
    const response = await authClient.post(`${getBaseUrl()}/submissions/score`, { score });
    return { success: true, data: response.data };
  } catch (error) {
    return makeErrorResponse('submitScore', error);
  }
}

// ─── Log APIs ───────────────────────────────────────────────────────

export async function logAction(payload: LogActionPayload): Promise<IpcResponse<void>> {
  try {
    const response = await authClient.post(`${getBaseUrl()}/log`, payload);
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
    const baseUrl = host ? host.replace(/\/+$/, '') + '/api' : ramStore.backendUrl.replace(/\/+$/, '') + '/api';
    // Use the public status endpoint for health check
    await publicClient.get(`${baseUrl}/user/exam/status`, { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

// ─── Error Helper ───────────────────────────────────────────────────

function makeErrorResponse(context: string, error: unknown): IpcResponse<any> {
  const message = error instanceof Error ? error.message : String(error);
  logger.silly(`[API] ${context}: ${message}`);
  return {
    success: false,
    error: {
      code: 'NETWORK_ERROR',
      message: `${context}: ${message}`
    }
  };
}
