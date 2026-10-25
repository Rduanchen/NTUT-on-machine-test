import { resolve } from 'node:path';
import { environmentCheckService } from '../../src/main/services/environment-check.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from '../fixtures/exam-config-payload.fixture.json';
const bundle = fixture.full.payload;
import { ramStore } from '../../src/main/services/ramStore.service';
import { configService } from '../../src/main/services/config.service';
import { fetchSecureExamConfig } from '../../src/main/services/api.service';
vi.mock('../../src/main/services/api.service', () => ({
  fetchSecureExamConfig: vi.fn(),
  fetchExamKey: vi.fn(),
  healthCheck: vi.fn()
}));
vi.mock('../../src/main/services/environment-check.service', () => ({
  environmentCheckService: { applyMeta: vi.fn().mockResolvedValue(undefined) }
}));
vi.mock('../../src/main/services/message-sync.service', () => ({
  messageSyncService: { start: vi.fn() }
}));
vi.mock('../../src/main/services/connection.service', () => ({
  connectionService: { start: vi.fn() }
}));
vi.mock('../../src/main/services/logger.service', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

const credentials = { aesKeyHex: 'aa'.repeat(32), userSessionID: '' };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  ramStore.clear();
  ramStore.backendUrl = 'http://exam';
  ramStore.cryptoState = { ...credentials };
  ramStore.hasEverRegistered = true;
  ramStore.examStatus = 'SETUP_FINISHED';
  vi.mocked(fetchSecureExamConfig).mockResolvedValue({ success: true, data: bundle });
});

describe('paper preparation', () => {
  it('prepares before login without opening questions or changing identity', async () => {
    expect((await configService.preparePaper()).success).toBe(true);
    expect(ramStore.paperPreparation.status).toBe('READY');
    expect(ramStore.examConfig).toBeNull();
    expect(ramStore.examKey).toBeNull();
    expect(ramStore.isStudentVerified).toBe(false);
    expect(ramStore.examStatus).toBe('SETUP_FINISHED');
    await configService.preparePaper();
    expect(fetchSecureExamConfig).toHaveBeenCalledTimes(1);
  });
  it.each(['UNINITIALIZED', 'INITIALIZED', 'FINISHED'] as const)(
    'does not automatically prepare in %s',
    async (phase) => {
      ramStore.examStatus = phase;
      await configService.preparePaper();
      expect(fetchSecureExamConfig).not.toHaveBeenCalled();
    }
  );
  it('requires registration and does not change offline mode', async () => {
    ramStore.cryptoState = null;
    await configService.preparePaper();
    expect(fetchSecureExamConfig).not.toHaveBeenCalled();
    expect(ramStore.isOfflineMode).toBe(false);
  });
  it('preserves a usable paper on refresh failure and retries the dirty update', async () => {
    await configService.preparePaper();
    vi.mocked(fetchSecureExamConfig).mockResolvedValueOnce({ success: false });
    expect((await configService.preparePaper(true)).success).toBe(false);
    expect(ramStore.isConfigured).toBe(true);
    expect(ramStore.paperPreparation.hasUsablePaper).toBe(true);
    expect(ramStore.paperPreparation.status).toBe('ERROR');
    await configService.preparePaper();
    expect(fetchSecureExamConfig).toHaveBeenCalledTimes(3);
    expect(ramStore.paperPreparation.status).toBe('READY');
  });
  it('merges ordinary calls but schedules a refresh received during a download', async () => {
    const pending = deferred<Awaited<ReturnType<typeof fetchSecureExamConfig>>>();
    vi.mocked(fetchSecureExamConfig).mockReturnValueOnce(pending.promise);
    const first = configService.preparePaper();
    const duplicate = configService.preparePaper();
    const update = configService.preparePaper(true);
    expect(fetchSecureExamConfig).toHaveBeenCalledTimes(1);
    pending.resolve({ success: true, data: bundle });
    await Promise.all([first, duplicate, update]);
    expect(fetchSecureExamConfig).toHaveBeenCalledTimes(2);
  });
  it.each(['reset', 'backend', 'credentials'] as const)(
    'discards delayed results after %s',
    async (reason) => {
      const pending = deferred<Awaited<ReturnType<typeof fetchSecureExamConfig>>>();
      vi.mocked(fetchSecureExamConfig).mockReturnValueOnce(pending.promise);
      const first = configService.preparePaper();
      if (reason === 'reset') ramStore.clearForReset();
      if (reason === 'backend') {
        ramStore.backendUrl = 'http://other';
        ramStore.backendUrl = 'http://exam';
      }
      if (reason === 'credentials') ramStore.cryptoState = null;
      pending.resolve({ success: true, data: bundle });
      await first;
      expect(ramStore.examConfigMeta).toBeNull();
      expect(ramStore.paperPreparation.status).toBe('IDLE');
    }
  );
  it('keeps the generation on a student session update, increments revision on reset', () => {
    const generation = ramStore.paperGeneration;
    const revision = ramStore.paperPreparation.revision;
    ramStore.cryptoState = { ...credentials, userSessionID: 'student-session' };
    expect(ramStore.paperGeneration).toBe(generation);
    ramStore.clearForReset();
    expect(ramStore.paperGeneration).toBeGreaterThan(generation);
    expect(ramStore.paperPreparation.revision).toBeGreaterThan(revision);
  });
  it('does not let an old finally clear the new scope download', async () => {
    const old = deferred<Awaited<ReturnType<typeof fetchSecureExamConfig>>>();
    const fresh = deferred<Awaited<ReturnType<typeof fetchSecureExamConfig>>>();
    vi.mocked(fetchSecureExamConfig)
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(fresh.promise);
    const first = configService.preparePaper();
    ramStore.backendUrl = 'http://other';
    const second = configService.preparePaper();
    old.resolve({ success: false });
    await first;
    const duplicate = configService.preparePaper();
    expect(fetchSecureExamConfig).toHaveBeenCalledTimes(2);
    fresh.resolve({ success: true, data: bundle });
    await Promise.all([second, duplicate]);
    expect(ramStore.paperPreparation.status).toBe('READY');
  });
  it('does not replace an existing paper when a refresh has invalid structure', async () => {
    await configService.preparePaper();
    const paper = ramStore.examConfigCipher;
    vi.mocked(fetchSecureExamConfig).mockResolvedValueOnce({
      success: true,
      data: { invalid: 'sensitive-value' }
    });
    const result = await configService.preparePaper(true);
    expect(result.success).toBe(false);
    expect(ramStore.examConfigCipher).toBe(paper);
    expect(ramStore.paperPreparation.hasUsablePaper).toBe(true);
    expect(JSON.stringify(ramStore.paperPreparation)).not.toContain('sensitive-value');
  });
  it('marks offline imports ready independently of advisory environment failures', async () => {
    ramStore.hasEverRegistered = false;
    ramStore.cryptoState = null;
    vi.mocked(environmentCheckService.applyMeta).mockRejectedValueOnce(
      new Error('toolchain failure')
    );
    const result = await configService.setConfigFromFile(
      resolve(__dirname, '../fixtures/valid_config_file.json')
    );
    expect(result.success).toBe(true);
    expect(ramStore.isOfflineMode).toBe(true);
    expect(ramStore.examConfig).toBeNull();
    expect(ramStore.paperPreparation.status).toBe('READY');
    ramStore.clearForReset();
    expect(ramStore.examKey).toBeNull();
    expect(ramStore.examConfigCipher).toBeNull();
    expect(ramStore.paperPreparation.status).toBe('IDLE');
  });
});
