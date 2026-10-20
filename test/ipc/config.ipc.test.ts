import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ipcMain } from 'electron';
import { registerConfigIpc } from '../../src/main/ipc/config.ipc';
import { configService } from '../../src/main/services/config.service';
import { ramStore } from '../../src/main/services/ramStore.service';
import { healthCheck } from '../../src/main/services/api.service';

vi.mock('../../src/main/services/api.service', () => ({ healthCheck: vi.fn() }));

vi.mock('../../src/main/services/config.service', () => ({
  configService: {
    setConfigFromFile: vi.fn(),
    setConfigFromServer: vi.fn(),
    checkServerStatus: vi.fn(),
    isConfigLoaded: vi.fn(),
  }
}));

vi.mock('../../src/main/services/ramStore.service', () => ({
  ramStore: {
    backendUrl: null
  }
}));

describe('config.ipc', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-register IPC handlers before each test if necessary, 
    // or just once. The setup.ts mock replaces previous handlers if called again.
    registerConfigIpc();
  });

  const invoke = (channel: string, ...args: any[]) => {
    return (ipcMain as any)._invokeHandler(channel, {}, ...args);
  };

  it('config:set-json', async () => {
    vi.mocked(configService.setConfigFromFile).mockResolvedValueOnce({ success: true } as any);
    const result = await invoke('config:set-json', 'test.json');
    expect(configService.setConfigFromFile).toHaveBeenCalledWith('test.json');
    expect(result).toEqual({ success: true });
  });

  it('config:get-from-server', async () => {
    vi.mocked(configService.setConfigFromServer).mockResolvedValueOnce({ success: true } as any);
    const result = await invoke('config:get-from-server', 'http://test');
    expect(configService.setConfigFromServer).toHaveBeenCalledWith('http://test');
    expect(result).toEqual({ success: true });
  });

  it('config:server-status', async () => {
    vi.mocked(configService.checkServerStatus).mockResolvedValueOnce(true as any);
    const result = await invoke('config:server-status', 'http://test');
    expect(configService.checkServerStatus).toHaveBeenCalledWith('http://test');
    expect(result).toEqual(true);
  });

  it('config:setup-complete', async () => {
    vi.mocked(configService.isConfigLoaded).mockReturnValueOnce(true);
    const result = await invoke('config:setup-complete');
    expect(configService.isConfigLoaded).toHaveBeenCalled();
    expect(result).toEqual(true);
  });

  it('config:has-backend-url returns true when backendUrl exists', async () => {
    ramStore.backendUrl = 'http://test';
    const result = await invoke('config:has-backend-url');
    expect(result).toBe(true);
  });

  it('config:has-backend-url returns false when backendUrl is null', async () => {
    ramStore.backendUrl = null;
    const result = await invoke('config:has-backend-url');
    expect(result).toBe(false);
  });

  it('reports a missing backend URL as unreachable without a request', async () => {
    ramStore.backendUrl = null;
    expect(await invoke('config:is-backend-reachable')).toBe(false);
    expect(healthCheck).not.toHaveBeenCalled();
  });

  it('checks the configured backend before allowing the startup redirect', async () => {
    ramStore.backendUrl = 'http://test';
    vi.mocked(healthCheck).mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    expect(await invoke('config:is-backend-reachable')).toBe(false);
    expect(await invoke('config:is-backend-reachable')).toBe(true);
    expect(healthCheck).toHaveBeenCalledWith('http://test');
  });
});
