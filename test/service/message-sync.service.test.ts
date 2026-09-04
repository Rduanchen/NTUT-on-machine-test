import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const mockSend = vi.fn();
  let mockWinDestroyed = false;
  let mockContentsDestroyed = false;
  let mockWinNull = false;

  const mockSocket = {
    connected: true,
    emit: vi.fn(),
    on: vi.fn(),
    removeAllListeners: vi.fn(),
    disconnect: vi.fn(),
    io: { on: vi.fn() }
  };
  
  const mockIo = vi.fn(() => mockSocket);

  let mockRamStoreState: any = {
    isOfflineMode: false,
    backendUrl: 'http://test-url',
    socketStatus: 'disconnected',
    examStatus: 'IDLE',
    notifications: [],
    messageVersion: 0,
    cryptoState: { aesKeyHex: 'key' },
    examConfig: null,
    configVersion: 0,
    isStudentVerified: true,
    studentInfo: { id: '123' }
  };

  return {
    mockSend,
    mockSocket,
    mockIo,
    mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    mockJudgeManager: { rejudgeAllStoredPrograms: vi.fn() },
    mockApi: {
      getMessages: vi.fn().mockResolvedValue({ success: true, data: [] }),
      getExamStatus: vi.fn().mockResolvedValue({ success: true, data: { status: 'IDLE' } }),
      fetchSecureExamConfig: vi.fn().mockResolvedValue({ success: true, data: {} }),
      getDeviceUuid: vi.fn(() => Promise.resolve('device-uuid-123'))
    },
    mockSafeParse: vi.fn((data) => ({ success: true, data })),
    mockRamStoreState,
    setWinState: (winNull: boolean, winDest: boolean, contDest: boolean) => {
      mockWinNull = winNull;
      mockWinDestroyed = winDest;
      mockContentsDestroyed = contDest;
    },
    resetRamStore: () => {
      Object.assign(mockRamStoreState, {
        isOfflineMode: false,
        backendUrl: 'http://test-url',
        socketStatus: 'disconnected',
        examStatus: 'IDLE',
        notifications: [],
        messageVersion: 0,
        cryptoState: { aesKeyHex: 'key' },
        examConfig: null,
        configVersion: 0,
        isStudentVerified: true,
        studentInfo: { id: '123' }
      });
    },
    getWinNull: () => mockWinNull,
    getWinDestroyed: () => mockWinDestroyed,
    getContentsDestroyed: () => mockContentsDestroyed,
    mockConfigService: {
      applyPaper: vi.fn(async (meta: any) => {
        mockRamStoreState.examConfig = meta;
      }),
      unsealPaper: vi.fn()
    }
  };
});

vi.mock('socket.io-client', () => ({
  io: mocks.mockIo
}));

vi.mock('../../src/main/services/api.service', () => mocks.mockApi);
vi.mock('../../src/main/services/logger.service', () => ({ logger: mocks.mockLogger }));
vi.mock('../../src/main/services/judge-manager.service', () => ({ judgeManager: mocks.mockJudgeManager }));

vi.mock('../../src/main/schemas/examConfig.schema', () => ({
  /* Delivery returns the split paper now: meta in the clear, questions sealed. */
  examConfigPayloadSchema: {
    safeParse: mocks.mockSafeParse
  }
}));

vi.mock('../../src/main/services/config.service', () => ({
  configService: mocks.mockConfigService
}));

vi.mock('../../src/main/system/windowManager', () => ({
  getMainWindow: vi.fn(() => {
    if (mocks.getWinNull()) return null;
    return {
      isDestroyed: () => mocks.getWinDestroyed(),
      webContents: {
        isDestroyed: () => mocks.getContentsDestroyed(),
        send: mocks.mockSend
      }
    };
  })
}));

vi.mock('../../src/main/services/ramStore.service', () => ({
  ramStore: new Proxy({}, {
    get: (_, prop) => mocks.mockRamStoreState[prop],
    set: (_, prop, value) => {
      mocks.mockRamStoreState[prop] = value;
      return true;
    }
  })
}));

import { messageSyncService } from '../../src/main/services/message-sync.service';

