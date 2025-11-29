import { getMainWindow } from "../system/windowsManager";
import { actionLogger } from '../system/logger';
import { Config, StudentInformation } from "./types";

class InMemoryStore {
    private static instance: InMemoryStore;

    private state = {
        config: null as Config | null,
        isStudentInfoVerified: false,
        testResult: {} as { [key: string]: any },
        studentInformation: { name: '', id: '' } as StudentInformation,
        isServerAvailable: false,
        isTestResultDirty: false,
        isResultHigherThanPrevious: true,
    };

    private pendingAvailability: boolean | null = null;

    private constructor() { }

    public static getInstance(): InMemoryStore {
        if (!InMemoryStore.instance) {
            InMemoryStore.instance = new InMemoryStore();
        }
        return InMemoryStore.instance;
    }

    // --- Config ---
    public hasConfig(): boolean {
        return this.state.config !== null;
    }

    public getConfig(): Config {
        if (!this.state.config) {
            throw new Error("Config has not been initialized yet.");
        }
        return this.state.config;
    }

    public updateConfig(newConfig: Config): void {
        this.state.config = newConfig;
    }

    // --- Test Result ---
    public getTestResult() {
        return this.state.testResult;
    }

    public appendTestResult(index: string, newResult: any): void {
        this.state.testResult[index] = newResult;
        this.state.isTestResultDirty = true;
    }

    public isTestResultDirty(): boolean {
        return this.state.isTestResultDirty;
    }

    public markTestResultSynced(): void {
        this.state.isTestResultDirty = false;
    }

    // --- Student Information ---
    public getStudentInformation(): StudentInformation {
        return this.state.studentInformation;
    }

    public updateStudentInformation(newInfo: StudentInformation): void {
        this.state.studentInformation = newInfo;
    }

    public isStudentVerified(): boolean {
        return this.state.isStudentInfoVerified;
    }

    public setStudentVerified(status: boolean): void {
        this.state.isStudentInfoVerified = status;
    }

    // --- Server Availability ---
    public getServerAvailability(): boolean {
        return this.state.isServerAvailable;
    }

    public updateServerAvailability(status: boolean): void {
        this.state.isServerAvailable = status;
        this.notifyRendererAvailability(status);
    }


    // --- Result Comparison ---
    public getIsResultHigherThanPrevious(): boolean {
        return this.state.isResultHigherThanPrevious;
    }

    public updateResultHigherThanPrevious(status: boolean): void {
        this.state.isResultHigherThanPrevious = status;
    }

    // Helper method to handle side effects (UI Notification)
    private notifyRendererAvailability(status: boolean): boolean {
        const win = getMainWindow();
        if (!win || win.isDestroyed()) {
            return false;
        }

        const contents = win.webContents;
        if (!contents || contents.isDestroyed()) {
            return false;
        }

        if (typeof contents.isLoading === 'function' && contents.isLoading()) {
            contents.once('did-finish-load', () => {
                try {
                    contents.send('store:availability-updated', status);
                } catch (error) {
                    actionLogger.warn('Unable to notify renderer about server availability after load.', error);
                }
            });
            return true;
        }

        try {
            contents.send('store:availability-updated', status);
        } catch (error) {
            actionLogger.warn('Unable to notify renderer about server availability.', error);
            return false;
        }
        return true;
    }
}

export const store = InMemoryStore.getInstance();