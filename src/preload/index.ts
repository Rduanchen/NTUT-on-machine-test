import { ipcRenderer, contextBridge } from 'electron';

/**
 * Preload API - Exposed to renderer via contextBridge
 *
 * Provides structured access to main process services via IPC.
 * Groups: config, auth, store, judger
 */
const api = {
  /** Config management: load from file or server */
  config: {
    setJson: (jsonFilePath: string) => ipcRenderer.invoke('config:set-json', jsonFilePath),
    getFromServer: (host: string) => ipcRenderer.invoke('config:get-from-server', host),
    getServerStatus: (hostname: string) => ipcRenderer.invoke('config:server-status', hostname),
    isSetupComplete: () => ipcRenderer.invoke('config:setup-complete'),
    hasBackendUrl: () => ipcRenderer.invoke('config:has-backend-url')
  },

  /** Authentication: student login and verification */
  auth: {
    register: () => ipcRenderer.invoke('auth:register'),
    login: (studentId?: string) => ipcRenderer.invoke('auth:login', studentId),
    isVerified: () => ipcRenderer.invoke('auth:is-verified'),
    getStudentInfo: () => ipcRenderer.invoke('auth:get-student-info'),
    onForceLogout: (callback: (message: string) => void) => {
      const listener = (_event: any, message: string) => callback(message);
      ipcRenderer.on('app:force-logout', listener);
      return () => {
        ipcRenderer.removeListener('app:force-logout', listener);
      };
    }
  },

  /** Store: read exam state (test results, puzzles, exam info) */
  store: {
    getConnectionStatus: () => ipcRenderer.invoke('store:get-connection-status'),
    getTestResults: () => ipcRenderer.invoke('store:get-test-results'),
    getHiddenTestResults: () => ipcRenderer.invoke('store:get-hidden-test-results'),
    getExamConfig: () => ipcRenderer.invoke('store:get-exam-config'),
    getSpecialRuleResults: () => ipcRenderer.invoke('store:get-special-rule-results'),
    getHighestTestResults: () => ipcRenderer.invoke('store:get-highest-test-results'),
    getHighestHiddenTestResults: () => ipcRenderer.invoke('store:get-highest-hidden-test-results'),
    getHighestSpecialRuleResults: () => ipcRenderer.invoke('store:get-highest-special-rule-results'),
    getUploadVersionPreference: () => ipcRenderer.invoke('store:get-upload-version-preference'),
    setUploadVersionPreference: (preference: string) => ipcRenderer.invoke('store:set-upload-version-preference', preference),
    getEffectiveSpecialRules: () => ipcRenderer.invoke('store:get-effective-special-rules'),
    getPuzzleInfo: () => ipcRenderer.invoke('store:get-puzzle-info'),
    getExamInfo: () => ipcRenderer.invoke('store:get-exam-info'),
    forceConfigRefresh: () => ipcRenderer.invoke('store:force-config-refresh'),

    /** Get current exam status (UNINITIALIZED | NOT_STARTED | IN_PROGRESS | FINISHED) */
    getExamStatus: () => ipcRenderer.invoke('store:get-exam-status'),

    /** Set exam status manually (e.g. for offline bypass) */
    setExamStatus: (status: string) => ipcRenderer.invoke('store:set-exam-status', status),

    /** Subscribe to connection status changes from main process */
    onConnectionStatusChanged: (callback: (status: string) => void) => {
      const listener = (_event: any, status: string) => callback(status);
      ipcRenderer.on('connection:status-changed', listener);
      return () => {
        ipcRenderer.removeListener('connection:status-changed', listener);
      };
    },

    /** Subscribe to exam status changes pushed from main process */
    onExamStatusChanged: (callback: (status: string) => void) => {
      const listener = (_event: any, status: string) => callback(status);
      ipcRenderer.on('exam:status-changed', listener);
      return () => {
        ipcRenderer.removeListener('exam:status-changed', listener);
      };
    },

    onConfigUpdated: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('store:config-updated', handler);
      return () => ipcRenderer.removeListener('store:config-updated', handler);
    },

    /** Subscribe to test results pushed from main process (e.g. after config_update rejudge) */
    onTestResultsUpdated: (callback: (results: Record<string, unknown>) => void) => {
      const listener = (_event: any, results: any) => callback(results);
      ipcRenderer.on('store:test-results-updated', listener);
      return () => {
        ipcRenderer.removeListener('store:test-results-updated', listener);
      };
    },

    /** Subscribe to special-rule results pushed from main process (after each judge/submit) */
    onSpecialRuleResultsUpdated: (callback: (results: Record<string, unknown>) => void) => {
      const listener = (_event: any, results: any) => callback(results);
      ipcRenderer.on('store:special-rule-results-updated', listener);
      return () => {
        ipcRenderer.removeListener('store:special-rule-results-updated', listener);
      };
    },
    
    /** Subscribe to highest test results pushed from main process */
    onHighestTestResultsUpdated: (callback: (results: Record<string, unknown>) => void) => {
      const listener = (_event: any, results: any) => callback(results);
      ipcRenderer.on('store:highest-test-results-updated', listener);
      return () => {
        ipcRenderer.removeListener('store:highest-test-results-updated', listener);
      };
    },

    /** Subscribe to highest special-rule results pushed from main process */
    onHighestSpecialRuleResultsUpdated: (callback: (results: Record<string, unknown>) => void) => {
      const listener = (_event: any, results: any) => callback(results);
      ipcRenderer.on('store:highest-special-rule-results-updated', listener);
      return () => {
        ipcRenderer.removeListener('store:highest-special-rule-results-updated', listener);
      };
    },
  },

  judger: {
    judge: (puzzleId: string, codeFilePath: string) =>
      ipcRenderer.invoke('judger:judge', puzzleId, codeFilePath),
    forceStop: () => ipcRenderer.invoke('judger:force-stop'),
    rejudgeAll: () => ipcRenderer.invoke('judger:rejudge-all'),
    syncResults: () => ipcRenderer.invoke('judger:sync-results'),
    getZip: () => ipcRenderer.invoke('judger:get-zip'),
    syncCode: () => ipcRenderer.invoke('judger:sync-code')
  },

  /** Notifications: socket feed + message center */
  notifications: {
    getAll: () => ipcRenderer.invoke('notifications:get-all'),
    getVersions: () => ipcRenderer.invoke('notifications:get-versions'),
    getSocketStatus: () => ipcRenderer.invoke('notifications:get-socket-status'),
    refresh: () => ipcRenderer.invoke('notifications:refresh'),
    onUpdated: (callback: (messages: unknown[]) => void) => {
      const listener = (_event: any, payload: any) => callback(payload);
      ipcRenderer.on('notifications:updated', listener);
      return () => {
        ipcRenderer.removeListener('notifications:updated', listener);
      };
    },
    onSocketStatusChanged: (callback: (status: string) => void) => {
      const listener = (_event: any, status: string) => callback(status);
      ipcRenderer.on('notifications:socket-status', listener);
      return () => {
        ipcRenderer.removeListener('notifications:socket-status', listener);
      };
    }
  },

  /** Logging: send specific server events */
  log: {
    serverEvent: (actionType: string, message: string, details?: any) =>
      ipcRenderer.invoke('log:server-event', actionType, message, details)
  },

  app: {
    quit: () => ipcRenderer.invoke('app:quit')
  }
};

/** Expose API to renderer */
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api);
  } catch (e) {
    console.error('Failed to expose api to main world:', e);
  }
} else {
  // @ts-ignore
  window.api = api;
}
