import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => {
  let mockQueuedLogs: any[] = [];
  let logSendFunction: any = null;
  let mockWindowDestroyed = false;
  let mockContentsDestroyed = false;
  const mockSend = vi.fn();

  const mockRamStoreListeners: Record<string, Function[]> = {};
  let mockRamStoreState: any = {
    isConnected: false,
    connectionStatus: 'disconnected',
    isOfflineMode: false,
    pendingLoginSync: false,
    studentInfo: { id: 'test_student' },
    cryptoState: { userSessionID: 'old_session' },
    backendUrl: 'http://test-url',
    markTestResultSynced: vi.fn()
  };

  return {
    mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    mockGetAndClearLogQueue: vi.fn(() => {
      const logs = [...mockQueuedLogs];
      mockQueuedLogs = [];
      return logs;
    }),
    mockHasQueuedLogs: vi.fn(() => mockQueuedLogs.length > 0),
    mockRequeueLogs: vi.fn((logs) => { mockQueuedLogs.push(...logs); }),
    mockSetLogSendFunction: vi.fn((fn) => { logSendFunction = fn; }),
    mockLogServerEvent: vi.fn(),
    mockLogAction: vi.fn(),
    mockSubmitCode: vi.fn(async () => ({ success: true })),
    mockSubmitScore: vi.fn(async () => ({ success: true })),
    mockLogin: vi.fn(),
    mockSend,
    mockWindowDestroyed,
    mockContentsDestroyed,
    mockRamStoreListeners,
    mockRamStoreState,
    getQueuedLogs: () => mockQueuedLogs,
    setQueuedLogs: (logs: any[]) => { mockQueuedLogs = logs; },
    getLogSendFunction: () => logSendFunction,
    setLogSendFunctionNull: () => { logSendFunction = null; },
    setWindowDestroyed: (val: boolean) => { mockWindowDestroyed = val; },
    setContentsDestroyed: (val: boolean) => { mockContentsDestroyed = val; },
    setRamStoreState: (val: any) => { mockRamStoreState = val; }
  };
});

vi.mock('../../src/main/services/api.service', () => ({
  logAction: mocks.mockLogAction,
  login: mocks.mockLogin,
  submitCode: mocks.mockSubmitCode,
  submitScore: mocks.mockSubmitScore
}));

vi.mock('../../src/main/services/logger.service', () => ({
  logger: mocks.mockLogger,
  getAndClearLogQueue: mocks.mockGetAndClearLogQueue,
  hasQueuedLogs: mocks.mockHasQueuedLogs,
  requeueLogs: mocks.mockRequeueLogs,
  setLogSendFunction: mocks.mockSetLogSendFunction,
  logServerEvent: mocks.mockLogServerEvent
}));

vi.mock('../../src/main/system/windowManager', () => ({
  getMainWindow: vi.fn(() => {
    if (mocks.mockWindowDestroyed) return null;
    return {
      isDestroyed: () => false,
      webContents: mocks.mockContentsDestroyed ? null : {
        isDestroyed: () => false,
        send: mocks.mockSend
      }
    };
  })
}));

vi.mock('../../src/main/services/ramStore.service', () => ({
  ramStore: new Proxy({}, {
    get: (_, prop) => {
      if (prop === 'on') return (evt: string, cb: Function) => {
        if (!mocks.mockRamStoreListeners[evt]) mocks.mockRamStoreListeners[evt] = [];
        mocks.mockRamStoreListeners[evt].push(cb);
      };
      if (prop === 'off') return (evt: string, cb: Function) => {
        if (mocks.mockRamStoreListeners[evt]) {
          mocks.mockRamStoreListeners[evt] = mocks.mockRamStoreListeners[evt].filter(f => f !== cb);
        }
      };
      if (prop === 'isConnected') return mocks.mockRamStoreState.connectionStatus === 'connected';
      return mocks.mockRamStoreState[prop];
    },
    set: (_, prop, value) => {
      mocks.mockRamStoreState[prop] = value;
      return true;
    }
  })
}));

import { connectionService } from '../../src/main/services/connection.service';

