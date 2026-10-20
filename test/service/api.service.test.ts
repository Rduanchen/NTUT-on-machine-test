import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import * as si from 'systeminformation';
import * as os from 'os';

// Mock dependencies before importing the service
const mockAxiosInstance = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  interceptors: {
    request: { use: vi.fn() }
  }
}));

vi.mock('axios', () => {
  return {
    default: {
      create: vi.fn(() => mockAxiosInstance),
      isAxiosError: vi.fn()
    }
  };
});

vi.mock('systeminformation');
vi.mock('os');

const mockSend = vi.fn();
vi.mock('../../src/main/system/windowManager', () => ({
  getMainWindow: vi.fn(() => ({
    isDestroyed: vi.fn(() => false),
    webContents: {
      send: mockSend
    }
  }))
}));

vi.mock('../../src/main/services/logger.service', () => ({
  logger: {
    warn: vi.fn(),
    silly: vi.fn(),
    info: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('../../src/main/services/crypto.service', () => ({
  cryptoService: {
    generateRandomString: vi.fn(() => 'random-nonce'),
    encryptAesPayload: vi.fn((data, key, uuid) => `encrypted_${uuid}_${key}_${data}`),
    decryptAesPayload: vi.fn((data) => data.replace('encrypted_', ''))
  }
}));

// Provide a way to override ramStore properties
let mockRamStore = {
  backendUrl: 'http://test-backend',
  cryptoState: { userSessionID: 'session123', aesKeyHex: 'aesKey123' } as any
};

vi.mock('../../src/main/services/ramStore.service', () => ({
  ramStore: new Proxy({}, {
    get: (_, prop) => mockRamStore[prop as keyof typeof mockRamStore],
    set: (_, prop, value) => {
      (mockRamStore as any)[prop] = value;
      return true;
    }
  })
}));

// Now import the module to test
import * as apiService from '../../src/main/services/api.service';

describe('API Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRamStore.backendUrl = 'http://test-backend';
    mockRamStore.cryptoState = { userSessionID: 'session123', aesKeyHex: 'aesKey123' };
    
    // reset cached uuid by resetting the module or manually tricking it
    // actually, we can't easily reset cachedDeviceUuid because it's a module level let.
    // We'll test getDeviceUuid branches sequentially, but since it caches, we need a workaround
    // We can use vi.resetModules() to re-import it, but vitest supports it nicely inside test blocks.
  });

  describe('pre-login language API', () => {
    it('decrypts and validates languages without a login token', async () => {
      mockRamStore.cryptoState.userSessionID = '';
      mockAxiosInstance.post.mockResolvedValue({ data: 'encrypted_{"languages":["C","Java"]}' });
      expect(await apiService.getExamLanguages()).toEqual({ success: true, data: { languages: ['C', 'Java'] } });
    });
    it('rejects malformed data and missing registration', async () => {
      mockAxiosInstance.post.mockResolvedValue({ data: 'encrypted_{"languages":["Rust"]}' });
      expect((await apiService.getExamLanguages()).success).toBe(false);
      mockRamStore.cryptoState = null;
      expect((await apiService.getExamLanguages()).success).toBe(false);
    });
    it('discards a reply if registration changed in flight', async () => {
      mockAxiosInstance.post.mockImplementationOnce(async () => {
        mockRamStore.cryptoState.aesKeyHex = 'replacement';
        return { data: 'encrypted_{"languages":[]}' };
      });
      expect((await apiService.getExamLanguages()).success).toBe(false);
    });
    it('requires an application acknowledgement for reports', async () => {
      mockAxiosInstance.post.mockResolvedValue({ data: { success: false } });
      expect((await apiService.reportEnvironmentCheck('PASSED', [], 2)).success).toBe(false);
      mockAxiosInstance.post.mockResolvedValue({ data: { success: true } });
      expect((await apiService.reportEnvironmentCheck('PASSED', [], 2)).success).toBe(true);
    });
  });

  describe('getDeviceUuid', () => {
    beforeEach(async () => {
      vi.resetModules(); // This is needed to clear `cachedDeviceUuid`
    });

    it('returns baseboard serial if valid', async () => {
      vi.mocked(si.baseboard).mockResolvedValueOnce({ serial: 'valid-serial' } as any);
      const { getDeviceUuid } = await import('../../src/main/services/api.service');
      
      const uuid = await getDeviceUuid();
      expect(uuid).toBe('valid-serial');
      expect(si.baseboard).toHaveBeenCalled();
    });
    
    it('returns cached device uuid on subsequent calls', async () => {
      vi.mocked(si.baseboard).mockResolvedValueOnce({ serial: 'first-serial' } as any);
      const { getDeviceUuid } = await import('../../src/main/services/api.service');
      
      const uuid1 = await getDeviceUuid();
      const uuid2 = await getDeviceUuid();
      expect(uuid1).toBe('first-serial');
      expect(uuid2).toBe('first-serial');
      expect(si.baseboard).toHaveBeenCalledTimes(1); // Only called once
    });

    it('returns system uuid if baseboard is invalid', async () => {
      vi.mocked(si.baseboard).mockResolvedValueOnce({ serial: 'unknown' } as any);
      vi.mocked(si.system).mockResolvedValueOnce({ uuid: 'valid-system-uuid' } as any);
      
      const { getDeviceUuid } = await import('../../src/main/services/api.service');
      const uuid = await getDeviceUuid();
      expect(uuid).toBe('valid-system-uuid');
    });

    it('falls back to mac address if hardware info fails', async () => {
      vi.mocked(si.baseboard).mockRejectedValueOnce(new Error('Hardware Error'));
      vi.mocked(os.networkInterfaces).mockReturnValueOnce({
        eth0: [{ internal: false, mac: 'aa:bb:cc:dd:ee:ff' } as any]
      });
      
      const { getDeviceUuid } = await import('../../src/main/services/api.service');
      const uuid = await getDeviceUuid();
      expect(uuid).toBe('aa:bb:cc:dd:ee:ff');
    });

    it('skips invalid mac addresses and falls back to timestamp', async () => {
      vi.mocked(si.baseboard).mockRejectedValueOnce(new Error('Hardware Error'));
      vi.mocked(os.networkInterfaces).mockReturnValueOnce({
        lo: [{ internal: true, mac: '00:00:00:00:00:00' } as any],
        eth1: undefined
      });
      
      const { getDeviceUuid } = await import('../../src/main/services/api.service');
      const uuid = await getDeviceUuid();
      expect(uuid).toContain('fallback-uuid-');
    });
  });

  describe('createAuthenticatedClient interceptor', () => {
    let requestInterceptor: any;

    beforeEach(async () => {
      vi.resetModules();
      mockAxiosInstance.interceptors.request.use.mockImplementation((cb) => {
        requestInterceptor = cb;
        return 0;
      });
      // Import simply triggers createAuthenticatedClient
      await import('../../src/main/services/api.service');
    });

    it('throws if cryptoState is not initialized', async () => {
      mockRamStore.cryptoState = null;
      await expect(requestInterceptor({})).rejects.toThrow('Crypto state not initialized');
    });

    it('encrypts data and appends session details (string body)', async () => {
      mockRamStore.cryptoState = { userSessionID: 'sess', aesKeyHex: 'key' };
      vi.mocked(si.baseboard).mockResolvedValueOnce({ serial: 'device123' } as any); // for uuid
      const config = { data: '{"test":"value"}' };
      const res = await requestInterceptor(config);
      
      expect(res.data).toContain('encrypted_device123_key_');
      expect(res.data).toContain('"test":"value"');
      expect(res.data).toContain('"session_token":"sess"');
    });
    
    it('handles invalid json string body gracefully', async () => {
      mockRamStore.cryptoState = { userSessionID: 'sess', aesKeyHex: 'key' };
      vi.mocked(si.baseboard).mockResolvedValueOnce({ serial: 'device123' } as any);
      const config = { data: 'invalid-json' };
      const res = await requestInterceptor(config);
      
      expect(res.data).toContain('encrypted_device123_key_');
    });
    
    it('handles falsy originalData', async () => {
      mockRamStore.cryptoState = { userSessionID: 'sess', aesKeyHex: 'key' };
      vi.mocked(si.baseboard).mockResolvedValueOnce({ serial: 'device123' } as any);
      const config = { data: undefined };
      const res = await requestInterceptor(config);
      
      expect(res.data).toContain('encrypted_device123_key_');
    });

    it('encrypts data and appends session details (object body)', async () => {
      mockRamStore.cryptoState = { userSessionID: 'sess', aesKeyHex: 'key' };
      vi.mocked(si.baseboard).mockResolvedValueOnce({ serial: 'device123' } as any);
      const config = { data: { test: 'value' } };
      const res = await requestInterceptor(config);
      
      expect(res.data).toContain('encrypted_device123_key_');
      expect(res.data).toContain('"test":"value"');
    });

    it('handles cryptoService error gracefully and rejects', async () => {
      mockRamStore.cryptoState = { userSessionID: 'sess', aesKeyHex: 'key' };
      vi.mocked(si.baseboard).mockResolvedValueOnce({ serial: 'device123' } as any);
      
      const { cryptoService } = await import('../../src/main/services/crypto.service');
      vi.mocked(cryptoService.encryptAesPayload).mockImplementationOnce(() => {
        throw new Error('Encryption fail');
      });
      
      await expect(requestInterceptor({ data: {} })).rejects.toThrow('Encryption fail');
    });
    
    it('handles non-Error objects in crypto catch block', async () => {
      mockRamStore.cryptoState = { userSessionID: 'sess', aesKeyHex: 'key' };
      vi.mocked(si.baseboard).mockResolvedValueOnce({ serial: 'device123' } as any);
      
      const { cryptoService } = await import('../../src/main/services/crypto.service');
      vi.mocked(cryptoService.encryptAesPayload).mockImplementationOnce(() => {
        throw 'String error';
      });
      
      await expect(requestInterceptor({ data: {} })).rejects.toBe('String error');
    });
  });

  describe('API endpoints & Error Handling', () => {
    let api: typeof apiService;

    beforeEach(async () => {
      vi.resetModules();
      api = await import('../../src/main/services/api.service');
      vi.mocked(axios.isAxiosError).mockImplementation((e: any) => e?.isAxios === true);
    });

    it('getBaseUrl throws if missing backendUrl', async () => {
      mockRamStore.backendUrl = '';
      const res = await api.getStudentIdByIp();
      expect(res.success).toBe(false);
      expect(res.error?.message).toBe('Backend URL not configured');
    });

    it('getStudentIdByIp handles success', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: { testId: '123' } });
      const res = await api.getStudentIdByIp();
      expect(res).toEqual({ success: true, data: { testId: '123' } });
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('http://test-backend/user/auth/student-id');
    });

    it('getPublicKey handles success', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: { publicKey: 'pub' } });
      const res = await api.getPublicKey();
      expect(res).toEqual({ success: true, data: { publicKey: 'pub' } });
    });

    it('registerDevice handles success', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({ data: 'ok' });
      const res = await api.registerDevice('uuid', 'key');
      expect(res).toEqual({ success: true, data: 'ok' });
    });

    it('login handles success', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({ data: { session_token: 'tok' } });
      const res = await api.login({ testId: '123' });
      expect(res).toEqual({ success: true, data: { session_token: 'tok' } });
    });

    it('getExamStatus handles success', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: { status: 'RUNNING' } });
      const res = await api.getExamStatus();
      expect(res).toEqual({ success: true, data: { status: 'RUNNING' } });
    });

    it('handles failures for all endpoints to hit 100% coverage', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('fail'));
      mockAxiosInstance.post.mockRejectedValue(new Error('fail'));
      
      expect((await api.getStudentIdByIp()).success).toBe(false);
      expect((await api.getPublicKey()).success).toBe(false);
      expect((await api.registerDevice('u', 'k')).success).toBe(false);
      expect((await api.login({ testId: '123' })).success).toBe(false);
      expect((await api.getExamStatus()).success).toBe(false);
      expect((await api.submitCode('c', 'q', 'c')).success).toBe(false);
      expect((await api.getSubmissions()).success).toBe(false);
      expect((await api.submitScore({ score: 100 })).success).toBe(false);
      expect((await api.logAction({ action: 'TEST' } as any)).success).toBe(false);
    });

    it('submitCode handles success', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({ data: 'ok' });
      const res = await api.submitCode('code', 'q1', 'c');
      expect(res).toEqual({ success: true, data: 'ok' });
    });

    it('getSubmissions handles success', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: ['sub1'] });
      const res = await api.getSubmissions();
      expect(res).toEqual({ success: true, data: ['sub1'] });
    });

    it('submitScore handles success', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({ data: 'ok' });
      const res = await api.submitScore({ score: 100 });
      expect(res).toEqual({ success: true, data: 'ok' });
    });

    it('logAction fails if no userSessionID', async () => {
      mockRamStore.cryptoState = null;
      const res = await api.logAction({ action: 'TEST' } as any);
      expect(res.success).toBe(false);
      expect(res.error?.code).toBe('NOT_LOGGED_IN');
    });

    it('logAction handles success', async () => {
      mockRamStore.cryptoState = { userSessionID: 'tok' };
      mockAxiosInstance.post.mockResolvedValueOnce({ data: 'ok' });
      const res = await api.logAction({ action: 'TEST' } as any);
      expect(res).toEqual({ success: true, data: 'ok' });
    });

    it('healthCheck success (host provided)', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({});
      const res = await api.healthCheck('http://other/');
      expect(res).toBe(true);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('http://other/user/exam/status', { timeout: 3000 });
    });

    it('healthCheck fail', async () => {
      mockAxiosInstance.get.mockRejectedValueOnce(new Error('fail'));
      const res = await api.healthCheck();
      expect(res).toBe(false);
    });

    describe('fetchSecureExamConfig', () => {
      it('fails if missing payload', async () => {
        mockAxiosInstance.post.mockResolvedValueOnce({ data: null });
        const res = await api.fetchSecureExamConfig();
        expect(res.success).toBe(false);
        expect(res.error?.message).toBe('Missing encryptedConfig payload');
      });

      it('fails if missing cryptoState', async () => {
        mockAxiosInstance.post.mockResolvedValueOnce({ data: 'enc' });
        mockRamStore.cryptoState = null;
        const res = await api.fetchSecureExamConfig();
        expect(res.success).toBe(false);
        expect(res.error?.message).toBe('Crypto credentials not initialized');
      });

      it('success', async () => {
        mockAxiosInstance.post.mockResolvedValueOnce({ data: 'encrypted_json' });
        mockRamStore.cryptoState = { aesKeyHex: 'key' };
        
        // Mock decrypt to return valid JSON
        const { cryptoService } = await import('../../src/main/services/crypto.service');
        vi.mocked(cryptoService.decryptAesPayload).mockReturnValueOnce('{"configVal": 1}');
        
        const res = await api.fetchSecureExamConfig();
        expect(res).toEqual({ success: true, data: { configVal: 1 } });
      });
      
      it('fails if fetchSecureExamConfig rejects', async () => {
        mockAxiosInstance.post.mockRejectedValueOnce(new Error('fail'));
        const res = await api.fetchSecureExamConfig();
        expect(res.success).toBe(false);
      });
    });

    describe('getMessages', () => {
      it('fails if missing cryptoState', async () => {
        mockAxiosInstance.post.mockResolvedValueOnce({ data: 'enc' });
        mockRamStore.cryptoState = null;
        const res = await api.getMessages();
        expect(res.success).toBe(false);
        expect(res.error?.message).toBe('Crypto credentials not initialized');
      });

      it('success with Array', async () => {
        mockAxiosInstance.post.mockResolvedValueOnce({ data: 'encrypted_arr' });
        mockRamStore.cryptoState = { aesKeyHex: 'key' };
        
        const { cryptoService } = await import('../../src/main/services/crypto.service');
        vi.mocked(cryptoService.decryptAesPayload).mockReturnValueOnce('[{"id": 1}]');
        
        const res = await api.getMessages();
        expect(res).toEqual({ success: true, data: [{ id: 1 }] });
      });

      it('success with non-Array normalizes to []', async () => {
        mockAxiosInstance.post.mockResolvedValueOnce({ data: 'encrypted_obj' });
        mockRamStore.cryptoState = { aesKeyHex: 'key' };
        
        const { cryptoService } = await import('../../src/main/services/crypto.service');
        vi.mocked(cryptoService.decryptAesPayload).mockReturnValueOnce('{"id": 1}');
        
        const res = await api.getMessages();
        expect(res).toEqual({ success: true, data: [] });
      });
      
      it('fails if getMessages rejects', async () => {
        mockAxiosInstance.post.mockRejectedValueOnce(new Error('fail'));
        const res = await api.getMessages();
        expect(res.success).toBe(false);
      });
    });

    describe('makeErrorResponse', () => {
      it('handles AxiosError with response', async () => {
        mockAxiosInstance.get.mockRejectedValueOnce({
          isAxios: true,
          response: {
            status: 403,
            data: { code: 'MY_CODE', message: 'my message' }
          }
        });
        const res = await api.getExamStatus();
        expect(res.success).toBe(false);
        expect(res.error?.code).toBe('MY_CODE');
        expect(res.error?.message).toBe('my message');
      });

      it('handles AxiosError without data.code, falls back to HTTP_xx', async () => {
        mockAxiosInstance.get.mockRejectedValueOnce({
          isAxios: true,
          response: {
            status: 404,
            data: { error: 'Not found error' }
          }
        });
        const res = await api.getExamStatus();
        expect(res.error?.code).toBe('HTTP_404');
        expect(res.error?.message).toBe('Not found error');
      });
      
      it('handles AxiosError without response', async () => {
        mockAxiosInstance.get.mockRejectedValueOnce({
          isAxios: true,
          message: 'Network Error'
        });
        const res = await api.getExamStatus();
        expect(res.error?.code).toBe('NETWORK_ERROR');
        expect(res.error?.message).toBe('Network Error');
      });

      it('handles normal Error', async () => {
        mockAxiosInstance.get.mockRejectedValueOnce(new Error('Normal Error'));
        const res = await api.getExamStatus();
        expect(res.error?.code).toBe('NETWORK_ERROR');
        expect(res.error?.message).toBe('Normal Error');
      });

      it('handles Error with not registered message', async () => {
        mockAxiosInstance.get.mockRejectedValueOnce(new Error('Device not registered'));
        const res = await api.getExamStatus();
        expect(mockSend).toHaveBeenCalledWith('app:force-logout', 'Device not registered');
      });

      it('handles string error', async () => {
        mockAxiosInstance.get.mockRejectedValueOnce('String Error');
        const res = await api.getExamStatus();
        expect(res.error?.code).toBe('NETWORK_ERROR');
        expect(res.error?.message).toBe('String Error');
      });

      it('triggers force-logout on 401', async () => {
        mockAxiosInstance.get.mockRejectedValueOnce({
          isAxios: true,
          response: {
            status: 401,
            data: { code: 'HTTP_401', message: 'Unauthorized access' }
          }
        });
        await api.getExamStatus();
        expect(mockSend).toHaveBeenCalledWith('app:force-logout', 'Unauthorized access');
      });

      it('triggers force-logout on CRYPTO_VERIFICATION_FAILED', async () => {
        mockAxiosInstance.get.mockRejectedValueOnce({
          isAxios: true,
          response: {
            status: 400,
            data: { code: 'CRYPTO_VERIFICATION_FAILED' }
          }
        });
        await api.getExamStatus();
        expect(mockSend).toHaveBeenCalledWith('app:force-logout', '您的裝置已被登出或解除綁定。');
      });
      
      it('ignores destroyed window in force-logout', async () => {
        const { getMainWindow } = await import('../../src/main/system/windowManager');
        vi.mocked(getMainWindow).mockReturnValueOnce({
          isDestroyed: vi.fn(() => true)
        } as any);

        mockAxiosInstance.get.mockRejectedValueOnce({
          isAxios: true,
          response: { status: 401, data: { code: 'HTTP_401' } }
        });
        await api.getExamStatus();
        // Just checking it doesn't crash
      });
      
      it('ignores null window in force-logout', async () => {
        const { getMainWindow } = await import('../../src/main/system/windowManager');
        vi.mocked(getMainWindow).mockReturnValueOnce(null);

        mockAxiosInstance.get.mockRejectedValueOnce({
          isAxios: true,
          response: { status: 401, data: { code: 'HTTP_401' } }
        });
        await api.getExamStatus();
        // Just checking it doesn't crash
      });

      it('ignores error if getMainWindow throws', async () => {
        const { getMainWindow } = await import('../../src/main/system/windowManager');
        vi.mocked(getMainWindow).mockImplementationOnce(() => {
          throw new Error('Window missing');
        });

        mockAxiosInstance.get.mockRejectedValueOnce({
          isAxios: true,
          response: { status: 401, data: { code: 'HTTP_401' } }
        });
        await api.getExamStatus();
        // Just checking it doesn't crash
      });
    });
  });
});
