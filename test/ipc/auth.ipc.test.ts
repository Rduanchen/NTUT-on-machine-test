import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ipcMain, app } from 'electron';
import { registerAuthIpc } from '../../src/main/ipc/auth.ipc';
import { ramStore } from '../../src/main/services/ramStore.service';
import { cryptoService } from '../../src/main/services/crypto.service';
import {
  getStudentIdByIp, getPublicKey, registerDevice, login,
  getDeviceUuid, getSubmissions
} from '../../src/main/services/api.service';
import { logServerEvent } from '../../src/main/services/logger.service';
import { messageSyncService } from '../../src/main/services/message-sync.service';
import { configService } from '../../src/main/services/config.service';
import { judgeManager } from '../../src/main/services/judge-manager.service';
import fs from 'fs';

vi.mock('../../src/main/services/ramStore.service', () => ({
  ramStore: {
    cryptoState: null,
    isOfflineMode: false,
    examConfig: null,
    studentInfo: null,
    isStudentVerified: false,
    pendingLoginSync: false,
  }
}));

vi.mock('../../src/main/services/crypto.service', () => ({
  cryptoService: {
    buildRegistrationPayload: vi.fn(),
  }
}));

vi.mock('../../src/main/services/api.service', () => ({
  getStudentIdByIp: vi.fn(),
  getPublicKey: vi.fn(),
  registerDevice: vi.fn(),
  login: vi.fn(),
  getDeviceUuid: vi.fn(),
  getSubmissions: vi.fn(),
}));

vi.mock('../../src/main/services/logger.service', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
  logServerEvent: vi.fn(),
}));

vi.mock('../../src/main/services/message-sync.service', () => ({
  messageSyncService: {
    registerSocket: vi.fn(),
    manualRefresh: vi.fn(),
  }
}));

vi.mock('../../src/main/services/config.service', () => ({
  configService: {
    fetchAndSaveConfig: vi.fn(),
  }
}));

vi.mock('../../src/main/services/judge-manager.service', () => ({
  judgeManager: {
    runJudge: vi.fn(),
  }
}));

vi.mock('fs', () => ({
  /* localProgram.service builds its singleton at import time and calls
   * mkdtempSync there, so a partial fs mock fails the whole file at collection
   * rather than in a test — which is why this read as an unrelated suite
   * error. */
  default: {
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    mkdtempSync: vi.fn(() => '/tmp/ntut-exam-test'),
    existsSync: vi.fn(() => false),
    rmSync: vi.fn(),
    readdirSync: vi.fn(() => []),
    copyFileSync: vi.fn(),
  }
}));

