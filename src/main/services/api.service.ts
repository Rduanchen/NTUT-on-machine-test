import axios, { AxiosInstance } from 'axios';
import { ramStore } from './ramStore.service';
import { cryptoService } from './crypto.service';
import { logger } from './logger.service';
import os from 'os';
import type {
  ExamConfig,
  LogActionPayload,
  IpcResponse,
  JudgeRunResult,
  UploadResultPayload,
  ServerMessage
} from '../../common/types';
import FormData from 'form-data';

const API_TIMEOUT = 5000;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * API Service - All backend API calls abstracted as functions
 *
 * Two axios instances:
 * 1. publicClient — no auth required
 * 2. authenticatedClient — auto-attaches x-user-token header
 *
 * Every API endpoint is a standalone function for easy calling.
 */

// ─── Axios Instances ────────────────────────────────────────────────

function getMacAddresses() {
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
  return axios.create({
    timeout: API_TIMEOUT,
    headers: { 'Content-Type': 'application/json' }
  });
}

function createAuthenticatedClient(): AxiosInstance {
  const client = axios.create({
    timeout: API_TIMEOUT,
    headers: { 'Content-Type': 'application/json' }
  });

  // Interceptor: auto-attach fresh token on every request
  client.interceptors.request.use((config) => {
    try {
      const token = cryptoService.createToken();
      config.headers['x-user-token'] = token;
    } catch (err) {
      logger.warn('[API] Failed to create token for authenticated request:', err);
    }
    return config;
  });

  return client;
}

const publicClient = createPublicClient();
const authClient = createAuthenticatedClient();

/** Get the base URL for API calls */
function getBaseUrl(): string {
  const url = ramStore.backendUrl;
  if (!url) throw new Error('Backend URL not configured');
  return url.replace(/\/+$/, '') + '/api';
}

// ─── Auth APIs ──────────────────────────────────────────────────────

/** POST /auth/check-id - Check if student ID exists */
export async function checkStudentId(
  studentID: string
): Promise<IpcResponse<{ isValid: boolean; name?: string }>> {
  try {
    const response = await publicClient.post(`${getBaseUrl()}/auth/check-id`, { studentID });
    return { success: true, data: response.data };
  } catch (error) {
    return makeErrorResponse('checkStudentId', error);
  }
}

/** GET /auth/public-key - Get RSA public key */
export async function getPublicKey(): Promise<IpcResponse<{ publicKey: string }>> {
  try {
    const response = await publicClient.get(`${getBaseUrl()}/auth/public-key`);
    return { success: true, data: response.data.data };
  } catch (error) {
    return makeErrorResponse('getPublicKey', error);
  }
}

/** POST /auth/register - Register user crypto info */
export async function registerUser(encryptedPayload: string): Promise<IpcResponse<void>> {
  try {
    const response = await publicClient.post(`${getBaseUrl()}/auth/register`, { encryptedPayload });
    return { success: true, data: response.data };
  } catch (error) {
    return makeErrorResponse('registerUser', error);
  }
}

/** POST /auth/verify-token - Verify token (needs auth) */
export async function verifyToken(): Promise<IpcResponse<void>> {
  try {
    const response = await authClient.post(`${getBaseUrl()}/auth/verify-token`);
    return { success: true, data: response.data };
  } catch (error) {
    return makeErrorResponse('verifyToken', error);
  }
}

// ─── Exam APIs ──────────────────────────────────────────────────────

/** GET /exam/config - Get public exam config (before exam starts) */
export async function fetchExamConfig(host?: string): Promise<IpcResponse<ExamConfig>> {
  try {
    const baseUrl = host ? host.replace(/\/+$/, '') + '/api' : getBaseUrl();
    const response = await publicClient.get(`${baseUrl}/exam/config`);
    return { success: true, data: response.data.data };
  } catch (error) {
    return makeErrorResponse('fetchExamConfig', error);
  }
}

/** POST /exam/config-secure - Get secure exam config (needs auth) */
export async function fetchSecureExamConfig(): Promise<IpcResponse<ExamConfig>> {
  try {
    const response = await authClient.post(`${getBaseUrl()}/exam/config-secure`, {
      studentID: ramStore.studentInfo.id || 'unknown'
    });
    const encryptedConfig = response.data?.encryptedConfig ?? response.data?.data?.encryptedConfig;
    if (!encryptedConfig) {
      throw new Error('Missing encryptedConfig payload');
    }

    const cryptoState = ramStore.cryptoState;
    if (!cryptoState) {
      throw new Error('Crypto credentials not initialized');
    }

    const decrypted = cryptoService.decryptAes(encryptedConfig, cryptoState.aesKeyHex);
    const parsed = JSON.parse(decrypted) as ExamConfig;
    return { success: true, data: parsed };
  } catch (error) {
    return makeErrorResponse('fetchSecureExamConfig', error);
  }
}

