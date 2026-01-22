// src/main/services/configService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { ConfigService } from '../../src/main/service/config.service';
import { store } from '../../src/main/store/store';
import { ApiSystem, fetchConfig, getServerStatus } from '../../src/main/api';
import { actionLogger } from '../../src/main/system/logger';
import { validatePreSettingsFormat } from '../../src/main/utilities/presettingsFormatChecker';
import { validateConfigFormat } from '../../src/main/utilities/configFormatChecker';

// ---- Vitest mocks ----
vi.mock('fs');
vi.mock('path');
vi.mock('electron', () => ({
    app: {
        getAppPath: vi.fn(),
    },
}));
vi.mock('../../src/main/store/store', () => ({
    store: {
        updateConfig: vi.fn(),
    },
}));
vi.mock('../../src/main/api', () => ({
    ApiSystem: {
        setup: vi.fn(),
    },
    fetchConfig: vi.fn(),
    getServerStatus: vi.fn(),
}));
vi.mock('../../src/main/system/logger', () => ({
    actionLogger: {
        info: vi.fn(),
        error: vi.fn(),
    },
}));
vi.mock('../../src/main/utilities/presettingsFormatChecker', () => ({
    validatePreSettingsFormat: vi.fn(),
}));
vi.mock('../../src/main/utilities/configFormatChecker', () => ({
    validateConfigFormat: vi.fn(),
}));

// 型別輔助
const mockedFs = fs as unknown as {
    readFileSync: ReturnType<typeof vi.fn>;
    existsSync: ReturnType<typeof vi.fn>;
};
const mockedPath = path as unknown as {
    join: ReturnType<typeof vi.fn>;
};
const mockedApp = app as unknown as {
    getAppPath: ReturnType<typeof vi.fn>;
};
const mockedStore = store as unknown as {
    updateConfig: ReturnType<typeof vi.fn>;
};
const mockedApiSystem = ApiSystem as unknown as {
    setup: ReturnType<typeof vi.fn>;
};
const mockedFetchConfig = fetchConfig as unknown as ReturnType<typeof vi.fn>;
const mockedGetServerStatus = getServerStatus as unknown as ReturnType<
    typeof vi.fn
>;
const mockedLogger = actionLogger as unknown as {
    info: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
};
const mockedValidatePreSettingsFormat =
    validatePreSettingsFormat as unknown as ReturnType<typeof vi.fn>;
const mockedValidateConfigFormat =
    validateConfigFormat as unknown as ReturnType<typeof vi.fn>;

