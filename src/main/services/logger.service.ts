import log, { LogMessage } from 'electron-log';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import type { LogActionPayload } from '../../common/types';

/**
 * Logger Service - Unified logging with server sync
 *
 * Levels:
 * - silly: Local debug only, NOT sent to server
 * - info: User actions, synced to server
 * - warn: Warnings, synced to server
 * - error: Errors, MUST sync to server (especially on app close)
 */

/** Queued log entries waiting to be sent to server */
let serverLogQueue: LogActionPayload[] = [];

/** External send function (set by connection/api service to avoid circular dep) */
let sendLogFunction: ((payload: LogActionPayload) => Promise<void>) | null = null;

/** Custom transport that queues logs for server sync */
const serverTransport = ((msg: LogMessage) => {
  const syncLevels = ['info', 'warn', 'error'];
  if (!syncLevels.includes(msg.level)) return;

  const payload: LogActionPayload = {
    action: 'log',
    studentID: '', // Will be filled by API service
    level: msg.level,
    timestamp: msg.date.toISOString(),
    message: msg.data.join(' '),
    // details: msg.data.length > 1 ? msg.data.slice(1) : undefined
    details: msg.data.join(' ')
  };

  if (sendLogFunction) {
    sendLogFunction(payload).catch(() => {
      serverLogQueue.push(payload);
    });
  } else {
    serverLogQueue.push(payload);
  }
}) as log.Transport;

serverTransport.level = 'info';
serverTransport.transforms = [];

/** The main logger instance */
const logger = log.create({ logId: 'AppLogger' });

// ─── Setup ──────────────────────────────────────────────────────────

const isDev = !app.isPackaged;
const logPath = isDev
  ? path.join(process.cwd(), 'main.log')
  : path.join(app.getPath('userData'), 'main.log');

function setupLogger(): void {
  logger.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
  logger.transports.file.resolvePathFn = () => logPath;
  logger.transports.file.level = 'silly';
  logger.transports.file.maxSize = 5 * 1024 * 1024;

  // Register server transport
  logger.transports.serverSync = serverTransport;

  console.info('[Logger] Setup complete. Log file at:', logPath);
}

function clearLogOnStartup(): void {
  try {
    logger.transports.file.resolvePathFn = () => logPath;
    fs.writeFileSync(logPath, '');
    logger.info('Application started, old log cleared.');
  } catch (error) {
    logger.error('Error clearing log file on startup:', error);
  }
}

// ─── Server Sync Control ────────────────────────────────────────────

/** Set the function used to send logs to the server (called by API service after init) */
function setLogSendFunction(fn: (payload: LogActionPayload) => Promise<void>): void {
  sendLogFunction = fn;
}

/** Get and clear all queued log entries */
function getAndClearLogQueue(): LogActionPayload[] {
  const queue = [...serverLogQueue];
  serverLogQueue = [];
  return queue;
}

/** Check if there are pending logs */
function hasQueuedLogs(): boolean {
  return serverLogQueue.length > 0;
}

/** Re-queue logs that failed to send */
function requeueLogs(logs: LogActionPayload[]): void {
  serverLogQueue.unshift(...logs);
}

// ─── Exports ────────────────────────────────────────────────────────

export {
  logger,
  setupLogger,
  clearLogOnStartup,
  setLogSendFunction,
  getAndClearLogQueue,
  hasQueuedLogs,
  requeueLogs
};