/** POST /exam/result - Upload test results (needs auth) */
export async function uploadTestResult(
  result: Record<string, JudgeRunResult>
): Promise<IpcResponse<void>> {
  try {
    const payload = buildUploadTestResultPayload(result);
    const response = await authClient.post(`${getBaseUrl()}/exam/result`, payload);
    return { success: true, data: response.data };
  } catch (error) {
    return makeErrorResponse('uploadTestResult', error);
  }
}

/** POST /exam/upload - Upload program file as zip (needs auth, multipart) */
export async function uploadProgramFile(
  zipBuffer: Buffer,
  studentID: string
): Promise<IpcResponse<void>> {
  try {
    const form = new FormData();
    form.append('studentID', studentID);
    form.append('file', zipBuffer, {
      filename: `${studentID}.zip`,
      contentType: 'application/zip'
    });

    const response = await authClient.post(`${getBaseUrl()}/exam/upload`, form, {
      headers: form.getHeaders(),
      maxContentLength: MAX_FILE_SIZE,
      maxBodyLength: MAX_FILE_SIZE
    });
    return { success: true, data: response.data };
  } catch (error) {
    return makeErrorResponse('uploadProgramFile', error);
  }
}

function buildUploadTestResultPayload(result: Record<string, JudgeRunResult>): UploadResultPayload {
  const examConfig = ramStore.examConfig;
  if (!examConfig) throw new Error('Exam config not loaded');

  const formatted: UploadResultPayload['testResult'] = {};

  for (const [puzzleId, runResult] of Object.entries(result)) {
    const puzzleIndex = Number(puzzleId);
    if (Number.isNaN(puzzleIndex)) {
      logger.warn(`[API] uploadTestResult: Skipping invalid puzzle id ${puzzleId}`);
      continue;
    }

    const puzzleDef = examConfig.puzzles[puzzleIndex];
    if (!puzzleDef) {
      logger.warn(`[API] uploadTestResult: Missing puzzle definition for id ${puzzleId}`);
      continue;
    }

    formatted[puzzleId] = runResult.subtasks.map((subtaskResults, subtaskIdx) => {
      const subtaskDef = puzzleDef.subtasks[subtaskIdx];
      const visibleCount = subtaskDef?.visible?.length ?? 0;
      const safeVisibleCount = Math.max(0, Math.min(visibleCount, subtaskResults.length));

      return {
        visible: subtaskResults.slice(0, safeVisibleCount),
        hidden: subtaskResults.slice(safeVisibleCount)
      };
    });
  }

  return {
    studentID: ramStore.studentInfo.id || 'unknown',
    testResult: formatted
  };
}

// ─── Log APIs ───────────────────────────────────────────────────────

/** POST /log/action - Log user action to server */
export async function logAction(payload: LogActionPayload): Promise<IpcResponse<void>> {
  try {
    // Fill in studentID from store
    const studentInfo = ramStore.studentInfo;
    payload.studentID = studentInfo.id || 'unknown';
    payload.macAddress = getMacAddresses();

    const response = await publicClient.post(`${getBaseUrl()}/log/action`, payload);
    return { success: true, data: response.data };
  } catch (error) {
    return makeErrorResponse('logAction', error);
  }
}

// ─── Message APIs ───────────────────────────────────────────────────

/** GET /message/all - Get messages after a specific ID */
export async function getMessages(afterId?: string): Promise<IpcResponse<ServerMessage[]>> {
  try {
    const params: Record<string, string> = {};
    if (afterId) params.afterId = afterId;
    const response = await publicClient.get(`${getBaseUrl()}/message/all`, { params });
    const payload = response.data?.data ?? response.data;
    const normalized = Array.isArray(payload) ? payload : [];
    return { success: true, data: normalized as ServerMessage[] };
  } catch (error) {
    return makeErrorResponse('getMessages', error);
  }
}

/** GET /message/config-version - Get config version */
export async function getConfigVersion(): Promise<IpcResponse<number>> {
  try {
    const response = await publicClient.get(`${getBaseUrl()}/message/config-version`);
    const version = response.data?.data?.version ?? response.data?.version;
    if (typeof version !== 'number') {
      throw new Error('Invalid config version payload');
    }
    return { success: true, data: version };
  } catch (error) {
    return makeErrorResponse('getConfigVersion', error);
  }
}

/** GET /message/message-version - Get message version */
export async function getMessageVersion(): Promise<IpcResponse<number>> {
  try {
    const response = await publicClient.get(`${getBaseUrl()}/message/message-version`);
    const version = response.data?.data?.version ?? response.data?.version;
    if (typeof version !== 'number') {
      throw new Error('Invalid message version payload');
    }
    return { success: true, data: version };
  } catch (error) {
    return makeErrorResponse('getMessageVersion', error);
  }
}

// ─── Health Check ───────────────────────────────────────────────────

/** Health check - used by connection service */
export async function healthCheck(host?: string): Promise<boolean> {
  try {
    const baseUrl = host ? host.replace(/\/+$/, '') + '/api' : getBaseUrl();
    await publicClient.get(`${baseUrl}/exam/config`, { timeout: 3000 });
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
