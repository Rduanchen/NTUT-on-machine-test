import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  logger,
  setupLogger,
  clearLogOnStartup,
  setLogSendFunction,
  getAndClearLogQueue,
  hasQueuedLogs,
  requeueLogs,
  logServerEvent
} from '../../src/main/services/logger.service';
import fs from 'fs';

vi.mock('fs', () => ({
  default: {
    writeFileSync: vi.fn(),
  }
}));

describe('LoggerService', () => {
  beforeEach(() => {
    /* The server transport is attached by setupLogger, which the app calls at
     * startup (main/index.ts). Without it logger.error reaches no transport,
     * so these tests were asserting on a logger that had nothing wired to it. */
    setupLogger();
    getAndClearLogQueue(); // Reset queue
    setLogSendFunction(null as any); // Remove external sender
    vi.clearAllMocks();
  });

  it('should clear log on startup', () => {
    clearLogOnStartup();
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it('should queue log if level is error and no send fn is attached', () => {
    expect(hasQueuedLogs()).toBe(false);
    logger.error('This is a test error message');
    
    expect(hasQueuedLogs()).toBe(true);
    const queue = getAndClearLogQueue();
    expect(queue.length).toBe(1);
    expect(queue[0].level).toBe('error');
    expect(queue[0].message).toBe('This is a test error message');
  });

  it('should not queue info or warn via standard logger (since serverTransport level is info but transforms filters to error)', () => {
    logger.info('This should not queue');
    logger.warn('This should not queue');
    expect(hasQueuedLogs()).toBe(false);
  });

  it('should send log if function is provided', async () => {
    const mockSend = vi.fn().mockResolvedValue(undefined);
    setLogSendFunction(mockSend);

    logger.error('Another error message');

    expect(mockSend).toHaveBeenCalled();
    expect(hasQueuedLogs()).toBe(false); // Because it successfully sent
  });

  it('should requeue log if send function rejects', async () => {
    const mockSend = vi.fn().mockRejectedValue(new Error('Network error'));
    setLogSendFunction(mockSend);

    logger.error('Failed error message');

    // Due to async nature of the rejected promise inside the transport, we might need to await tick
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockSend).toHaveBeenCalled();
    expect(hasQueuedLogs()).toBe(true);
  });

  it('should allow direct logging of server events', async () => {
    logServerEvent('TEST_ACTION', 'Direct test event');
    
    expect(hasQueuedLogs()).toBe(true);
    const queue = getAndClearLogQueue();
    expect(queue[0].action).toBe('TEST_ACTION');
    expect(queue[0].message).toBe('Direct test event');
    expect(queue[0].level).toBe('info');
  });

  it('should requeue multiple logs properly', () => {
    const logs: any[] = [{ action: 'act1' }, { action: 'act2' }];
    requeueLogs(logs);

    expect(hasQueuedLogs()).toBe(true);
    const queue = getAndClearLogQueue();
    expect(queue.length).toBe(2);
    expect(queue[0].action).toBe('act1');
    expect(queue[1].action).toBe('act2');
  });
});
