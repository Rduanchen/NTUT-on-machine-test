import { environmentCheckService } from './environment-check.service';
import { io, Socket } from 'socket.io-client';
import { getMainWindow } from '../system/windowManager';
import { ramStore } from './ramStore.service';
import { getMessages, getExamStatus, fetchSecureExamConfig, getDeviceUuid } from './api.service';
import { logger } from './logger.service';
import type { ServerMessage, ExamState } from '../../common/types';
import { examConfigPayloadSchema } from '../schemas/examConfig.schema';
import { configService } from './config.service';
import { judgeManager } from './judge-manager.service';
import { localProgramStore } from './localProgram.service';
import { connectionService } from './connection.service';

const POLL_INTERVAL_MS = 60_000;

class MessageSyncService {
  private static instance: MessageSyncService;
  private socket: Socket | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private currentHost: string | null = null;
  private isSyncing = false;
  private isConfigRefreshing = false;

  private constructor() {}

  public static getInstance(): MessageSyncService {
    if (!MessageSyncService.instance) {
      MessageSyncService.instance = new MessageSyncService();
    }
    return MessageSyncService.instance;
  }

  public async registerSocket(): Promise<void> {
    if (this.socket && this.socket.connected) {
      const deviceUuid = await getDeviceUuid();
      logger.info(`[MessageSync] Registering socket for device: ${deviceUuid}`);
      this.socket.emit('register', {
        device_uuid: deviceUuid,
        session_token: ramStore.isStudentVerified
          ? ramStore.cryptoState?.userSessionID
          : undefined
      });
    }
  }

  public start(host?: string): void {
    if (ramStore.isOfflineMode) {
      logger.info('[MessageSync] Offline mode active. Skipping socket and polling.');
      return;
    }

    const targetHost = (host ?? ramStore.backendUrl)?.replace(/\/$/, '');
    if (!targetHost) {
      logger.warn('[MessageSync] Cannot start without backend URL');
      return;
    }

    if (this.currentHost !== targetHost) {
      this.cleanupSocket();
      this.currentHost = targetHost;
    }

    if (!this.socket) {
      this.initializeSocket(targetHost);
    }

    if (!this.pollTimer) {
      this.startPolling();
    }

    this.syncVersionsAndMessages(true).catch((error) => {
      logger.error('[MessageSync] Initial sync failed:', error);
    });
  }

  public stop(): void {
    this.cleanupSocket();
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  public async manualRefresh(): Promise<void> {
    await this.syncVersionsAndMessages(true);
  }

  public async forceConfigRefresh(): Promise<void> {
    await this.refreshConfigFromServer();
  }

  // ─── Socket Handling ──────────────────────────────────────────

  private initializeSocket(host: string): void {
    try {
      ramStore.socketStatus = 'connecting';
      this.notifySocketStatus();

      const namespaceUrl = `${host.replace(/\/+$/, '')}/user`;
      this.socket = io(namespaceUrl, {
        transports: ['websocket'],
        path: '/socket.io',
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 2000,
        forceNew: true
      });

      this.socket.on('connect', () => {
        ramStore.socketStatus = 'connected';
        this.notifySocketStatus();
        this.socket?.emit('subscribe', 'exam-message');
        this.registerSocket();
      });

      this.socket.io.on('reconnect_attempt', () => {
        ramStore.socketStatus = 'reconnecting';
        this.notifySocketStatus();
      });

      this.socket.on('disconnect', () => {
        ramStore.socketStatus = 'disconnected';
        this.notifySocketStatus();
      });

      this.socket.on('connect_error', (error) => {
        logger.warn('[MessageSync] Socket connection error:', error.message);
        ramStore.socketStatus = 'disconnected';
        this.notifySocketStatus();
      });

      this.socket.on('exam-message', (payload: unknown) => {
        const message = this.normalizeSocketPayload(payload);
        if (!message) return;
        this.ingestMessage(message);
      });

      /* Its own event, not a status message. What this asks of the machine —
       * forget your identity, your key and your paper — is nothing like a
       * phase change, and handling it beside ordinary messages would put a
       * destructive operation one flag away from being triggered by accident. */
      this.socket.on('exam-reset', () => {
        this.handleExamReset();
      });
    } catch (error) {
      logger.error('[MessageSync] Failed to initialize socket:', error);
      ramStore.socketStatus = 'disconnected';
      this.notifySocketStatus();
    }
  }

  private cleanupSocket(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    ramStore.socketStatus = 'disconnected';
    this.notifySocketStatus();
  }

  private notifySocketStatus(): void {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return;
    win.webContents?.send('notifications:socket-status', ramStore.socketStatus);
  }

  private normalizeSocketPayload(payload: unknown): ServerMessage | null {
    if (!payload || typeof payload !== 'object') return null;
    const raw = payload as Record<string, any>;
    const data = raw.data ?? raw;

    if (typeof data.id !== 'number' || typeof data.type !== 'string') {
      return null;
    }

    return {
      id: data.id,
      type: data.type,
      message: data.message ?? '',
      createdAt: data.createdAt ?? new Date().toISOString(),
      namespace: data.namespace
    };
  }

  // ─── Polling ─────────────────────────────────────────────────

  private startPolling(): void {
    this.pollTimer = setInterval(() => {
      this.syncVersionsAndMessages(false).catch((error) => {
        // logger.warn('[MessageSync] Periodic sync failed:', error);
        console.warn(
          '[MessageSync] Periodic sync failed:',
          error instanceof Error ? error.message : String(error)
        );
      });
    }, POLL_INTERVAL_MS);
  }

  private async syncVersionsAndMessages(forceMessageFetch: boolean): Promise<void> {
    if (this.isSyncing) return;
    if (!ramStore.backendUrl) return;

    this.isSyncing = true;
    try {
      if (forceMessageFetch) {
        await this.fetchAllMessages();
      }

      // Also fetch exam status to ensure we don't miss state changes if socket disconnects
      const statusRes = await getExamStatus();
      if (statusRes.success && statusRes.data?.status) {
        const newStatus = statusRes.data.status as ExamState;
        if (ramStore.examStatus !== newStatus) {
          ramStore.examStatus = newStatus;
          void this.onPhaseChanged(newStatus);
          const win = getMainWindow();
          if (win && !win.isDestroyed()) {
            win.webContents?.send('exam:status-changed', newStatus);
          }
        }
      }
    } finally {
      this.isSyncing = false;
    }
  }

  private async fetchAllMessages(): Promise<void> {
    const afterId = ramStore.messageVersion > 0 ? String(ramStore.messageVersion) : undefined;
    const response = await getMessages(afterId);
    if (!response.success || !response.data) return;
    const sorted = [...response.data].sort((a, b) => a.id - b.id);
    ramStore.notifications = sorted;
    if (sorted.length > 0) {
      ramStore.messageVersion = Math.max(ramStore.messageVersion, sorted[sorted.length - 1].id);
    }
    this.notifyNotificationsUpdated();
  }

  private notifyNotificationsUpdated(): void {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return;
    win.webContents?.send('notifications:updated', ramStore.notifications);
  }

  private ingestMessage(message: ServerMessage): void {
    const existing = ramStore.notifications;
    const index = existing.findIndex((item) => item.id === message.id);
    const updated = [...existing];
    if (index >= 0) {
      updated[index] = message;
    } else {
      updated.push(message);
    }
    updated.sort((a, b) => a.id - b.id);
    ramStore.notifications = updated;
    ramStore.messageVersion = Math.max(ramStore.messageVersion, message.id);
    this.notifyNotificationsUpdated();

    if (message.namespace === 'STATUS') {
      const newState = message.message as ExamState;
      ramStore.examStatus = newState;
      void this.onPhaseChanged(newState);
      const win = getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents?.send('exam:status-changed', newState);
      }
      return;
    }

    if (message.type === 'force_logout') {
      // Reset auth state so desktop doesn't think it's still logged in
      ramStore.isStudentVerified = false;
      ramStore.studentInfo = { id: '', name: '' };
      ramStore.cryptoState = null;

      const win = getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents?.send('app:force-logout', message.message);
      }
      return;
    }

