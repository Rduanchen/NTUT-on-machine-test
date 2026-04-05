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
    isSetupComplete: () => ipcRenderer.invoke('config:setup-complete')
  },

  /** Authentication: student login and verification */
  auth: {
    login: (studentID: string) => ipcRenderer.invoke('auth:login', studentID),
    isVerified: () => ipcRenderer.invoke('auth:is-verified'),
    getStudentInfo: () => ipcRenderer.invoke('auth:get-student-info')
  },

  /** Store: read exam state (test results, puzzles, exam info) */
  store: {
    getConnectionStatus: () => ipcRenderer.invoke('store:get-connection-status'),
    getTestResults: () => ipcRenderer.invoke('store:get-test-results'),
    getSpecialRuleResults: () => ipcRenderer.invoke('store:get-special-rule-results'),
    getEffectiveSpecialRules: () => ipcRenderer.invoke('store:get-effective-special-rules'),
    getPuzzleInfo: () => ipcRenderer.invoke('store:get-puzzle-info'),
    getExamInfo: () => ipcRenderer.invoke('store:get-exam-info'),

    /** Subscribe to connection status changes from main process */
    onConnectionStatusChanged: (callback: (status: string) => void) => {
      ipcRenderer.on('connection:status-changed', (_event, status) => {
        callback(status);
      });
    },

    /** Subscribe to test results pushed from main process (e.g. after config_update rejudge) */
    onTestResultsUpdated: (callback: (results: Record<string, unknown>) => void) => {
      ipcRenderer.on('store:test-results-updated', (_event, results) => {
        callback(results);
      });
    },

    /** Subscribe to special-rule results pushed from main process (after each judge/submit) */
    onSpecialRuleResultsUpdated: (callback: (results: Record<string, unknown>) => void) => {
      ipcRenderer.on('store:special-rule-results-updated', (_event, results) => {
        callback(results);
      });
    },
  },

  /** Judger: run evaluations, stop, sync results */
  judger: {
    judge: (puzzleId: string, codeFilePath: string) =>
      ipcRenderer.invoke('judger:judge', puzzleId, codeFilePath),
    forceStop: () => ipcRenderer.invoke('judger:force-stop'),
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
      ipcRenderer.on('notifications:updated', (_event, payload) => callback(payload));
    },
    onSocketStatusChanged: (callback: (status: string) => void) => {
      ipcRenderer.on('notifications:socket-status', (_event, status) => callback(status));
    }
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
