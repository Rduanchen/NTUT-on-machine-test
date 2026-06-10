import { ramStore } from './ramStore.service';
import {
  logger,
  getAndClearLogQueue,
  hasQueuedLogs,
  requeueLogs,
  setLogSendFunction,
  logServerEvent
} from './logger.service';
import { logAction, login } from './api.service';
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
  private pendingProgramFile = false;
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
        logServerEvent('USER_DISCONNECT', `Server connection lost (socket: ${socketStatus})`);
      }
    }

    this.notifyRenderer();
  }

  // ─── Connection Restored Handler ──────────────────────────────

  private async onConnectionRestored(): Promise<void> {
    if (this.isSyncing) return;
    if (ramStore.isOfflineMode) {
      logger.info('[Connection] Offline mode active. Ignoring connection restored sync.');
      return;
    }
    
    this.isSyncing = true;

    try {
      // 0. Retroactive Login Sync
      if (ramStore.pendingLoginSync && ramStore.studentInfo?.id) {
        logger.info(`[Connection] Attempting retroactive login sync for ${ramStore.studentInfo.id}`);
        try {
          const loginRes = await login({ testId: ramStore.studentInfo.id });
          if (loginRes.success && loginRes.data?.session_token) {
            if (ramStore.cryptoState) {
              ramStore.cryptoState.userSessionID = loginRes.data.session_token;
            }
            ramStore.pendingLoginSync = false;
            logger.info('[Connection] Retroactive login sync successful');
          } else {
            logger.warn(`[Connection] Retroactive login failed: ${loginRes.error?.message}`);
            // Do not reset pendingLoginSync, maybe it's a temporary backend error, or it's a violation.
            // If it's a violation, backend throws 403, but we updated it to log and return token?
            // Actually, if it's a violation, we changed backend to allow it and log violation!
            // So if it fails, it's a real network error.
          }
        } catch (err) {
          logger.error('[Connection] Retroactive login error', err);
        }
      }

      // 1. Flush queued logger requests
      await this.flushLogQueue();

      // 2. Retry pending test result upload
      if (this.pendingTestResult) {
        logger.info('[Connection] Retrying pending test result upload');
        // Re-trigger the sync via judgeManager would be ideal but to avoid circular deps,
        // just mark as cleared; the next judge run will re-sync.
        this.pendingTestResult = false;
        ramStore.markTestResultSynced();
      }

      // 3. Retry pending program file upload
      if (this.pendingProgramFile) {
        logger.info('[Connection] Retrying pending program file upload');
        this.pendingProgramFile = false;
      }

      // 4. Refresh config if pending
      if (this.pendingConfigRefresh && ramStore.backendUrl) {
        logger.info('[Connection] Refreshing config after reconnect');
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
    if (ramStore.isOfflineMode) return;
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

  public markPendingProgramFile(): void {
    this.pendingProgramFile = true;
  }

  public clearPendingProgramFile(): void {
    this.pendingProgramFile = false;
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
