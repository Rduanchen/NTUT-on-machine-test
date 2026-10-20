import { environmentCheckService } from './environment-check.service';
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
import { submitCode, submitScore } from './api.service';

/** One puzzle's code, waiting to be sent. */
export interface PendingSubmission {
  puzzleId: string;
  language: string;
  codeContent: string;
  queuedAt: number;
}

/** The scoreboard, waiting to be sent. Only the latest matters. */
export interface PendingScore {
  payload: Record<string, unknown>;
  queuedAt: number;
}
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

  /**
   * Work that could not be sent, kept until it is.
   *
   * These were three booleans, and reconnecting cleared them without sending
   * anything — the comment said the next judge run would re-sync. If the
   * student never ran another judge, the work done while disconnected was
   * simply gone. An exam client that keeps working offline has to keep what it
   * produced offline.
   */
  private pendingSubmissions = new Map<string, PendingSubmission>();
  private pendingScore: PendingScore | null = null;
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
    void environmentCheckService.prepareOnline();
    void environmentCheckService.flushReport();

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

      // 2. Send the work produced while disconnected
      await this.flushPendingWork();

      // 3. Refresh config if pending
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

  /**
   * Keep a submission until it lands.
   *
   * Keyed by puzzle, so a student who edits and re-runs the same question
   * while offline leaves one entry rather than a growing pile. The last
   * version is the one they want sent.
   */
  public queueSubmission(entry: Omit<PendingSubmission, 'queuedAt'>): void {
    this.pendingSubmissions.set(entry.puzzleId, { ...entry, queuedAt: Date.now() });
    logger.info(`[Connection] Queued submission for ${entry.puzzleId} (${this.pendingSubmissions.size} waiting)`);
  }

  /** Keep the scoreboard until it lands. Only the latest is worth sending. */
  public queueScore(payload: Record<string, unknown>): void {
    this.pendingScore = { payload, queuedAt: Date.now() };
  }

  public clearQueuedScore(): void {
    this.pendingScore = null;
  }

  public clearQueuedSubmission(puzzleId: string): void {
    this.pendingSubmissions.delete(puzzleId);
  }

  /** For the UI and for tests: what is still waiting. */
  public getPendingCounts(): { submissions: number; score: boolean } {
    return { submissions: this.pendingSubmissions.size, score: this.pendingScore !== null };
  }

  public markPendingConfigRefresh(): void {
    this.pendingConfigRefresh = true;
  }

  /**
   * Drop everything still waiting to be sent.
   *
   * Called on a global reset, and only there. Keeping work queued across a
   * reset would post the previous exam's answers, scores and action log into
   * the next one the moment the socket came back — an exam the backend has
   * just created, with different students in the same seats. Losing work is
   * the point here: the exam it belonged to no longer exists.
   */
  public clearQueues(): void {
    const dropped = this.pendingSubmissions.size + (this.pendingScore ? 1 : 0);
    this.pendingSubmissions.clear();
    this.pendingScore = null;
    this.pendingConfigRefresh = false;
    getAndClearLogQueue();
    if (dropped > 0) {
      logger.info(`[Connection] Reset dropped ${dropped} queued item(s) from the wiped exam.`);
    }
  }

  /**
   * Send everything that has been waiting.
   *
   * Anything that fails goes back in the queue rather than being dropped. The
   * connection has just come back and may go again; losing work on the second
   * outage would be no better than losing it on the first.
   */
  private async flushPendingWork(): Promise<void> {
    for (const [puzzleId, entry] of [...this.pendingSubmissions]) {
      try {
        const res = await submitCode(entry.codeContent, entry.puzzleId, entry.language);
        if (res.success) {
          this.pendingSubmissions.delete(puzzleId);
        }
      } catch {
        /* Stays queued. */
      }
    }

    if (this.pendingScore) {
      try {
        const res = await submitScore(this.pendingScore.payload as any);
        if (res.success) {
          ramStore.markTestResultSynced();
          this.pendingScore = null;
        }
      } catch {
        /* Stays queued. */
      }
    }
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
