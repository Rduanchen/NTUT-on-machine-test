import { vi } from 'vitest';

// 設定測試用的環境變數
process.env.JUDGE_CPU_TIME_LIMIT_MS = '10000';
process.env.JUDGE_WALL_TIME_LIMIT_MS = '15000';
process.env.JUDGE_MEMORY_LIMIT_KB = '102400';
process.env.JUDGER_URL = 'http://localhost:2000';
process.env.NODE_ENV = 'test';

// 全域 Mock Electron API
vi.mock('electron', () => {
  const ipcMainHandlers: Record<string, Function> = {};
  const ipcMainListeners: Record<string, Function> = {};

  return {
    app: {
      getPath: vi.fn((name: string) => `/mock/path/${name}`),
      getAppPath: vi.fn(() => '/mock/app/path'),
      getVersion: vi.fn(() => '1.0.0'),
      quit: vi.fn(),
      relaunch: vi.fn(),
      exit: vi.fn(),
    },
    ipcMain: {
      handle: vi.fn((channel: string, listener: Function) => {
        ipcMainHandlers[channel] = listener;
      }),
      removeHandler: vi.fn((channel: string) => {
        delete ipcMainHandlers[channel];
      }),
      on: vi.fn((channel: string, listener: Function) => {
        ipcMainListeners[channel] = listener;
      }),
      off: vi.fn((channel: string) => {
        delete ipcMainListeners[channel];
      }),
      // 提供給測試呼叫的 Helper，不會出現在實際的 electron 中
      _invokeHandler: async (channel: string, event: any, ...args: any[]) => {
        if (!ipcMainHandlers[channel]) {
          throw new Error(`No handler registered for channel: ${channel}`);
        }
        return ipcMainHandlers[channel](event, ...args);
      }
    },
    BrowserWindow: {
      getAllWindows: vi.fn(() => []),
    },
    dialog: {
      showOpenDialog: vi.fn(),
      showMessageBox: vi.fn(),
    },
  };
});