describe('ConfigService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // 若你在 ConfigService 裡面加了 _resetForTest，可以在這裡呼叫：
        // (ConfigService as any)._resetForTest?.();
    });

    describe('setConfigFromFile', () => {
        it('config format invalid returns error', async () => {
            mockedFs.readFileSync = vi
                .fn()
                .mockReturnValueOnce(JSON.stringify({ some: 'data' }));

            mockedValidateConfigFormat.mockReturnValueOnce({
                success: false,
                error: 'Invalid format details',
            });

            const res = await ConfigService.setConfigFromFile('/path/config.json');

            expect(mockedFs.readFileSync).toHaveBeenCalledWith(
                '/path/config.json',
                'utf-8',
            );
            expect(res.success).toBe(false);
            expect(res.error?.code).toBeDefined();
        });

        it('reads file, updates store and sets isConfigLoaded to true', async () => {
            mockedFs.readFileSync = vi
                .fn()
                .mockReturnValueOnce(JSON.stringify({ some: 'config' }));

            mockedValidateConfigFormat.mockReturnValueOnce({
                success: true,
                data: { some: 'config' },
            });
            const res = await ConfigService.setConfigFromFile('/path/config.json');

            expect(mockedFs.readFileSync).toHaveBeenCalledWith(
                '/path/config.json',
                'utf-8',
            );
            expect(mockedStore.updateConfig).toHaveBeenCalledWith({
                some: 'config',
            });
            expect(res.success).toBe(true);
            expect(ConfigService.isConfigLoaded()).toBe(true);
        });
    });

    describe('setConfigFromServer', () => {
        it('returns error when no response from server', async () => {
            (mockedFetchConfig as any).mockResolvedValueOnce(null);

            const res = await ConfigService.setConfigFromServer('http://example.com');

            expect(res.success).toBe(false);
            expect(res.error?.code).toBeDefined();
            // 視你預期而定，這裡通常仍是 false
            expect(ConfigService.isConfigLoaded()).toBe(false);
        });

        it('updates store and sets isConfigLoaded on success', async () => {
            const remoteConfig = { a: 1 };
            (mockedFetchConfig as any).mockResolvedValueOnce(remoteConfig);

            const res = await ConfigService.setConfigFromServer('http://example.com');

            expect(mockedFetchConfig).toHaveBeenCalledWith('http://example.com');
            expect(mockedStore.updateConfig).toHaveBeenCalledWith(remoteConfig);
            expect(mockedApiSystem.setup).toHaveBeenCalled();
            expect(res.success).toBe(true);
            expect(ConfigService.isConfigLoaded()).toBe(true);
        });
    });

    describe('checkServerStatus', () => {
        it('returns error when server status is not ok', async () => {
            (mockedGetServerStatus as any).mockResolvedValueOnce({ success: false });

            const res = await ConfigService.checkServerStatus('host');

            expect(res.success).toBe(false);
            expect(res.error?.code).toBeDefined();
        });

        it('returns success with data when server status ok', async () => {
            const status = { success: true, foo: 'bar' };
            (mockedGetServerStatus as any).mockResolvedValueOnce(status);

            const res = await ConfigService.checkServerStatus('host');

            expect(res.success).toBe(true);
            expect(res.data).toEqual(status);
        });
    });

    describe('initFromLocalPreSettings', () => {
        it('logs and sets isConfigLoaded false when file does not exist', async () => {
            mockedPath.join = vi.fn().mockReturnValue('/fake/pre_settings.json');
            mockedApp.getAppPath = vi.fn().mockReturnValue('/app');
            mockedFs.existsSync = vi.fn().mockReturnValue(false);

            await ConfigService.initFromLocalPreSettings();

            expect(mockedFs.existsSync).toHaveBeenCalledWith(
                '/fake/pre_settings.json',
            );
            expect(mockedLogger.error).toHaveBeenCalledWith(
                'No local config file found when starting up',
            );
            expect(ConfigService.isConfigLoaded()).toBe(false);
        });

        it('fails when pre-settings format is invalid', async () => {
            mockedPath.join = vi.fn().mockReturnValue('/fake/pre_settings.json');
            mockedFs.existsSync = vi.fn().mockReturnValue(true);
            mockedFs.readFileSync = vi.fn().mockReturnValue('{}');
            mockedValidatePreSettingsFormat.mockReturnValue({
                success: false,
                error: 'bad format',
            });

            await ConfigService.initFromLocalPreSettings();

            expect(mockedLogger.error).toHaveBeenCalledWith(
                'Local pre_settings.json format is invalid: bad format',
            );
            expect(ConfigService.isConfigLoaded()).toBe(false);
        });

        it('fails when server returns no config', async () => {
            mockedPath.join = vi.fn().mockReturnValue('/fake/pre_settings.json');
            mockedFs.existsSync = vi.fn().mockReturnValue(true);
            mockedFs.readFileSync = vi
                .fn()
                .mockReturnValue(JSON.stringify({ remoteHost: 'http://example.com' }));
            mockedValidatePreSettingsFormat.mockReturnValue({ success: true });
            (mockedFetchConfig as any).mockResolvedValueOnce(null);

            await ConfigService.initFromLocalPreSettings();

            expect(mockedLogger.error).toHaveBeenCalledWith(
                'Failed to fetch config from server during init',
            );
            expect(ConfigService.isConfigLoaded()).toBe(false);
        });

        it('fails when remote config format invalid', async () => {
            mockedPath.join = vi.fn().mockReturnValue('/fake/pre_settings.json');
            mockedFs.existsSync = vi.fn().mockReturnValue(true);
            mockedFs.readFileSync = vi
                .fn()
                .mockReturnValue(JSON.stringify({ remoteHost: 'http://example.com' }));
            mockedValidatePreSettingsFormat.mockReturnValue({ success: true });
            (mockedFetchConfig as any).mockResolvedValueOnce({ some: 'data' });
            mockedValidateConfigFormat.mockReturnValue({
                success: false,
                error: 'config bad',
            });

            await ConfigService.initFromLocalPreSettings();

            expect(mockedLogger.error).toHaveBeenCalledWith(
                'Invalid config format fetched from server during init: config bad',
            );
            expect(ConfigService.isConfigLoaded()).toBe(false);
        });

        it('updates store, calls ApiSystem.setup and sets isConfigLoaded true on success', async () => {
            mockedPath.join = vi.fn().mockReturnValue('/fake/pre_settings.json');
            mockedFs.existsSync = vi.fn().mockReturnValue(true);
            mockedFs.readFileSync = vi
                .fn()
                .mockReturnValue(JSON.stringify({ remoteHost: 'http://example.com' }));
            mockedValidatePreSettingsFormat.mockReturnValue({ success: true });
            const remoteConfig = { key: 'value' };
            (mockedFetchConfig as any).mockResolvedValueOnce(remoteConfig);
            mockedValidateConfigFormat.mockReturnValue({ success: true });

            await ConfigService.initFromLocalPreSettings();

            expect(mockedStore.updateConfig).toHaveBeenCalledWith(remoteConfig);
            expect(mockedApiSystem.setup).toHaveBeenCalled();
            expect(mockedLogger.info).toHaveBeenCalledWith(
                'Configuration loaded successfully from server during init',
            );
            expect(ConfigService.isConfigLoaded()).toBe(true);
        });
    });
});