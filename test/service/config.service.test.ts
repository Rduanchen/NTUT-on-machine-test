import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { configService } from '../../src/main/services/config.service';
import { ramStore } from '../../src/main/services/ramStore.service';
import { logger } from '../../src/main/services/logger.service';
import { fetchSecureExamConfig, healthCheck } from '../../src/main/services/api.service';
import { connectionService } from '../../src/main/services/connection.service';
import { messageSyncService } from '../../src/main/services/message-sync.service';
import {
    examConfigSchema,
    examConfigPayloadSchema,
    mergeExamConfig
} from '../../src/main/schemas/examConfig.schema';
import { preSettingsSchema } from '../../src/main/schemas/presettings.schema';
import { ErrorCode } from '../../src/common/errorCodes';

vi.mock('fs');
vi.mock('path');
vi.mock('electron', () => ({
    app: {
        getAppPath: vi.fn().mockReturnValue('/mock/app/path'),
        isPackaged: false,
    },
}));
vi.mock('../../src/main/services/ramStore.service', () => ({
    ramStore: {
        isConfigured: false,
        backendUrl: '',
        examConfig: undefined,
        isOfflineMode: false,
        examStatus: '',
    },
}));
vi.mock('../../src/main/services/logger.service', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));
vi.mock('../../src/main/services/api.service', () => ({
    fetchSecureExamConfig: vi.fn(),
    healthCheck: vi.fn(),
}));
vi.mock('../../src/main/services/connection.service', () => ({
    connectionService: {
        start: vi.fn(),
    },
}));
vi.mock('../../src/main/services/message-sync.service', () => ({
    messageSyncService: {
        start: vi.fn(),
    },
}));
vi.mock('../../src/main/schemas/examConfig.schema', () => ({
    examConfigSchema: {
        safeParse: vi.fn(),
    },
    /* The paper now arrives split. This is the shape the delivery endpoint
     * returns; the questions inside `cipher` stay sealed until the exam. */
    examConfigPayloadSchema: {
        safeParse: vi.fn(),
    },
    examConfigMetaSchema: {
        parse: vi.fn((value: unknown) => value),
    },
    examConfigSecretSchema: {
        parse: vi.fn((value: unknown) => value),
    },
    mergeExamConfig: vi.fn(),
}));
vi.mock('../../src/main/schemas/presettings.schema', () => ({
    preSettingsSchema: {
        safeParse: vi.fn(),
    },
}));