    if (message.type === 'config_update') {
      this.refreshConfigFromServer()
        .then(() => {
          logger.info('[MessageSync] Config refreshed after socket notification.');
        })
        .catch((error) => {
          logger.error('[MessageSync] Failed to refresh config after notification:', error);
        });
    }
  }

  /**
   * The exam has started: fetch the key and open the paper.
   *
   * The broadcast says only that the exam began — it reaches every listener
   * without establishing who any of them are, so it is not a channel a key can
   * travel on. The key comes back over the same authenticated point-to-point
   * request everything else uses.
   *
   * A machine that is already holding the key does nothing: the request is
   * idempotent, but there is no reason to make it twice.
   */
  private async onPhaseChanged(phase: ExamState): Promise<void> {
    if (phase !== 'IN_PROGRESS') return;
    if (ramStore.examKey) return;

    try {
      /* The same idempotent action the login path and the paper-refresh path
       * use. Keeping the fetch here alone made it reachable only on a
       * transition into IN_PROGRESS — which a machine re-entering mid-exam
       * never observes, because the phase was already IN_PROGRESS when it
       * arrived. */
      const opened = await configService.ensureExamPaperReadable();
      if (!opened.success) {
        logger.warn(
          `[MessageSync] Exam started but the paper could not be opened yet: ${opened.error?.message}`
        );
        return;
      }
      await judgeManager.rejudgeAllStoredPrograms();
    } catch (error) {
      logger.error('[MessageSync] Failed to open the exam paper:', error);
    }
  }

  /**
   * The exam has been wiped. Forget everything it left here.
   *
   * The backend has already deleted this machine's registration and key, so
   * keeping them would mean every request afterwards is refused with no path
   * back. Before this, only the phase was updated and the machine went on
   * believing it was logged in — which is what made reset unusable.
   *
   * The socket stays up: the same machine can be used for the next exam
   * without a restart.
   */
  private handleExamReset(): void {
    logger.info('[MessageSync] Exam reset received; clearing local state.');

    localProgramStore.reset();
    connectionService.clearQueues();
    environmentCheckService.reset();
    ramStore.clearForReset();

    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents?.send('exam:status-changed', 'UNINITIALIZED');
    }
  }

  private async refreshConfigFromServer(targetVersion?: number): Promise<void> {
    if (this.isConfigRefreshing) return;
    if (!ramStore.cryptoState) {
      logger.warn('[MessageSync] Crypto state missing, skip secure config refresh.');
      return;
    }
    this.isConfigRefreshing = true;
    try {
      const response = await fetchSecureExamConfig();
      if (!response.success || !response.data) {
        throw new Error('Unable to fetch secure exam config');
      }

      const validation = examConfigPayloadSchema.safeParse(response.data);
      if (!validation.success) {
        throw new Error('Secure config validation failed');
      }

      await configService.applyPaper(validation.data.meta, validation.data.cipher);
      logger.info('[MessageSync] Exam config updated from secure endpoint.');

      if (typeof targetVersion === 'number') {
        ramStore.configVersion = targetVersion;
      }
      await judgeManager.rejudgeAllStoredPrograms();
    } finally {
      this.isConfigRefreshing = false;
    }
  }
}

export const messageSyncService = MessageSyncService.getInstance();
