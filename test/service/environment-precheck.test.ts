import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EnvironmentCheckService } from '../../src/main/services/environment-check.service';
import { ramStore } from '../../src/main/services/ramStore.service';
import { getExamLanguages, reportEnvironmentCheck } from '../../src/main/services/api.service';
import type { EnvironmentLanguageResult, IpcResponse } from '../../src/common/types';
vi.mock('../../src/main/services/api.service', () => ({ getExamLanguages: vi.fn(), reportEnvironmentCheck: vi.fn() }));
const executor = { runLanguage: vi.fn(async (profile: { language: EnvironmentLanguageResult['language'] }): Promise<EnvironmentLanguageResult> => ({
  language: profile.language, status: 'passed', tools: [], checks: [], startedAt: null, completedAt: null
})) };
beforeEach(() => {
  vi.resetAllMocks();
  ramStore.clear();
  ramStore.backendUrl = 'http://exam';
  ramStore.cryptoState = { aesKeyHex: 'key', userSessionID: '', rsaPublicKey: '' };
  vi.mocked(getExamLanguages).mockResolvedValue({ success: true, data: { languages: ['C'] } });
  vi.mocked(reportEnvironmentCheck).mockResolvedValue({ success: true });
});
describe('online environment preparation', () => {
  it('fetches before login and retains its snapshot across retry and token updates', async () => {
    const service = new EnvironmentCheckService(executor);
    await service.prepareOnline();
    expect(ramStore.environmentCheckReport.status).toBe('PASSED');
    ramStore.cryptoState = { ...ramStore.cryptoState!, userSessionID: 'login' };
    await service.prepareOnline();
    await service.retry();
    expect(getExamLanguages).toHaveBeenCalledTimes(1);
    expect(executor.runLanguage).toHaveBeenCalledTimes(2);
    expect(ramStore.examConfig).toBeNull();
  });
  it('does not turn an unavailable list into an empty passing check', async () => {
    vi.mocked(getExamLanguages).mockResolvedValueOnce({ success: false, error: { code: 'network', message: 'offline' } });
    const service = new EnvironmentCheckService(executor);
    await service.prepareOnline();
    expect(ramStore.environmentCheckReport.status).toBe('FAILED');
    expect(executor.runLanguage).not.toHaveBeenCalled();
    await service.retry();
    expect(ramStore.environmentCheckReport.status).toBe('PASSED');
  });
  it('coalesces concurrent preparation and cancels a response arriving after reset', async () => {
    let resolve!: (value: IpcResponse<{ languages: ['C'] }>) => void;
    vi.mocked(getExamLanguages).mockReturnValue(new Promise(done => { resolve = done; }));
    const service = new EnvironmentCheckService(executor);
    const first = service.prepareOnline();
    const second = service.prepareOnline();
    expect(getExamLanguages).toHaveBeenCalledTimes(1);
    service.reset();
    ramStore.clearForReset();
    resolve({ success: true, data: { languages: ['C'] } });
    await Promise.all([first, second]);
    expect(executor.runLanguage).not.toHaveBeenCalled();
    expect(ramStore.environmentCheckReport.status).toBe('IDLE');
  });
  it('retains a failed delivery and resends the latest status with its stable sequence', async () => {
    vi.mocked(reportEnvironmentCheck).mockResolvedValue({ success: false });
    const service = new EnvironmentCheckService(executor);
    await service.prepareOnline();
    await service.flushReport();
    vi.mocked(reportEnvironmentCheck).mockResolvedValue({ success: true });
    await service.flushReport();
    expect(reportEnvironmentCheck).toHaveBeenLastCalledWith('PASSED', [], 2);
  });
  it('fetches the latest list only after a new registration', async () => {
    const service = new EnvironmentCheckService(executor);
    await service.prepareOnline();
    vi.mocked(getExamLanguages).mockResolvedValue({ success: true, data: { languages: ['Java'] } });
    await service.prepareOnline();
    expect(ramStore.environmentCheckReport.requiredLanguages).toEqual(['C']);
    ramStore.cryptoState = { aesKeyHex: 'new-key', userSessionID: '', rsaPublicKey: '' };
    await service.prepareOnline();
    expect(ramStore.environmentCheckReport.requiredLanguages).toEqual(['Java']);
  });
  it('reruns unchanged languages on a new registration instead of reusing PASSED', async () => {
    const service = new EnvironmentCheckService(executor);
    await service.prepareOnline();
    ramStore.cryptoState = { aesKeyHex: 'replacement', userSessionID: '', rsaPublicKey: '' };
    await service.prepareOnline();
    expect(executor.runLanguage).toHaveBeenCalledTimes(2);
    expect(getExamLanguages).toHaveBeenCalledTimes(2);
  });
  it('ignores a runner completing after reset', async () => {
    let finish!: (result: EnvironmentLanguageResult) => void;
    executor.runLanguage.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const service = new EnvironmentCheckService(executor);
    const running = service.prepareOnline();
    await vi.waitFor(() => expect(executor.runLanguage).toHaveBeenCalled());
    service.reset();
    finish({ language: 'C', status: 'passed', tools: [], checks: [], startedAt: null, completedAt: null });
    await running;
    expect(service.getReport().status).toBe('IDLE');
    expect(reportEnvironmentCheck).not.toHaveBeenCalledWith('PASSED', expect.anything(), expect.anything());
  });
  it('does not contact a server for offline-file checks', async () => {
    ramStore.isOfflineMode = true;
    await new EnvironmentCheckService(executor).prepareOnline();
    expect(getExamLanguages).not.toHaveBeenCalled();
  });
  it('accepts an empty list but rejects an unknown language without running tools', async () => {
    vi.mocked(getExamLanguages).mockResolvedValueOnce({ success: true, data: { languages: [] } });
    const service = new EnvironmentCheckService(executor);
    await service.prepareOnline();
    expect(service.getReport().status).toBe('PASSED');
    expect(executor.runLanguage).not.toHaveBeenCalled();
    service.reset();
    // Simulate an adapter delivering invalid data across a runtime boundary.
    vi.mocked(getExamLanguages).mockResolvedValueOnce(JSON.parse('{"success":true,"data":{"languages":["Rust"]}}'));
    await service.prepareOnline();
    expect(service.getReport().status).toBe('FAILED');
    expect(executor.runLanguage).not.toHaveBeenCalled();
  });
  it('drops queued reports from a reset while an earlier send is in flight', async () => {
    let acknowledge!: (value: IpcResponse<void>) => void;
    vi.mocked(reportEnvironmentCheck).mockReturnValueOnce(new Promise(resolve => { acknowledge = resolve; }));
    const service = new EnvironmentCheckService(executor);
    await service.prepareOnline();
    expect(reportEnvironmentCheck).toHaveBeenCalledTimes(1);
    service.reset();
    acknowledge({ success: true });
    await service.flushReport();
    await Promise.resolve();
    expect(reportEnvironmentCheck).toHaveBeenCalledTimes(1);
    expect(service.getReport().status).toBe('IDLE');
  });
  it('runs offline diagnostics without sending the report', async () => {
    ramStore.isOfflineMode = true;
    const service = new EnvironmentCheckService(executor);
    await service.applyLanguages(['C']);
    expect(service.getReport().status).toBe('PASSED');
    expect(executor.runLanguage).toHaveBeenCalledOnce();
    expect(getExamLanguages).not.toHaveBeenCalled();
    expect(reportEnvironmentCheck).not.toHaveBeenCalled();
  });

});