describe('Message Sync Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resetRamStore();
    mocks.setWinState(false, false, false);
    
    // Default mocks
    mocks.mockApi.getMessages.mockResolvedValue({ success: true, data: [] });
    mocks.mockApi.getExamStatus.mockResolvedValue({ success: true, data: { status: 'IDLE' } });
    mocks.mockApi.fetchSecureExamConfig.mockResolvedValue({ success: true, data: {} });
    mocks.mockSafeParse.mockImplementation((data: any) => ({ success: true, data }));
    
    vi.useFakeTimers();
    messageSyncService.stop();
    (messageSyncService as any).currentHost = null;
    (messageSyncService as any).isSyncing = false;
    (messageSyncService as any).isConfigRefreshing = false;
  });

  afterEach(() => {
    messageSyncService.stop();
    vi.useRealTimers();
  });

  describe('Lifecycle & start()', () => {
    it('returns early if offline mode', () => {
      mocks.mockRamStoreState.isOfflineMode = true;
      messageSyncService.start();
      expect(mocks.mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Offline mode active'));
      expect(mocks.mockIo).not.toHaveBeenCalled();
    });

    it('returns early if no backendUrl', () => {
      mocks.mockRamStoreState.backendUrl = '';
      messageSyncService.start();
      expect(mocks.mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Cannot start without backend URL'));
    });

    it('initializes socket and polling', async () => {
      mocks.mockApi.getExamStatus.mockResolvedValueOnce({ success: true, data: { status: 'RUNNING' } });
      mocks.mockApi.getMessages.mockResolvedValueOnce({ success: true, data: [] });
      
      messageSyncService.start();
      
      expect(mocks.mockIo).toHaveBeenCalledWith('http://test-url/user', expect.any(Object));
      expect((messageSyncService as any).pollTimer).not.toBeNull();
      
      // wait for sync microtasks
      await vi.advanceTimersByTimeAsync(1);
      
      expect(mocks.mockRamStoreState.examStatus).toBe('RUNNING');
      expect(mocks.mockSend).toHaveBeenCalledWith('exam:status-changed', 'RUNNING');
    });

    it('cleans up socket if host changes', () => {
      messageSyncService.start('http://host1');
      expect(mocks.mockIo).toHaveBeenCalledWith('http://host1/user', expect.any(Object));
      
      messageSyncService.start('http://host2');
      expect(mocks.mockSocket.disconnect).toHaveBeenCalled();
      expect(mocks.mockIo).toHaveBeenCalledWith('http://host2/user', expect.any(Object));
    });

    it('catches and logs error if initial sync fails', async () => {
      mocks.mockApi.getExamStatus.mockRejectedValueOnce(new Error('initial sync fail'));
      messageSyncService.start();
      
      await vi.advanceTimersByTimeAsync(1);
      
      expect(mocks.mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Initial sync failed'), expect.any(Error));
    });
  });

  describe('Socket Handling', () => {
    let socketHandlers: Record<string, Function> = {};
    let ioHandlers: Record<string, Function> = {};

    beforeEach(() => {
      socketHandlers = {};
      ioHandlers = {};
      mocks.mockSocket.on.mockImplementation((event, cb) => {
        socketHandlers[event] = cb;
      });
      mocks.mockSocket.io.on.mockImplementation((event, cb) => {
        ioHandlers[event] = cb;
      });
      
      messageSyncService.start();
    });

    it('connect sets status and emits register/subscribe', async () => {
      socketHandlers['connect']();
      expect(mocks.mockRamStoreState.socketStatus).toBe('connected');
      expect(mocks.mockSend).toHaveBeenCalledWith('notifications:socket-status', 'connected');
      
      expect(mocks.mockSocket.emit).toHaveBeenCalledWith('subscribe', 'exam-message');
      
      // Advance timers to allow microtasks to resolve
      await vi.advanceTimersByTimeAsync(1);
      
      expect(mocks.mockSocket.emit).toHaveBeenCalledWith('register', { device_uuid: 'device-uuid-123' });
    });

    it('reconnect_attempt sets status to reconnecting', () => {
      ioHandlers['reconnect_attempt']();
      expect(mocks.mockRamStoreState.socketStatus).toBe('reconnecting');
      expect(mocks.mockSend).toHaveBeenCalledWith('notifications:socket-status', 'reconnecting');
    });

    it('disconnect sets status to disconnected', () => {
      socketHandlers['disconnect']();
      expect(mocks.mockRamStoreState.socketStatus).toBe('disconnected');
    });

    it('connect_error sets status to disconnected', () => {
      socketHandlers['connect_error'](new Error('error'));
      expect(mocks.mockRamStoreState.socketStatus).toBe('disconnected');
    });

    it('handles initialization error gracefully', () => {
      mocks.mockIo.mockImplementationOnce(() => {
        throw new Error('Socket crash');
      });
      messageSyncService.stop();
      (messageSyncService as any).currentHost = null;
      
      messageSyncService.start();
      expect(mocks.mockRamStoreState.socketStatus).toBe('disconnected');
      expect(mocks.mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to initialize socket'), expect.any(Error));
    });
    
    describe('Message Ingestion (socket)', () => {
      it('ignores invalid payload', () => {
        socketHandlers['exam-message'](null);
        socketHandlers['exam-message']({ id: 'not-number' });
        expect(mocks.mockRamStoreState.notifications).toHaveLength(0);
      });
      
      it('ingests new message with missing optional fields', () => {
        socketHandlers['exam-message']({
          data: { id: 2, type: 'info' } // missing message, createdAt, namespace
        });
        expect(mocks.mockRamStoreState.notifications).toHaveLength(1);
        expect(mocks.mockRamStoreState.notifications[0].message).toBe('');
        expect(mocks.mockRamStoreState.notifications[0].namespace).toBeUndefined();
      });

      it('ingests new message', () => {
        socketHandlers['exam-message']({
          data: { id: 1, type: 'info', message: 'test' }
        });
        
        expect(mocks.mockRamStoreState.notifications).toHaveLength(1);
        expect(mocks.mockRamStoreState.messageVersion).toBe(1);
        expect(mocks.mockSend).toHaveBeenCalledWith('notifications:updated', expect.any(Array));
      });

      it('updates existing message', () => {
        mocks.mockRamStoreState.notifications = [{ id: 1, type: 'info', message: 'old' }];
        mocks.mockRamStoreState.messageVersion = 1;
        
        socketHandlers['exam-message']({
          id: 1, type: 'info', message: 'new'
        });
        
        expect(mocks.mockRamStoreState.notifications).toHaveLength(1);
        expect(mocks.mockRamStoreState.notifications[0].message).toBe('new');
      });

      it('handles STATUS namespace message', () => {
        socketHandlers['exam-message']({
          id: 1, type: 'status_update', message: 'RUNNING', namespace: 'STATUS'
        });
        expect(mocks.mockRamStoreState.examStatus).toBe('RUNNING');
        expect(mocks.mockSend).toHaveBeenCalledWith('exam:status-changed', 'RUNNING');
      });

      it('handles force_logout type message', () => {
        socketHandlers['exam-message']({
          id: 1, type: 'force_logout', message: 'kicked'
        });
        
        expect(mocks.mockRamStoreState.isStudentVerified).toBe(false);
        expect(mocks.mockRamStoreState.studentInfo.id).toBe('');
        expect(mocks.mockRamStoreState.cryptoState).toBeNull();
        expect(mocks.mockSend).toHaveBeenCalledWith('app:force-logout', 'kicked');
      });

      it('handles config_update type message', async () => {
        mocks.mockApi.fetchSecureExamConfig.mockResolvedValueOnce({
          success: true, data: { meta: { name: 'New Config' }, cipher: { iv: 'i', ciphertext: 'c', tag: 't' } }
        });
        
        socketHandlers['exam-message']({
          id: 1, type: 'config_update', message: ''
        });
        
        // Wait for async config fetch
        await vi.advanceTimersByTimeAsync(1);
        
        expect(mocks.mockApi.fetchSecureExamConfig).toHaveBeenCalled();
        expect(mocks.mockRamStoreState.examConfig.name).toBe('New Config');
        expect(mocks.mockJudgeManager.rejudgeAllStoredPrograms).toHaveBeenCalled();
      });

      it('catches and logs error if config_update fails', async () => {
        mocks.mockApi.fetchSecureExamConfig.mockResolvedValueOnce({
          success: false
        });
        
        socketHandlers['exam-message']({
          id: 1, type: 'config_update', message: ''
        });
        
        await vi.advanceTimersByTimeAsync(1);
        
        expect(mocks.mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to refresh config'), expect.any(Error));
      });
    });
  });

  describe('Polling & syncVersionsAndMessages', () => {
    it('periodic poll syncs messages and exam status', async () => {
      messageSyncService.start();
      await vi.advanceTimersByTimeAsync(1); // Allow initial sync to finish
      
      mocks.mockApi.getMessages.mockResolvedValueOnce({ success: true, data: [{ id: 1, type: 'msg' }] });
      mocks.mockApi.getExamStatus.mockResolvedValueOnce({ success: true, data: { status: 'FINISHED' } });
      
      await vi.advanceTimersByTimeAsync(60000);
      
      expect(mocks.mockApi.getExamStatus).toHaveBeenCalled();
      expect(mocks.mockRamStoreState.examStatus).toBe('FINISHED');
      expect(mocks.mockSend).toHaveBeenCalledWith('exam:status-changed', 'FINISHED');
    });

    it('catches and warns if polling fails with Error', async () => {
      messageSyncService.start();
      await vi.advanceTimersByTimeAsync(1); // Allow initial sync to finish
      
      mocks.mockApi.getExamStatus.mockRejectedValueOnce(new Error('fail'));
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await vi.advanceTimersByTimeAsync(60000);
      
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Periodic sync failed'), 'fail');
      consoleWarnSpy.mockRestore();
    });
    
    it('catches and warns if polling fails with string error', async () => {
      messageSyncService.start();
      await vi.advanceTimersByTimeAsync(1);
      
      mocks.mockApi.getExamStatus.mockRejectedValueOnce('fail string');
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await vi.advanceTimersByTimeAsync(60000);
      
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Periodic sync failed'), 'fail string');
      consoleWarnSpy.mockRestore();
    });

    it('returns early if already syncing', async () => {
      (messageSyncService as any).isSyncing = true;
      await messageSyncService.manualRefresh();
      expect(mocks.mockApi.getExamStatus).not.toHaveBeenCalled();
    });

    it('returns early if no backendUrl', async () => {
      mocks.mockRamStoreState.backendUrl = '';
      await messageSyncService.manualRefresh();
      expect(mocks.mockApi.getExamStatus).not.toHaveBeenCalled();
    });
    
    it('fetches messages after specific ID if messageVersion > 0', async () => {
      mocks.mockRamStoreState.messageVersion = 5;
      mocks.mockApi.getMessages.mockResolvedValueOnce({ success: true, data: [{ id: 6 }] });
      await messageSyncService.manualRefresh();
      expect(mocks.mockApi.getMessages).toHaveBeenCalledWith('5');
    });

    it('returns early if getMessages returns false success', async () => {
      mocks.mockApi.getMessages.mockResolvedValueOnce({ success: false });
      await messageSyncService.manualRefresh();
      // Should not update notifications
      expect(mocks.mockRamStoreState.notifications).toHaveLength(0);
    });

    it('returns early if getMessages returns null data', async () => {
      mocks.mockApi.getMessages.mockResolvedValueOnce({ success: true, data: null });
      await messageSyncService.manualRefresh();
      expect(mocks.mockRamStoreState.notifications).toHaveLength(0);
    });
  });

  describe('Config Refresh', () => {
    it('returns early if already refreshing', async () => {
      (messageSyncService as any).isConfigRefreshing = true;
      await messageSyncService.forceConfigRefresh();
      expect(mocks.mockApi.fetchSecureExamConfig).not.toHaveBeenCalled();
    });

    it('returns early if cryptoState missing', async () => {
      mocks.mockRamStoreState.cryptoState = null;
      await messageSyncService.forceConfigRefresh();
      expect(mocks.mockApi.fetchSecureExamConfig).not.toHaveBeenCalled();
    });

    it('throws if API returns false success', async () => {
      mocks.mockApi.fetchSecureExamConfig.mockResolvedValueOnce({ success: false });
      await expect(messageSyncService.forceConfigRefresh()).rejects.toThrow('Unable to fetch secure exam config');
    });

    it('throws if schema validation fails', async () => {
      mocks.mockApi.fetchSecureExamConfig.mockResolvedValueOnce({ success: true, data: { invalid_field: 'a' } }); // missing required fields
      mocks.mockSafeParse.mockReturnValueOnce({ success: false });
      await expect(messageSyncService.forceConfigRefresh()).rejects.toThrow('Secure config validation failed');
    });

    it('updates config and sets version if targetVersion provided', async () => {
      mocks.mockApi.fetchSecureExamConfig.mockResolvedValueOnce({
        success: true, data: { meta: { name: 'Test' }, cipher: { iv: 'i', ciphertext: 'c', tag: 't' } }
      });
      await (messageSyncService as any).refreshConfigFromServer(5);
      
      expect(mocks.mockRamStoreState.configVersion).toBe(5);
      expect(mocks.mockRamStoreState.examConfig.name).toBe('Test');
    });
  });

  describe('Renderer Notification Safety', () => {
    it('handles null window in notifySocketStatus', () => {
      mocks.setWinState(true, false, false);
      (messageSyncService as any).notifySocketStatus();
    });
    
    it('handles destroyed window in notifySocketStatus', () => {
      mocks.setWinState(false, true, false);
      (messageSyncService as any).notifySocketStatus();
    });

    it('handles null window in notifyNotificationsUpdated', () => {
      mocks.setWinState(true, false, false);
      (messageSyncService as any).notifyNotificationsUpdated();
    });

    it('handles destroyed window in status updates', async () => {
      mocks.setWinState(false, true, false);
      mocks.mockApi.getMessages.mockResolvedValue({ success: true, data: [] });
      mocks.mockApi.getExamStatus.mockResolvedValue({ success: true, data: { status: 'RUNNING' } });
      await messageSyncService.manualRefresh();
    });
    
    it('handles null window in force logout', () => {
      mocks.setWinState(true, false, false);
      (messageSyncService as any).ingestMessage({ type: 'force_logout', id: 1 });
    });
  });
});
