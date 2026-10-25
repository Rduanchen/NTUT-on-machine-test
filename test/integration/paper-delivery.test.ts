import { fork, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ipcMain } from 'electron';
import { ramStore } from '../../src/main/services/ramStore.service';
import { configService } from '../../src/main/services/config.service';
import { registerAuthIpc } from '../../src/main/ipc/auth.ipc';
import { buildExamConfig } from '../../../host/backend/test/fixtures/exam-config.fixture';
vi.mock('systeminformation', () => ({
  baseboard: vi.fn().mockResolvedValue({ serial: 'paired-device' })
}));
vi.mock('../../src/main/services/logger.service', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), silly: vi.fn() },
  logServerEvent: vi.fn()
}));
vi.mock('../../src/main/services/environment-check.service', () => ({
  environmentCheckService: { applyMeta: vi.fn().mockResolvedValue(undefined) }
}));
vi.mock('../../src/main/services/connection.service', () => ({
  connectionService: { start: vi.fn() }
}));
vi.mock('../../src/main/services/message-sync.service', () => ({
  messageSyncService: { start: vi.fn() }
}));
vi.mock('../../src/main/services/judge-manager.service', () => ({
  judgeManager: { runJudge: vi.fn() }
}));
vi.mock('../../src/main/services/node-judger.service', () => ({
  getExtensionForLanguage: () => '.c'
}));
const require = createRequire(import.meta.url);
let child: ChildProcess | undefined;
afterEach(() => {
  child?.kill();
  child = undefined;
  ramStore.clear();
});

async function startHost(): Promise<number> {
  const env = {
    ...process.env,
    DB_STORAGE: ':memory:',
    NODE_ENV: 'test',
    ADMIN_TOKEN: 'paired-test-only',
    TS_NODE_FILES: 'true',
    TS_NODE_PROJECT: 'tsconfig.test.json'
  };
  delete env.LOAD_TEST_MODE;
  child = fork(
    resolve(__dirname, '../../../host/backend/test/helpers/paper-delivery-server.ts'),
    [],
    {
      cwd: resolve(__dirname, '../../../host/backend'),
      env,
      execArgv: ['-r', require.resolve('../../../host/backend/node_modules/ts-node/register')],
      stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    }
  );
  return new Promise((resolvePort, reject) => {
    child!.once('error', reject);
    child!.once('exit', (code) => reject(new Error(`Isolated host exited before ready: ${code}`)));
    child!.on('message', (message: unknown) => {
      if (
        message &&
        typeof message === 'object' &&
        'port' in message &&
        typeof message.port === 'number'
      )
        resolvePort(message.port);
    });
  });
}

describe('paired host → desktop paper delivery', () => {
  it('delivers without a student session, then logs in and opens the paper with the network gone', async () => {
    const port = await startHost();
    ramStore.clear();
    ramStore.backendUrl = `http://127.0.0.1:${port}`;
    ramStore.cryptoState = { aesKeyHex: 'ab'.repeat(32), userSessionID: '' };
    ramStore.hasEverRegistered = true;
    ramStore.examStatus = 'SETUP_FINISHED';
    expect((await configService.preparePaper()).success).toBe(true);
    expect(ramStore.examConfig).toBeNull();
    expect(ramStore.isStudentVerified).toBe(false);
    expect(ramStore.paperPreparation.status).toBe('READY');
    const stopped = new Promise<void>((r) => child!.once('exit', () => r()));
    child!.send('stop');
    await stopped;
    registerAuthIpc();
    // The host process is stopped, so the production login API must use its network-error fallback.
    const invoke = (
      ipcMain as unknown as {
        _invokeHandler: (
          channel: string,
          event: object,
          id: string
        ) => Promise<{ success: boolean }>;
      }
    )._invokeHandler;
    expect((await invoke('auth:login', {}, 'not-in-the-roster')).success).toBe(false);
    const expected = buildExamConfig();
    expect((await invoke('auth:login', {}, expected.accessibleUsers[0].id)).success).toBe(true);
    expect(ramStore.pendingLoginSync).toBe(true);
    expect((await configService.startWithPassword('wrong-password')).success).toBe(false);
    expect(ramStore.examStatus).toBe('SETUP_FINISHED');
    expect(
      (await configService.startWithPassword(expected.environmentVariables.startPassword)).success
    ).toBe(true);
    expect(ramStore.examStatus).toBe('IN_PROGRESS');
    expect(ramStore.examConfig?.sections?.[0].puzzles[0].title).toBe(
      expected.sections[0].puzzles[0].title
    );
  }, 30000);
});
