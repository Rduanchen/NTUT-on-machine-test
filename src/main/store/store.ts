import { getMainWindow } from "../system/windowsManager";
import { actionLogger } from "../system/logger";
import { Config, StudentInformation } from "./types";
import os from "os";

function detectPrimaryMac(): string {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        const entries = nets[name] || [];
        for (const net of entries) {
            if (!net) continue;
            const mac = (net.mac || "").toLowerCase();
            if (
                mac &&
                mac !== "00:00:00:00:00:00" &&
                !net.internal &&
                net.family === "IPv4"
            ) {
                return mac;
            }
        }
    }
    return "";
}

class InMemoryStore {
    private static instance: InMemoryStore;

    private state = {
        config: null as Config | null,
        isStudentInfoVerified: false,
        testResult: {} as { [key: string]: any },
        studentInformation: { name: "", id: "" } as StudentInformation,
        isServerAvailable: false,
        isTestResultDirty: false,
        isResultHigherThanPrevious: true,
        macAddress: "" as string,
    };

    private constructor() {
        // Try to auto-detect MAC at startup (best-effort)
        const mac = detectPrimaryMac();
        if (mac) {
            this.state.macAddress = mac;
            actionLogger.info(`Detected MAC address: ${mac}`);
        } else {
            actionLogger.warn("Could not auto-detect MAC address.");
        }
    }

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

    // --- MAC Address ---
    /** Get the cached MAC address (lower-case). Throws if not set. */
    public getMacAddress(): string {
        if (!this.state.macAddress) {
            throw new Error("MAC address not set. Please call setMacAddress().");
        }
        return this.state.macAddress;
    }

    /** Manually set/override the MAC address (will be lower-cased). */
    public setMacAddress(mac: string): void {
        this.state.macAddress = (mac || "").toLowerCase();
    }

    /** Best-effort re-detect MAC from OS, store and return it. */
    public refreshMacAddress(): string {
        const mac = detectPrimaryMac();
        this.state.macAddress = mac;
        return mac;
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

        if (typeof contents.isLoading === "function" && contents.isLoading()) {
            contents.once("did-finish-load", () => {
                try {
                    contents.send("store:availability-updated", status);
                } catch (error) {
                    actionLogger.warn(
                        "Unable to notify renderer about server availability after load.",
                        error
                    );
                }
            });
            return true;
        }

        try {
            contents.send("store:availability-updated", status);
        } catch (error) {
            actionLogger.warn(
                "Unable to notify renderer about server availability.",
                error
            );
            return false;
        }
        return true;
    }
}

export const store = InMemoryStore.getInstance();