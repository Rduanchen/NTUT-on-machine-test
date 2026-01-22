import fs from 'fs';
import path from 'path';
import { app, dialog } from 'electron';
import { store } from '../store/store';
import { ApiSystem, fetchConfig, getServerStatus } from '../api';
import { actionLogger } from '../system/logger';
import { IpcResponse } from '../../common/ipcStandarFormat';
import { ErrorCode } from '../../common/errorCode';
import { validatePreSettingsFormat } from '../utilities/presettingsFormatChecker';
import { validateConfigFormat } from '../utilities/configFormatChecker';

let isConfigLoaded = false;

export const ConfigService = {
    isConfigLoaded: () => isConfigLoaded,

    async setConfigFromFile(jsonFilePath: string): Promise<IpcResponse<void>> {
        const file = fs.readFileSync(jsonFilePath, 'utf-8');
        const json = JSON.parse(file);
        const validationResult = validateConfigFormat(json);
        if (!validationResult.success) {
            return {
                success: false,
                error: {
                    code: ErrorCode.INVALID_CONFIG_FORMAT,
                    message: 'Invalid configuration format: ' + validationResult.error
                }
            } as IpcResponse<void>;
        }

        actionLogger.info('Manual upload the configuration file');
        store.updateConfig(json);
        isConfigLoaded = true;
        return {
            success: true
        } as IpcResponse<void>;
    },

    async setConfigFromServer(host: string): Promise<IpcResponse<void>> {
        const response = await fetchConfig(host);
        const validationResult = validateConfigFormat(response);
        if (!validationResult.success) {
            isConfigLoaded = false;
            return {
                success: false,
                error: {
                    code: ErrorCode.INVALID_CONFIG_FORMAT,
                    message: 'Invalid configuration format from server: ' + validationResult.error
                }
            } as IpcResponse<void>;
        }
        console.log(response);
        if (!response) {
            isConfigLoaded = false;
            return {
                success: false,
                error: {
                    code: ErrorCode.NO_RESPONSE,
                    message: 'No response from server'
                }
            } as IpcResponse<void>;
        };
        store.updateConfig(response);
        ApiSystem.setup();
        isConfigLoaded = true;
        return {
            success: true
        } as IpcResponse<void>;
    },

    async checkServerStatus(hostname: string): Promise<IpcResponse<void>> {
        const response = await getServerStatus(hostname);
        if (response?.success !== true) {
            return {
                success: false,
                error: {
                    code: ErrorCode.SERVER_STATUS_NOT_OK,
                    message: 'Server status not ok'
                }
            } as IpcResponse<void>;
        }
        return { success: true, data: response } as IpcResponse<void>;
    },

    async initFromLocalPreSettings() {

        const reportFailure = (message: string) => {
            actionLogger.error(message);
            isConfigLoaded = false;
            dialog.showErrorBox('Config from Local Pre-settings error:', message);
            return null;
        };

        const configLocation = path.join(app.getAppPath(), 'resources', 'pre_settings.json');
        if (!fs.existsSync(configLocation)) {
            return reportFailure('No local config file found when starting up');
        }

        const jsonFile = fs.readFileSync(configLocation, 'utf-8');
        const json = JSON.parse(jsonFile);

        const validationResult = validatePreSettingsFormat(json);
        if (!validationResult.success) {
            return reportFailure('Local pre_settings.json format is invalid: ' + validationResult.error);
        }


        const host = json.remoteHost as string | undefined;
        const configResponse = await fetchConfig(host ?? '');
        if (!configResponse) {
            return reportFailure('Failed to fetch config from server during init');
        }
        console.log(configResponse);
        const configValidationResult = validateConfigFormat(configResponse);
        if (!configValidationResult.success) {
            return reportFailure('Invalid config format fetched from server during init: ' + configValidationResult.error);
        }

        store.updateConfig(configResponse);
        ApiSystem.setup();
        isConfigLoaded = true;
        actionLogger.info('Configuration loaded successfully from server during init');
        return
    },
} as const;