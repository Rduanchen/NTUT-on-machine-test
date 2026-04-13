import { ramStore } from './ramStore.service';
import {
  logger,
  getAndClearLogQueue,
  hasQueuedLogs,
  requeueLogs,
  setLogSendFunction
} from './logger.service';
import { logAction, uploadTestResult, uploadProgramFile, fetchExamConfig } from './api.service';
import type { LogActionPayload, SocketConnectionStatus } from '../../common/types';
import { getMainWindow } from '../system/windowManager';

/**
 * Connection Service - Network monitoring + request queue management
 *
 * Responsibilities:
 * 1. Derive connection status from socket connection state
 * 2. Queue all logger requests during offline → flush on reconnect
 * 3. Track pending non-logger requests → retry all on reconnect
 * 4. Always attempt to send regardless of connection status
 * 5. Maintain isConnected state in RAM store
 */

class ConnectionService {
  private static instance: ConnectionService;

  /** Listener reference for cleanup */
  private socketStatusListener: ((status: SocketConnectionStatus) => void) | null = null;

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

    // Subscribe to socket status changes to derive connection status
    if (!this.socketStatusListener) {
      this.socketStatusListener = (status: SocketConnectionStatus) => {
        this.onSocketStatusChanged(status);
      };
      ramStore.on('socketStatus', this.socketStatusListener);
    }
  }

  /** Stop connection monitoring. Call on app quit. */
  public stop(): void {
    if (this.socketStatusListener) {
      ramStore.off('socketStatus', this.socketStatusListener);
      this.socketStatusListener = null;
    }
  }

  // ─── Socket Status → Connection Status ────────────────────────

  private onSocketStatusChanged(socketStatus: SocketConnectionStatus): void {
    const wasConnected = ramStore.isConnected;
    const isNowConnected = socketStatus === 'connected';

    if (isNowConnected) {
      ramStore.connectionStatus = 'connected';
      if (!wasConnected) {
        logger.info('[Connection] Server connection restored (socket connected)');
        this.onConnectionRestored();
      }
    } else {
      ramStore.connectionStatus = 'disconnected';
      if (wasConnected) {
        logger.warn(`[Connection] Server connection lost (socket: ${socketStatus})`);
      }
    }

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
