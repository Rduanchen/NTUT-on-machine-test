import { io, Socket } from 'socket.io-client';
import { getMainWindow } from '../system/windowManager';
import { ramStore } from './ramStore.service';
import {
  getConfigVersion,
  getMessageVersion,
  getMessages,
  fetchSecureExamConfig
} from './api.service';
import { logger } from './logger.service';
import type { ServerMessage } from '../../common/types';
import { examConfigSchema } from '../schemas/examConfig.schema';
import { judgeManager } from './judge-manager.service';

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

  public start(host?: string): void {
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

  // ─── Socket Handling ──────────────────────────────────────────

  private initializeSocket(host: string): void {
    try {
      ramStore.socketStatus = 'connecting';
      this.notifySocketStatus();

      this.socket = io(host, {
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
      createdAt: data.createdAt ?? new Date().toISOString()
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
      const [configVersionResp, messageVersionResp] = await Promise.all([
        getConfigVersion(),
        getMessageVersion()
      ]);

      const remoteConfigVersion = configVersionResp.success ? (configVersionResp.data ?? 0) : 0;
      const remoteMessageVersion = messageVersionResp.success ? (messageVersionResp.data ?? 0) : 0;

      if (remoteConfigVersion > ramStore.configVersion) {
        await this.refreshConfigFromServer(remoteConfigVersion);
      }

      if (forceMessageFetch || remoteMessageVersion > ramStore.messageVersion) {
        await this.fetchAllMessages();
      }

      if (remoteMessageVersion > 0) {
        ramStore.messageVersion = remoteMessageVersion;
      }
    } finally {
      this.isSyncing = false;
    }
  }

  private async fetchAllMessages(): Promise<void> {
    const response = await getMessages();
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

      const validation = examConfigSchema.safeParse(response.data);
      if (!validation.success) {
        throw new Error('Secure config validation failed');
      }

      ramStore.examConfig = validation.data;
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
