import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ramStore } from '../../src/main/services/ramStore.service';
import * as os from 'os';

describe('RamStoreService', () => {
  beforeEach(() => {
    ramStore.clear();
  });

  it('should get and set primitive values correctly', () => {
    expect(ramStore.isConfigured).toBe(false);

    ramStore.set('isConfigured', true);
    expect(ramStore.isConfigured).toBe(true);
    expect(ramStore.get('isConfigured')).toBe(true);

    ramStore.isConfigured = false;
    expect(ramStore.isConfigured).toBe(false);
  });

  it('should emit events on set', () => {
    const mockListener = vi.fn();
    ramStore.on('backendUrl', mockListener);

    ramStore.backendUrl = 'http://test.com';
    expect(mockListener).toHaveBeenCalledWith('http://test.com');

    ramStore.off('backendUrl', mockListener);
    ramStore.backendUrl = 'http://test2.com';
    expect(mockListener).toHaveBeenCalledTimes(1); // Should not have been called again
  });

  it('should handle complex state objects', () => {
    const mockExamConfig: any = { examId: '123' };

    ramStore.examConfig = mockExamConfig;
    expect(ramStore.examConfig).toBe(mockExamConfig);
    expect(ramStore.isConfigured).toBe(true); // Should side-effect isConfigured
  });

  it('should expose, emit, and reset the environment report in RAM', () => {
    expect(ramStore.environmentCheckReport.status).toBe('IDLE');
    const listener = vi.fn();
    ramStore.on('environmentCheckReport', listener);
    const report = {
      ...ramStore.environmentCheckReport,
      status: 'RUNNING' as const,
      configFingerprint: 'C',
      requiredLanguages: ['C' as const],
      startedAt: new Date().toISOString(),
      message: 'running'
    };
    ramStore.environmentCheckReport = report;
    expect(listener).toHaveBeenCalledWith(report);
    ramStore.clear();
    expect(ramStore.environmentCheckReport.status).toBe('IDLE');
    ramStore.off('environmentCheckReport', listener);
  });

  it('should clear all state', () => {
    ramStore.backendUrl = 'http://test.com';
    ramStore.examStatus = 'ONGOING';

    ramStore.clear();

    expect(ramStore.backendUrl).toBe('');
    expect(ramStore.examStatus).toBe('UNINITIALIZED');
  });

  it('should delete a property correctly', () => {
    ramStore.backendUrl = 'http://test.com';
    ramStore.delete('backendUrl');
    expect(ramStore.backendUrl).toBeNull(); // Underlying it sets to null
  });

  it('should retrieve local IP address', () => {
    const ip = ramStore.getLocalIpAddress();
    // It should either be a standard IPv4 address format or 127.0.0.1
    expect(ip).toMatch(/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/);
  });

  it('should handle test result updates properly', () => {
    const mockResult: any = { stdout: 'hello' };
    expect(ramStore.isTestResultDirty).toBe(false);

    ramStore.setTestResult('puzzle1', mockResult);
    expect(ramStore.testResults['puzzle1']).toBe(mockResult);
    expect(ramStore.isTestResultDirty).toBe(true);

    ramStore.markTestResultSynced();
    expect(ramStore.isTestResultDirty).toBe(false);

    ramStore.setHighestTestResult('puzzle2', mockResult);
    expect(ramStore.highestTestResults['puzzle2']).toBe(mockResult);

    ramStore.setHiddenTestResult('puzzle1', mockResult);
    expect(ramStore.hiddenTestResults['puzzle1']).toBe(mockResult);

    ramStore.setHighestHiddenTestResult('puzzle1', mockResult);
    expect(ramStore.highestHiddenTestResults['puzzle1']).toBe(mockResult);
  });

  it('should handle special rules results properly', () => {
    const mockRuleResult: any = [{ ruleName: 'Forbidden Code' }];

    ramStore.setSpecialRuleResults('puzzle3', mockRuleResult);
    expect(ramStore.specialRuleResults['puzzle3']).toBe(mockRuleResult);

    ramStore.setHighestSpecialRuleResults('puzzle3', mockRuleResult);
    expect(ramStore.highestSpecialRuleResults['puzzle3']).toBe(mockRuleResult);
  });

  it('should handle other getters/setters properly', () => {
    ramStore.socketStatus = 'connected';
    expect(ramStore.socketStatus).toBe('connected');

    ramStore.pendingLoginSync = true;
    expect(ramStore.pendingLoginSync).toBe(true);

    ramStore.isOfflineMode = true;
    expect(ramStore.isOfflineMode).toBe(true);

    ramStore.uploadVersionPreference = 'latest';
    expect(ramStore.uploadVersionPreference).toBe('latest');

    const msg: any = [{ messageId: 'm1' }];
    ramStore.notifications = msg;
    expect(ramStore.notifications).toBe(msg);

    ramStore.messageVersion = 5;
    expect(ramStore.messageVersion).toBe(5);

    ramStore.configVersion = 3;
    expect(ramStore.configVersion).toBe(3);

    const studentInfo = { id: 's1', name: 'John' };
    ramStore.studentInfo = studentInfo;
    expect(ramStore.studentInfo).toBe(studentInfo);

    ramStore.isStudentVerified = true;
    expect(ramStore.isStudentVerified).toBe(true);

    ramStore.connectionStatus = 'connected';
    expect(ramStore.connectionStatus).toBe('connected');
    expect(ramStore.isConnected).toBe(true);
  });

  it('should not throw if listener throws error', () => {
    const throwingListener = vi.fn(() => {
      throw new Error('Listener error');
    });
    ramStore.on('backendUrl', throwingListener);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Should not throw Error upwards
    expect(() => {
      ramStore.backendUrl = 'http://error.com';
    }).not.toThrow();

    expect(throwingListener).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