describe('Connection Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.setQueuedLogs([]);
    mocks.setLogSendFunctionNull();
    mocks.setWindowDestroyed(false);
    mocks.setContentsDestroyed(false);
    Object.keys(mocks.mockRamStoreListeners).forEach(k => delete mocks.mockRamStoreListeners[k]);

    Object.assign(mocks.mockRamStoreState, {
      isConnected: false,
      connectionStatus: 'disconnected',
      isOfflineMode: false,
      pendingLoginSync: false,
      studentInfo: { id: 'test_student' },
      cryptoState: { userSessionID: 'old_session' },
      backendUrl: 'http://test-url',
      markTestResultSynced: vi.fn()
    });
    
    // Empty the queues in the singleton
    (connectionService as any).pendingSubmissions = new Map();
    (connectionService as any).pendingScore = null;
    (connectionService as any).pendingConfigRefresh = false;
    (connectionService as any).isSyncing = false;
  });

  it('starts and stops correctly', async () => {
    connectionService.start();
    expect(mocks.mockSetLogSendFunction).toHaveBeenCalled();
    expect(mocks.mockRamStoreListeners['socketStatus']).toHaveLength(1);

    // Call setLogSendFunction handler
    await mocks.getLogSendFunction()({ action: 'TEST' });
    expect(mocks.mockLogAction).toHaveBeenCalledWith({ action: 'TEST' });

    connectionService.stop();
    expect(mocks.mockRamStoreListeners['socketStatus']).toHaveLength(0);
  });

  describe('socketStatus changes', () => {
    beforeEach(() => {
      connectionService.start();
    });

    afterEach(() => {
      connectionService.stop();
    });

    const triggerStatus = (status: string) => {
      mocks.mockRamStoreListeners['socketStatus'].forEach(cb => cb(status));
    };

    it('handles connected when previously disconnected', async () => {
      mocks.mockRamStoreState.connectionStatus = 'disconnected';
      triggerStatus('connected');
      
      expect(mocks.mockRamStoreState.connectionStatus).toBe('connected');
      expect(mocks.mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Server connection restored'));
      expect(mocks.mockSend).toHaveBeenCalledWith('connection:status-changed', 'connected');
    });

    it('handles disconnected when previously connected', async () => {
      mocks.mockRamStoreState.connectionStatus = 'connected';
      triggerStatus('disconnected');
      
      expect(mocks.mockRamStoreState.connectionStatus).toBe('disconnected');
      expect(mocks.mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Server connection lost'));
      expect(mocks.mockLogServerEvent).toHaveBeenCalledWith('USER_DISCONNECT', expect.any(String));
      expect(mocks.mockSend).toHaveBeenCalledWith('connection:status-changed', 'disconnected');
    });
    
    it('does nothing special if status is the same', async () => {
      mocks.mockRamStoreState.connectionStatus = 'connected';
      triggerStatus('connected');
      
      expect(mocks.mockLogger.info).not.toHaveBeenCalled();
      expect(mocks.mockSend).toHaveBeenCalledWith('connection:status-changed', 'connected');
    });
    
    it('notifies renderer safely if window is null', async () => {
      mocks.setWindowDestroyed(true);
      triggerStatus('connected');
    });
    
    it('notifies renderer safely if window is destroyed', async () => {
      const { getMainWindow } = await import('../../src/main/system/windowManager');
      vi.mocked(getMainWindow).mockReturnValueOnce({ isDestroyed: () => true } as any);
      triggerStatus('connected');
    });
    
    it('notifies renderer safely if contents is null', async () => {
      const { getMainWindow } = await import('../../src/main/system/windowManager');
      vi.mocked(getMainWindow).mockReturnValueOnce({ isDestroyed: () => false, webContents: null } as any);
      triggerStatus('connected');
    });

    it('notifies renderer safely if contents is destroyed', async () => {
      const { getMainWindow } = await import('../../src/main/system/windowManager');
      vi.mocked(getMainWindow).mockReturnValueOnce({ isDestroyed: () => false, webContents: { isDestroyed: () => true } } as any);
      triggerStatus('connected');
    });
    
    it('notifies renderer safely if send throws', async () => {
      mocks.mockSend.mockImplementationOnce(() => {
        throw new Error('Send failed');
      });
      triggerStatus('connected');
      // just ensuring it doesn't throw
    });
  });

  describe('onConnectionRestored - Sync logic', () => {
    beforeEach(() => {
      connectionService.start();
    });

    afterEach(() => {
      connectionService.stop();
    });

    const triggerConnected = () => {
      mocks.mockRamStoreState.connectionStatus = 'disconnected';
      mocks.mockRamStoreListeners['socketStatus'].forEach(cb => cb('connected'));
    };

    it('returns early if isOfflineMode', async () => {
      mocks.mockRamStoreState.isOfflineMode = true;
      triggerConnected();
      expect(mocks.mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Offline mode active'));
    });
    
    it('returns early if already syncing', async () => {
      (connectionService as any).isSyncing = true;
      triggerConnected();
      // Should not do anything else
      expect(mocks.mockLogin).not.toHaveBeenCalled();
    });

    describe('Retroactive Login Sync', () => {
      it('syncs login successfully', async () => {
        mocks.mockRamStoreState.pendingLoginSync = true;
        mocks.mockLogin.mockResolvedValueOnce({ success: true, data: { session_token: 'new_token' } });
        
        triggerConnected();
        // Wait for async operations to complete
        await new Promise(r => setTimeout(r, 0));
        
        expect(mocks.mockRamStoreState.cryptoState.userSessionID).toBe('new_token');
        expect(mocks.mockRamStoreState.pendingLoginSync).toBe(false);
      });

      it('syncs login failed (API error)', async () => {
        mocks.mockRamStoreState.pendingLoginSync = true;
        mocks.mockLogin.mockResolvedValueOnce({ success: false, error: { message: 'invalid' } });
        
        triggerConnected();
        await new Promise(r => setTimeout(r, 0));
        
        expect(mocks.mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Retroactive login failed'));
        expect(mocks.mockRamStoreState.pendingLoginSync).toBe(true);
      });

      it('syncs login failed (Exception)', async () => {
        mocks.mockRamStoreState.pendingLoginSync = true;
        mocks.mockLogin.mockRejectedValueOnce(new Error('crash'));
        
        triggerConnected();
        await new Promise(r => setTimeout(r, 0));
        
        expect(mocks.mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Retroactive login error'), expect.any(Error));
      });
      
      it('handles unexpected errors during onConnectionRestored', async () => {
        // We can force an unexpected error by temporarily replacing flushLogQueue
        const originalFlush = (connectionService as any).flushLogQueue;
        (connectionService as any).flushLogQueue = vi.fn().mockRejectedValueOnce(new Error('Unexpected error'));
        
        triggerConnected();
        await new Promise(r => setTimeout(r, 0));
        
        expect(mocks.mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Error during reconnect sync:'), expect.any(Error));
        
        // Restore
        (connectionService as any).flushLogQueue = originalFlush;
      });
    });

    describe('Flush Log Queue', () => {
      it('skips flush if no queued logs', async () => {
        triggerConnected();
        await new Promise(r => setTimeout(r, 0));
        expect(mocks.mockGetAndClearLogQueue).not.toHaveBeenCalled();
      });
      
      it('skips flush if no queued logs directly', async () => {
        mocks.setQueuedLogs([]);
        await (connectionService as any).flushLogQueue();
        expect(mocks.mockGetAndClearLogQueue).not.toHaveBeenCalled();
      });

      it('skips flush if offline mode', async () => {
        mocks.mockRamStoreState.isOfflineMode = true;
        triggerConnected();
        await new Promise(r => setTimeout(r, 0));
        expect(mocks.mockGetAndClearLogQueue).not.toHaveBeenCalled();
      });

      it('flushes logs successfully', async () => {
        mocks.setQueuedLogs([{ action: 'LOG1' }, { action: 'LOG2' }]);
        mocks.mockLogAction.mockResolvedValue({ success: true });
        
        triggerConnected();
        await new Promise(r => setTimeout(r, 0));
        
        expect(mocks.mockLogAction).toHaveBeenCalledTimes(2);
        expect(mocks.getQueuedLogs()).toHaveLength(0);
        expect(mocks.mockRequeueLogs).not.toHaveBeenCalled();
      });

      it('requeues logs if one fails with success: false', async () => {
        mocks.setQueuedLogs([{ action: 'LOG1' }, { action: 'LOG2' }]);
        mocks.mockLogAction.mockResolvedValueOnce({ success: false });
        mocks.mockLogAction.mockResolvedValueOnce({ success: true });
        
        triggerConnected();
        await new Promise(r => setTimeout(r, 0));
        
        expect(mocks.mockRequeueLogs).toHaveBeenCalledWith([{ action: 'LOG1' }]);
      });

      it('stops and requeues on exception', async () => {
        mocks.setQueuedLogs([{ action: 'LOG1' }, { action: 'LOG2' }]);
        mocks.mockLogAction.mockRejectedValueOnce(new Error('crash'));
        
        triggerConnected();
        await new Promise(r => setTimeout(r, 0));
        
        // Stops trying, LOG2 is not sent
        expect(mocks.mockLogAction).toHaveBeenCalledTimes(1);
        expect(mocks.mockRequeueLogs).toHaveBeenCalledWith([{ action: 'LOG1' }]);
      });
    });

    describe('work produced while disconnected', () => {
      const submission = { puzzleId: 'Q1', language: 'Python', codeContent: 'print(1)' };

      it('sends a queued submission when the connection comes back', async () => {
        connectionService.queueSubmission(submission);

        triggerConnected();
        await new Promise((r) => setTimeout(r, 0));

        expect(mocks.mockSubmitCode).toHaveBeenCalledWith('print(1)', 'Q1', 'Python');
        expect(connectionService.getPendingCounts().submissions).toBe(0);
      });

      it('sends a queued score and marks the results synced', async () => {
        connectionService.queueScore({ score: 80 });

        triggerConnected();
        await new Promise((r) => setTimeout(r, 0));

        expect(mocks.mockSubmitScore).toHaveBeenCalledWith({ score: 80 });
        expect(mocks.mockRamStoreState.markTestResultSynced).toHaveBeenCalled();
        expect(connectionService.getPendingCounts().score).toBe(false);
      });

      it('keeps work that fails to send rather than dropping it', async () => {
        /* The connection has just come back and may go again. Losing the work
         * on the second outage is no better than losing it on the first. */
        mocks.mockSubmitCode.mockResolvedValueOnce({ success: false } as any);
        connectionService.queueSubmission(submission);

        triggerConnected();
        await new Promise((r) => setTimeout(r, 0));

        expect(connectionService.getPendingCounts().submissions).toBe(1);
      });

      it('keeps work when sending throws', async () => {
        mocks.mockSubmitCode.mockRejectedValueOnce(new Error('socket closed'));
        connectionService.queueSubmission(submission);

        triggerConnected();
        await new Promise((r) => setTimeout(r, 0));

        expect(connectionService.getPendingCounts().submissions).toBe(1);
      });

      it('keeps one entry per puzzle however many times it is answered', async () => {
        /* A student editing the same question offline should leave one entry,
         * not a pile. The last version is the one they want sent. */
        connectionService.queueSubmission({ ...submission, codeContent: 'v1' });
        connectionService.queueSubmission({ ...submission, codeContent: 'v2' });
        connectionService.queueSubmission({ ...submission, codeContent: 'v3' });

        expect(connectionService.getPendingCounts().submissions).toBe(1);

        triggerConnected();
        await new Promise((r) => setTimeout(r, 0));

        expect(mocks.mockSubmitCode).toHaveBeenCalledTimes(1);
        expect(mocks.mockSubmitCode).toHaveBeenCalledWith('v3', 'Q1', 'Python');
      });

      it('keeps only the latest score', async () => {
        connectionService.queueScore({ score: 10 });
        connectionService.queueScore({ score: 90 });

        triggerConnected();
        await new Promise((r) => setTimeout(r, 0));

        expect(mocks.mockSubmitScore).toHaveBeenCalledTimes(1);
        expect(mocks.mockSubmitScore).toHaveBeenCalledWith({ score: 90 });
      });

      it('sends every queued puzzle, not just the first', async () => {
        connectionService.queueSubmission(submission);
        connectionService.queueSubmission({ puzzleId: 'Q2', language: 'Cpp', codeContent: 'int main(){}' });

        triggerConnected();
        await new Promise((r) => setTimeout(r, 0));

        expect(mocks.mockSubmitCode).toHaveBeenCalledTimes(2);
        expect(connectionService.getPendingCounts().submissions).toBe(0);
      });

      it('retries pending config refresh', async () => {
        connectionService.markPendingConfigRefresh();

        triggerConnected();
        await new Promise((r) => setTimeout(r, 0));

        expect((connectionService as any).pendingConfigRefresh).toBe(false);
      });
    });

    /* Feature 007 bugfix BUG-06. Queued work survived a global reset and was
     * posted into the next exam as soon as the socket came back — a different
     * exam, created by the backend after the wipe, with different students in
     * the same seats. Losing it is the point: the exam it belonged to no longer
     * exists. */
    describe('clearQueues on a global reset', () => {
      const submission = { puzzleId: 'Q1', language: 'Python', codeContent: 'print(1)' };

      it('drops queued submissions and the queued score', () => {
        connectionService.queueSubmission(submission);
        connectionService.queueScore({ score: 42 });

        connectionService.clearQueues();

        expect(connectionService.getPendingCounts()).toEqual({ submissions: 0, score: false });
      });

      it('drops the action log waiting to be sent', () => {
        connectionService.clearQueues();

        expect(mocks.mockGetAndClearLogQueue).toHaveBeenCalled();
      });

      it('sends nothing from the wiped exam when the connection returns', async () => {
        connectionService.queueSubmission(submission);
        connectionService.queueScore({ score: 42 });

        connectionService.clearQueues();

        triggerConnected();
        await new Promise((r) => setTimeout(r, 0));

        expect(mocks.mockSubmitCode).not.toHaveBeenCalled();
        expect(mocks.mockSubmitScore).not.toHaveBeenCalled();
      });
    });
  });
});