describe('auth.ipc', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(ramStore, {
      cryptoState: null,
      isOfflineMode: false,
      examConfig: null,
      studentInfo: null,
      isStudentVerified: false,
      pendingLoginSync: false,
    });
    registerAuthIpc();
  });

  const invoke = (channel: string, ...args: any[]) => {
    return (ipcMain as any)._invokeHandler(channel, {}, ...args);
  };

  describe('auth:register', () => {
    it('success', async () => {
      vi.mocked(getPublicKey).mockResolvedValueOnce({ success: true, data: { publicKey: 'pub' } } as any);
      vi.mocked(getDeviceUuid).mockResolvedValueOnce('uuid');
      vi.mocked(cryptoService.buildRegistrationPayload).mockReturnValueOnce({ encrypted_aes_key: 'enc' } as any);
      vi.mocked(registerDevice).mockResolvedValueOnce({ success: true } as any);

      const result = await invoke('auth:register');
      expect(messageSyncService.registerSocket).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('fails if getPublicKey fails', async () => {
      vi.mocked(getPublicKey).mockResolvedValueOnce({ success: false } as any);
      const result = await invoke('auth:register');
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('REGISTRATION_FAILED');
    });

    it('fails if registerDevice fails', async () => {
      vi.mocked(getPublicKey).mockResolvedValueOnce({ success: true, data: { publicKey: 'pub' } } as any);
      vi.mocked(getDeviceUuid).mockResolvedValueOnce('uuid');
      vi.mocked(cryptoService.buildRegistrationPayload).mockReturnValueOnce({ encrypted_aes_key: 'enc' } as any);
      vi.mocked(registerDevice).mockResolvedValueOnce({ success: false } as any);

      const result = await invoke('auth:register');
      expect(result.success).toBe(false);
    });

    it('handles unexpected errors', async () => {
      vi.mocked(getPublicKey).mockRejectedValueOnce(new Error('Network error'));
      const result = await invoke('auth:register');
      expect(result.success).toBe(false);
    });
  });

  describe('auth:login offline mode bypass', () => {
    beforeEach(() => {
      ramStore.isOfflineMode = true;
    });

    it('fails without manualTestId', async () => {
      const result = await invoke('auth:login');
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('STUDENT_NOT_FOUND');
    });

    it('fails if testId not in accessibleUsers (when list exists)', async () => {
      ramStore.examConfig = { accessibleUsers: [{ id: 'other' }] } as any;
      const result = await invoke('auth:login', 'test1');
      expect(result.success).toBe(false);
    });

    it('succeeds if testId in accessibleUsers', async () => {
      ramStore.examConfig = { accessibleUsers: [{ id: 'test1', name: 'Test User' }] } as any;
      const result = await invoke('auth:login', 'test1');
      expect(result.success).toBe(true);
      expect(ramStore.studentInfo).toEqual({ id: 'test1', name: 'Test User' });
      expect(ramStore.isStudentVerified).toBe(true);
    });

    it('succeeds with testId as name if no name provided', async () => {
      ramStore.examConfig = null; // No accessibleUsers restriction
      const result = await invoke('auth:login', 'test1');
      expect(result.success).toBe(true);
      expect(ramStore.studentInfo).toEqual({ id: 'test1', name: 'test1' });
    });
  });

  describe('auth:login normal mode', () => {
    beforeEach(() => {
      // Mock successful registration flow for inline registration
      vi.mocked(getPublicKey).mockResolvedValue({ success: true, data: { publicKey: 'pub' } } as any);
      vi.mocked(getDeviceUuid).mockResolvedValue('uuid');
      vi.mocked(cryptoService.buildRegistrationPayload).mockReturnValue({ encrypted_aes_key: 'enc' } as any);
      vi.mocked(registerDevice).mockResolvedValue({ success: true } as any);
    });

    it('refuses to log in a machine that has not registered', async () => {
      /* Registration used to happen inline here, which tied it to a phase
       * where login is open — including during the exam, with students in the
       * room. It is its own step now, so this reports the real situation
       * instead of quietly registering. */
      const result = await invoke('auth:login', 'test1');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('REGISTRATION_FAILED');
    });

    it('never registers as a side effect of logging in', async () => {
      await invoke('auth:login', 'test1');

      expect(vi.mocked(registerDevice)).not.toHaveBeenCalled();
      expect(ramStore.cryptoState).toBeNull();
    });

    it('registers on its own when asked directly', async () => {
      const result = await invoke('auth:register');

      expect(result.success).toBe(true);
      expect(vi.mocked(registerDevice)).toHaveBeenCalledOnce();
    });

    it('fails if getStudentIdByIp fails and no manual ID', async () => {
      ramStore.cryptoState = {} as any; // Skip registration
      vi.mocked(getStudentIdByIp).mockResolvedValueOnce({ success: false } as any);
      const result = await invoke('auth:login');
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('STUDENT_NOT_FOUND');
    });

    it('successful login flow with IP', async () => {
      ramStore.cryptoState = {} as any; // Skip registration
      vi.mocked(getStudentIdByIp).mockResolvedValueOnce({ success: true, data: { testId: 'ip-test' } } as any);
      vi.mocked(login).mockResolvedValueOnce({ success: true, data: { session_token: 'tok' } } as any);
      vi.mocked(getSubmissions).mockResolvedValueOnce({ success: true, data: [
        { questionId: 'q1', language: 'C', codeContent: 'code1' },
        { questionId: 'q2', language: 'Cpp', codeContent: 'code2' }
      ] } as any);

      ramStore.examConfig = { accessibleUsers: [{ id: 'ip-test', name: 'IP User' }] } as any;

      const result = await invoke('auth:login');
      
      expect(login).toHaveBeenCalledWith({ testId: 'ip-test' });
      expect(ramStore.studentInfo).toEqual({ id: 'ip-test', name: 'IP User' });
      expect((ramStore.cryptoState as any).userSessionID).toBe('tok');
      expect(configService.fetchAndSaveConfig).toHaveBeenCalled();
      expect(messageSyncService.manualRefresh).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
      expect(judgeManager.runJudge).toHaveBeenCalledTimes(2);
      expect(fs.unlinkSync).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
    });

    it('handles getSubmissions failure gracefully', async () => {
      ramStore.cryptoState = {} as any;
      vi.mocked(login).mockResolvedValueOnce({ success: true, data: { session_token: 'tok' } } as any);
      vi.mocked(getSubmissions).mockRejectedValueOnce(new Error('Sub error'));

      const result = await invoke('auth:login', 'test1');
      expect(result.success).toBe(true); // login still succeeds
    });

    it('offline fallback when NETWORK_ERROR occurs', async () => {
      ramStore.cryptoState = {} as any; // Need existing crypto state
      vi.mocked(login).mockResolvedValueOnce({ success: false, error: { code: 'NETWORK_ERROR' } } as any);
      ramStore.examConfig = { accessibleUsers: [{ id: 'test1', name: 'Offline User' }] } as any;

      const result = await invoke('auth:login', 'test1');
      expect(result.success).toBe(true);
      expect(ramStore.studentInfo).toEqual({ id: 'test1', name: 'Offline User' });
      expect(ramStore.pendingLoginSync).toBe(true);
    });

    it('offline fallback fails if not in accessibleUsers', async () => {
      ramStore.cryptoState = {} as any;
      vi.mocked(login).mockResolvedValueOnce({ success: false, error: { code: 'NETWORK_ERROR' } } as any);
      ramStore.examConfig = { accessibleUsers: [{ id: 'other' }] } as any;

      const result = await invoke('auth:login', 'test1');
      expect(result.success).toBe(false);
    });

    it('login failed with normal error resets crypto state', async () => {
      ramStore.cryptoState = {} as any;
      vi.mocked(login).mockResolvedValueOnce({ success: false, error: { code: 'INVALID_CREDENTIALS' } } as any);
      const result = await invoke('auth:login', 'test1');
      expect(result.success).toBe(false);
      expect(ramStore.cryptoState).toBeNull();
    });

    it('login failed with BINDING_LOCKED preserves crypto state', async () => {
      ramStore.cryptoState = {} as any;
      vi.mocked(login).mockResolvedValueOnce({ success: false, error: { code: 'BINDING_LOCKED' } } as any);
      const result = await invoke('auth:login', 'test1');
      expect(result.success).toBe(false);
      expect(ramStore.cryptoState).not.toBeNull();
    });
    
    it('login failed with ALREADY_LOGGED_IN preserves crypto state', async () => {
      ramStore.cryptoState = {} as any;
      vi.mocked(login).mockResolvedValueOnce({ success: false, error: { code: 'ALREADY_LOGGED_IN' } } as any);
      const result = await invoke('auth:login', 'test1');
      expect(result.success).toBe(false);
      expect(ramStore.cryptoState).not.toBeNull();
    });

    it('handles unexpected errors', async () => {
      ramStore.cryptoState = {} as any;
      vi.mocked(login).mockRejectedValueOnce(new Error('Unknown'));
      const result = await invoke('auth:login', 'test1');
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('REGISTRATION_FAILED');
      expect(ramStore.cryptoState).toBeNull();
    });
  });

  it('auth:is-verified', async () => {
    ramStore.isStudentVerified = true;
    expect(await invoke('auth:is-verified')).toBe(true);
  });

  it('auth:get-student-info', async () => {
    ramStore.studentInfo = { id: 'test', name: 'Name' };
    expect(await invoke('auth:get-student-info')).toEqual({ id: 'test', name: 'Name' });
  });
});