describe('ConfigService', () => {
    let originalResourcesPath: string | undefined;

    beforeEach(() => {
        vi.clearAllMocks();
        originalResourcesPath = process.resourcesPath;
        process.resourcesPath = '/mock/resources/path';
        
        // Reset ramStore
        ramStore.isConfigured = false;
        ramStore.backendUrl = '';
        ramStore.examConfig = undefined as any;
        ramStore.isOfflineMode = false;
        ramStore.examStatus = '';
        
        // Default mocks
        (path.join as any).mockImplementation((...args: string[]) => args.join('/'));
    });

    afterEach(() => {
        if (originalResourcesPath !== undefined) {
            process.resourcesPath = originalResourcesPath;
        } else {
            delete (process as any).resourcesPath;
        }
    });

    describe('getInstance', () => {
        it('creates a new instance if none exists and returns the same instance subsequently', () => {
            const ConfigServiceClass = (configService as any).constructor;
            const originalInstance = ConfigServiceClass.instance;
            
            ConfigServiceClass.instance = undefined;
            const instance1 = ConfigServiceClass.getInstance();
            expect(instance1).toBeDefined();
            
            const instance2 = ConfigServiceClass.getInstance();
            expect(instance1).toBe(instance2);
            
            ConfigServiceClass.instance = originalInstance;
        });
    });

    describe('initFromPreSettings', () => {
        it('shows settings page if pre_settings.json does not exist (unpackaged)', async () => {
            app.isPackaged = false;
            (fs.existsSync as any).mockReturnValue(false);

            await configService.initFromPreSettings();

            expect(path.join).toHaveBeenCalledWith('/mock/app/path', 'resources', 'pre_settings.json');
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('No pre_settings.json found'));
            expect(ramStore.isConfigured).toBe(false);
        });

        it('shows settings page if pre_settings.json does not exist (packaged)', async () => {
            app.isPackaged = true;
            (fs.existsSync as any).mockReturnValue(false);

            await configService.initFromPreSettings();

            expect(path.join).toHaveBeenCalledWith('/mock/resources/path', 'pre_settings.json');
            expect(ramStore.isConfigured).toBe(false);
        });

        it('fails if pre_settings.json format is invalid', async () => {
            (fs.existsSync as any).mockReturnValue(true);
            (fs.readFileSync as any).mockReturnValue('{"invalid":"json"}');
            (preSettingsSchema.safeParse as any).mockReturnValue({ success: false, error: 'validation error' });

            await configService.initFromPreSettings();

            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('format is invalid'), 'validation error');
            expect(ramStore.isConfigured).toBe(false);
        });

        it('starts services if remoteHost exists', async () => {
            (fs.existsSync as any).mockReturnValue(true);
            (fs.readFileSync as any).mockReturnValue('{"remoteHost":"http://test.com"}');
            (preSettingsSchema.safeParse as any).mockReturnValue({ success: true, data: { remoteHost: 'http://test.com' } });

            await configService.initFromPreSettings();

            expect(ramStore.backendUrl).toBe('http://test.com');
            expect(connectionService.start).toHaveBeenCalled();
            expect(messageSyncService.start).toHaveBeenCalledWith('http://test.com');
        });

        /* Feature 007 bugfix BUG-02. `isConfigured` only turns true once a
         * paper has been fetched, and `/` is the startup route — so a machine
         * with a perfectly good pre_settings.json sat on a settings form asking
         * for the address it had already been given. The only thing that would
         * have moved it on is a connection-status event emitted from here,
         * before `createWindow()`, with no renderer listening. */
        it('marks the machine as deployed so it is never shown the settings form', async () => {
            (fs.existsSync as any).mockReturnValue(true);
            (fs.readFileSync as any).mockReturnValue('{"remoteHost":"http://test.com"}');
            (preSettingsSchema.safeParse as any).mockReturnValue({ success: true, data: { remoteHost: 'http://test.com' } });

            await configService.initFromPreSettings();

            expect(ramStore.isPreDeployed).toBe(true);
        });

        it('leaves a machine with no remoteHost free to use the settings form', async () => {
            ramStore.isPreDeployed = false;
            (fs.existsSync as any).mockReturnValue(true);
            (fs.readFileSync as any).mockReturnValue('{}');
            (preSettingsSchema.safeParse as any).mockReturnValue({ success: true, data: {} });

            await configService.initFromPreSettings();

            expect(ramStore.isPreDeployed).toBe(false);
        });

        it('does not start services if remoteHost is missing', async () => {
            (fs.existsSync as any).mockReturnValue(true);
            (fs.readFileSync as any).mockReturnValue('{}');
            (preSettingsSchema.safeParse as any).mockReturnValue({ success: true, data: {} });

            await configService.initFromPreSettings();

            expect(ramStore.isConfigured).toBe(false);
            expect(connectionService.start).not.toHaveBeenCalled();
            expect(messageSyncService.start).not.toHaveBeenCalled();
        });

        it('catches and logs errors when reading pre_settings.json throws', async () => {
            (fs.existsSync as any).mockReturnValue(true);
            const err = new Error('read error');
            (fs.readFileSync as any).mockImplementation(() => { throw err; });

            await configService.initFromPreSettings();

            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error reading pre_settings.json'), err);
            expect(ramStore.isConfigured).toBe(false);
        });
    });

    describe('setConfigFromFile', () => {
        it('rejects a file that is not an offline deployment bundle', async () => {
            /* The plaintext config this replaced was both a second parsing path
             * and a way for a student to hand themselves a paper. */
            (fs.readFileSync as any).mockReturnValue('{}');
            (examConfigPayloadSchema.safeParse as any).mockReturnValue({
                success: false,
                error: { issues: [{ path: ['someField'], message: 'is required' }] }
            });

            const res = await configService.setConfigFromFile('/path/config.json');

            expect(res.success).toBe(false);
            if (!res.success) {
                expect(res.error.code).toBe(ErrorCode.INVALID_CONFIG_FORMAT);
                expect(res.error.message).toContain('someField: is required');
            }
        });

        it('loads a bundle, stays offline, and leaves the questions sealed', async () => {
            (fs.readFileSync as any).mockReturnValue('{}');
            const bundle = {
                meta: { testTitle: 'Offline' },
                cipher: { iv: 'i', ciphertext: 'c', tag: 't' }
            };
            (examConfigPayloadSchema.safeParse as any).mockReturnValue({ success: true, data: bundle });

            const res = await configService.setConfigFromFile('/path/bundle.json');

            expect(res.success).toBe(true);
            expect(ramStore.examConfigMeta).toEqual(bundle.meta);
            expect(ramStore.examConfigCipher).toEqual(bundle.cipher);
            // The exam starts on the invigilator's spoken password, not on load.
            expect(ramStore.examConfig).toBeFalsy();
            expect(ramStore.isOfflineMode).toBe(true);
            expect(ramStore.examStatus).toBe('SETUP_FINISHED');
        });

        it('returns error if fs.readFileSync throws an Error', async () => {
            (fs.readFileSync as any).mockImplementation(() => { throw new Error('fs read error'); });

            const res = await configService.setConfigFromFile('/path/config.json');

            expect(res.success).toBe(false);
            if (!res.success) {
                expect(res.error.code).toBe(ErrorCode.INVALID_CONFIG_FORMAT);
                expect(res.error.message).toBe('fs read error');
            }
        });

        it('returns error if fs.readFileSync throws a non-Error', async () => {
            (fs.readFileSync as any).mockImplementation(() => { throw 'string error'; });

            const res = await configService.setConfigFromFile('/path/config.json');

            expect(res.success).toBe(false);
            if (!res.success) {
                expect(res.error.code).toBe(ErrorCode.INVALID_CONFIG_FORMAT);
                expect(res.error.message).toBe('string error');
            }
        });
    });

    describe('setConfigFromServer', () => {
        it('starts services and delegates to fetchAndSaveConfig', async () => {
            const spy = vi.spyOn(configService, 'fetchAndSaveConfig').mockResolvedValue({ success: true });

            const res = await configService.setConfigFromServer('http://server.com');

            expect(ramStore.backendUrl).toBe('http://server.com');
            expect(ramStore.isOfflineMode).toBe(false);
            expect(connectionService.start).toHaveBeenCalled();
            expect(messageSyncService.start).toHaveBeenCalledWith('http://server.com');
            expect(spy).toHaveBeenCalledWith('http://server.com');
            expect(res.success).toBe(true);
            
            spy.mockRestore();
        });
    });

    describe('checkServerStatus', () => {
        it('returns success if healthCheck returns true', async () => {
            (healthCheck as any).mockResolvedValue(true);

            const res = await configService.checkServerStatus('http://server.com');
            expect(res.success).toBe(true);
        });

        it('returns SERVER_STATUS_NOT_OK if healthCheck returns false', async () => {
            (healthCheck as any).mockResolvedValue(false);

            const res = await configService.checkServerStatus('http://server.com');
            expect(res.success).toBe(false);
            if (!res.success) {
                expect(res.error.code).toBe(ErrorCode.SERVER_STATUS_NOT_OK);
            }
        });

        it('returns SERVER_STATUS_NOT_OK if healthCheck throws', async () => {
            (healthCheck as any).mockRejectedValue(new Error('network error'));

            const res = await configService.checkServerStatus('http://server.com');
            expect(res.success).toBe(false);
            if (!res.success) {
                expect(res.error.code).toBe(ErrorCode.SERVER_STATUS_NOT_OK);
            }
        });
    });

    describe('isConfigLoaded', () => {
        it('returns ramStore.isConfigured', () => {
            ramStore.isConfigured = true;
            expect(configService.isConfigLoaded()).toBe(true);

            ramStore.isConfigured = false;
            expect(configService.isConfigLoaded()).toBe(false);
        });
    });

    describe('fetchAndSaveConfig', () => {
        it('returns NO_RESPONSE if fetchSecureExamConfig fails', async () => {
            (fetchSecureExamConfig as any).mockResolvedValue({ success: false });

            const res = await configService.fetchAndSaveConfig('http://server.com');

            expect(ramStore.isConfigured).toBe(false);
            expect(res.success).toBe(false);
            if (!res.success) {
                expect(res.error.code).toBe(ErrorCode.NO_RESPONSE);
            }
        });
        
        it('returns NO_RESPONSE if fetchSecureExamConfig succeeds but data is missing', async () => {
            (fetchSecureExamConfig as any).mockResolvedValue({ success: true, data: undefined });

            const res = await configService.fetchAndSaveConfig('http://server.com');

            expect(ramStore.isConfigured).toBe(false);
            expect(res.success).toBe(false);
        });

        it('returns INVALID_CONFIG_FORMAT if fetched config validation fails', async () => {
            (fetchSecureExamConfig as any).mockResolvedValue({ success: true, data: { foo: 'bar' } });
            (examConfigPayloadSchema.safeParse as any).mockReturnValue({
                success: false,
                error: { issues: [{ path: ['field'], message: 'invalid' }] }
            });

            const res = await configService.fetchAndSaveConfig('http://server.com');

            expect(ramStore.isConfigured).toBe(false);
            expect(res.success).toBe(false);
            if (!res.success) {
                expect(res.error.code).toBe(ErrorCode.INVALID_CONFIG_FORMAT);
                expect(res.error.message).toContain('field: invalid');
            }
        });

        it('stores both halves and leaves the questions sealed', async () => {
            /* The state a machine sits in for the whole of INITIALIZED and
             * SETUP_FINISHED: fully prepared, holding a paper it cannot read. */
            const payload = { meta: { testTitle: 'Sealed' }, cipher: { iv: 'i', ciphertext: 'c', tag: 't' } };
            (fetchSecureExamConfig as any).mockResolvedValue({ success: true, data: payload });
            (examConfigPayloadSchema.safeParse as any).mockReturnValue({ success: true, data: payload });

            const res = await configService.fetchAndSaveConfig('http://server.com');

            expect(ramStore.examConfigMeta).toEqual(payload.meta);
            expect(ramStore.examConfigCipher).toEqual(payload.cipher);
            // Nothing was assembled: without the key there is no paper to read.
            expect(ramStore.examConfig).toBeFalsy();
            expect(vi.mocked(mergeExamConfig)).not.toHaveBeenCalled();
            expect(ramStore.backendUrl).toBe('http://server.com');
            expect(res.success).toBe(true);
        });

        it('uses ramStore.backendUrl if host is not provided', async () => {
            ramStore.backendUrl = 'http://ramstore.com';
            const payload = { meta: { testTitle: 'Sealed' }, cipher: { iv: 'i', ciphertext: 'c', tag: 't' } };
            (fetchSecureExamConfig as any).mockResolvedValue({ success: true, data: payload });
            (examConfigPayloadSchema.safeParse as any).mockReturnValue({ success: true, data: payload });

            await configService.fetchAndSaveConfig();

            expect(ramStore.backendUrl).toBe('http://ramstore.com');
        });
    });
});