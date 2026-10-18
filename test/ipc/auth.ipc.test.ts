import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ipcMain, app } from 'electron';
import { registerAuthIpc } from '../../src/main/ipc/auth.ipc';
import { ramStore } from '../../src/main/services/ramStore.service';
import { cryptoService } from '../../src/main/services/crypto.service';
import {
  getStudentIdByIp, getPublicKey, registerDevice, login,
  getDeviceUuid, getSubmissions
} from '../../src/main/services/api.service';
import { logger, logServerEvent } from '../../src/main/services/logger.service';
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
    fetchAndSaveConfig: vi.fn().mockResolvedValue({ success: true }),
    ensureExamPaperReadable: vi.fn().mockResolvedValue({ success: true }),
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

    it('reports a closed gate as waiting, not as a failure', async () => {
      /* A restart loses the in-memory key and arrives as an unregistered
       * machine, which is the normal path once the room has filled. Reporting
       * it as REGISTRATION_FAILED sent the student to an error instead of the
       * queue. */
      vi.mocked(registerDevice).mockResolvedValueOnce({
        success: false,
        error: { code: 'entry_pending', message: 'A request has been sent to the TA.' }
      } as any);

      const result = await invoke('auth:register');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('ENTRY_PENDING');
    });

    it('does not claim to hold a key while waiting for approval', async () => {
      /* The page derivation reads "holds a key". A machine that kept one after
       * being refused would derive to the login screen and sit there. */
      vi.mocked(registerDevice).mockResolvedValueOnce({
        success: false,
        error: { code: 'entry_pending', message: 'pending' }
      } as any);

      await invoke('auth:register');

      expect(ramStore.cryptoState).toBeNull();
      expect(await invoke('auth:is-registered')).toBe(false);
    });

    it('recovers submitted work when a re-entered machine logs back in', async () => {
      /* The promise re-entry rests on. Clearing a machine's identity must not
       * cost the student anything they had submitted — their work is keyed by
       * test ID, not by the machine that typed it. */
      ramStore.cryptoState = {} as any;
      vi.mocked(getStudentIdByIp).mockResolvedValueOnce({
        success: true,
        data: { testId: 'test1' }
      } as any);
      vi.mocked(login).mockResolvedValueOnce({
        success: true,
        data: { session_token: 'tok' }
      } as any);
      vi.mocked(getSubmissions).mockResolvedValueOnce({
        success: true,
        data: [
          { questionId: 'Q1', language: 'Python', codeContent: 'print(1)' },
          { questionId: 'Q2', language: 'Cpp', codeContent: 'int main(){}' }
        ]
      } as any);

      const result = await invoke('auth:login');

      expect(result.success).toBe(true);
      expect(vi.mocked(judgeManager.runJudge)).toHaveBeenCalledTimes(2);
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
      expect(fs.rmSync).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
    });

    it('uses a private temporary path for recovered code regardless of question ID', async () => {
      ramStore.cryptoState = {} as any;
      vi.mocked(getStudentIdByIp).mockResolvedValueOnce({
        success: true, data: { testId: 'test1' }
      } as any);
      vi.mocked(login).mockResolvedValueOnce({
        success: true, data: { session_token: 'tok' }
      } as any);
      vi.mocked(getSubmissions).mockResolvedValueOnce({
        success: true,
        data: [{ questionId: '../../outside', language: 'Python', codeContent: 'print(1)' }]
      } as any);

      expect((await invoke('auth:login')).success).toBe(true);
      expect(fs.mkdtempSync).toHaveBeenCalledWith(expect.stringContaining('ntut-recovery-'));
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/tmp/ntut-exam-test/submission.py', 'print(1)', { flag: 'wx', mode: 0o600 }
      );
      expect(fs.rmSync).toHaveBeenCalledWith('/tmp/ntut-exam-test', { recursive: true, force: true });
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

    /* Feature 007 bugfix BUG-04. Registration and login are two independent
     * layers: being refused as a student says nothing about whether this
     * machine's key is known to the backend. Discarding the key here sent the
     * machine to the approval screen, which retries registration every five
     * seconds — and with registration closed, every retry filed another request
     * for a TA. One binding conflict became an unbounded queue. */
    it('preserves the registration when a login is refused for any reason', async () => {
      ramStore.cryptoState = {} as any;
      vi.mocked(login).mockResolvedValueOnce({ success: false, error: { code: 'INVALID_CREDENTIALS' } } as any);
      const result = await invoke('auth:login', 'test1');
      expect(result.success).toBe(false);
      expect(ramStore.cryptoState).not.toBeNull();
    });

    it('preserves the registration when the backend refuses with an unfamiliar code', async () => {
      /* The reason this cannot be a list of known codes: the backend used to
       * put the code in the message field, so every code arriving here was
       * unfamiliar and every refusal cleared the key. */
      ramStore.cryptoState = {} as any;
      vi.mocked(login).mockResolvedValueOnce({
        success: false,
        error: { code: 'This student ID is currently logged in on another active device.' }
      } as any);
      const result = await invoke('auth:login', 'test1');
      expect(result.success).toBe(false);
      expect(ramStore.cryptoState).not.toBeNull();
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

    it('handles unexpected errors without discarding the registration', async () => {
      /* Feature 007 bugfix BUG-04. An unreachable server is the least likely
       * moment to throw away a working registration: re-registering needs that
       * same server, and the machine that does so lands in the TA queue. */
      ramStore.cryptoState = {} as any;
      vi.mocked(login).mockRejectedValueOnce(new Error('Unknown'));
      const result = await invoke('auth:login', 'test1');
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NO_RESPONSE');
      expect(ramStore.cryptoState).not.toBeNull();
    });

    /* Feature 007 bugfix BUG-05. The exam key was fetched only when the phase
     * *changed* to IN_PROGRESS. A machine re-entering mid-exam had already read
     * that phase from the public status endpoint before logging in, so it never
     * saw a change — and sat on an exam page rendered from a null config. */
    it('opens the paper when the exam is already running at login time', async () => {
      ramStore.cryptoState = {} as any;
      ramStore.examStatus = 'IN_PROGRESS';
      vi.mocked(getStudentIdByIp).mockResolvedValueOnce({
        success: true,
        data: { testId: 'ip-test' }
      } as any);
      vi.mocked(login).mockResolvedValueOnce({
        success: true,
        data: { session_token: 'tok' }
      } as any);
      vi.mocked(getSubmissions).mockResolvedValueOnce({ success: true, data: [] } as any);

      const result = await invoke('auth:login');

      expect(result.success).toBe(true);
      expect(configService.ensureExamPaperReadable).toHaveBeenCalled();
    });

    it('still reports success when the paper cannot be opened, and says so in the log', async () => {
      ramStore.cryptoState = {} as any;
      vi.mocked(getStudentIdByIp).mockResolvedValueOnce({
        success: true,
        data: { testId: 'ip-test' }
      } as any);
      vi.mocked(login).mockResolvedValueOnce({
        success: true,
        data: { session_token: 'tok' }
      } as any);
      vi.mocked(getSubmissions).mockResolvedValueOnce({ success: true, data: [] } as any);
      vi.mocked(configService.ensureExamPaperReadable).mockResolvedValueOnce({
        success: false,
        error: { code: 'NO_RESPONSE', message: 'no key' }
      } as any);

      const result = await invoke('auth:login');

      /* The login itself worked; the paper is a separate failure and the exam
       * page surfaces it. Reporting a failed login here would send the machine
       * back through the entry gate for something the gate cannot fix. */
      expect(result.success).toBe(true);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('still sealed'));
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
