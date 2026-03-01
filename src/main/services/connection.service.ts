import { ramStore } from './ramStore.service';
import {
  logger,
  getAndClearLogQueue,
  hasQueuedLogs,
  requeueLogs,
  setLogSendFunction
} from './logger.service';
import {
  healthCheck,
  logAction,
  uploadTestResult,
  uploadProgramFile,
  fetchExamConfig
} from './api.service';
import type { LogActionPayload } from '../../common/types';
import { getMainWindow } from '../system/windowManager';

/**
 * Connection Service - Network monitoring + request queue management
 *
 * Responsibilities:
 * 1. Periodically check connection status (every 15s)
 * 2. Queue all logger requests during offline → flush on reconnect
 * 3. Track pending non-logger requests → retry all on reconnect
 * 4. Always attempt to send regardless of connection status
 * 5. Maintain isConnected state in RAM store
 */

const RECHECK_INTERVAL_MS = 15000;

class ConnectionService {
  private static instance: ConnectionService;

  /** Interval timer for health checks */
  private healthCheckTimer: NodeJS.Timeout | null = null;

  /** Whether currently syncing queued actions */
  private isSyncing = false;

  /** Pending flags for non-logger actions (retry on reconnect) */
  private pendingTestResult = false;
  private pendingProgramFile: Buffer | null = null;
  private pendingConfigRefresh = false;

  private constructor() {}

  public static getInstance(): ConnectionService {
    if (!ConnectionService.instance) {
      ConnectionService.instance = new ConnectionService();
    }
    return ConnectionService.instance;
  }

  // ─── Lifecycle ────────────────────────────────────────────────

  /** Start connection monitoring. Call after backend URL is configured. */
  public start(): void {
    // Connect logger to API
    setLogSendFunction(async (payload: LogActionPayload) => {
      await logAction(payload);
    });

    // Start periodic health check
    this.startHealthCheck();

    // Do an immediate check
    this.checkConnection();
  }

  /** Stop connection monitoring. Call on app quit. */
  public stop(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  // ─── Health Check ─────────────────────────────────────────────

  private startHealthCheck(): void {
    if (this.healthCheckTimer) return;
    this.healthCheckTimer = setInterval(() => {
      this.checkConnection();
    }, RECHECK_INTERVAL_MS);
  }

  public async checkConnection(): Promise<void> {
    if (!ramStore.backendUrl) return;

    const wasConnected = ramStore.isConnected;
    const isAlive = await healthCheck();

    if (isAlive) {
      ramStore.connectionStatus = 'connected';
      if (!wasConnected) {
        logger.info('[Connection] Server connection restored');
        await this.onConnectionRestored();
      }
    } else {
      ramStore.connectionStatus = 'disconnected';
      if (wasConnected) {
        logger.warn('[Connection] Server connection lost');
      }
    }

    // Notify renderer of status change
    this.notifyRenderer();
  }

  // ─── Connection Restored Handler ──────────────────────────────

  private async onConnectionRestored(): Promise<void> {
    if (this.isSyncing) return;
    this.isSyncing = true;

    try {
      // 1. Flush queued logger requests
      await this.flushLogQueue();

      // 2. Retry pending test result upload
      if (this.pendingTestResult) {
        logger.info('[Connection] Retrying pending test result upload');
        const results = ramStore.testResults;
        const response = await uploadTestResult(results);
        if (response.success) {
          this.pendingTestResult = false;
          ramStore.markTestResultSynced();
        }
      }

      // 3. Retry pending program file upload
      if (this.pendingProgramFile) {
        logger.info('[Connection] Retrying pending program file upload');
        const studentId = ramStore.studentInfo.id;
        const response = await uploadProgramFile(this.pendingProgramFile, studentId);
        if (response.success) {
          this.pendingProgramFile = null;
        }
      }

      // 4. Refresh config if pending
      if (this.pendingConfigRefresh && ramStore.backendUrl) {
        logger.info('[Connection] Refreshing config after reconnect');
        const response = await fetchExamConfig();
        if (response.success && response.data) {
          ramStore.examConfig = response.data;
        }
        this.pendingConfigRefresh = false;
      }
    } catch (error) {
      logger.error('[Connection] Error during reconnect sync:', error);
    } finally {
      this.isSyncing = false;
    }
  }

  // ─── Log Queue Management ────────────────────────────────────

  private async flushLogQueue(): Promise<void> {
    if (!hasQueuedLogs()) return;

    const logs = getAndClearLogQueue();
    const failedLogs: LogActionPayload[] = [];

    for (const logPayload of logs) {
      try {
        const response = await logAction(logPayload);
        if (!response.success) {
          failedLogs.push(logPayload);
        }
      } catch {
        failedLogs.push(logPayload);
        break; // Stop trying if server is down again
      }
    }

    if (failedLogs.length > 0) {
      requeueLogs(failedLogs);
    }
  }

  // ─── Pending Request Management ───────────────────────────────

  public markPendingTestResult(): void {
    this.pendingTestResult = true;
  }

  public clearPendingTestResult(): void {
    this.pendingTestResult = false;
  }

  public markPendingProgramFile(buffer: Buffer): void {
    this.pendingProgramFile = buffer;
  }

  public clearPendingProgramFile(): void {
    this.pendingProgramFile = null;
  }

  public markPendingConfigRefresh(): void {
    this.pendingConfigRefresh = true;
  }

  // ─── Renderer Notification ────────────────────────────────────

  private notifyRenderer(): void {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return;

    const contents = win.webContents;
    if (!contents || contents.isDestroyed()) return;

    try {
      contents.send('connection:status-changed', ramStore.connectionStatus);
    } catch {
      // Renderer not ready yet
    }
  }
}

export const connectionService = ConnectionService.getInstance();
