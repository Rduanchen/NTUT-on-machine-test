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
    getPuzzleInfo: () => ipcRenderer.invoke('store:get-puzzle-info'),
    getExamInfo: () => ipcRenderer.invoke('store:get-exam-info'),

    /** Subscribe to connection status changes from main process */
    onConnectionStatusChanged: (callback: (status: string) => void) => {
      ipcRenderer.on('connection:status-changed', (_event, status) => {
        callback(status);
      });
    }
  },

  /** Judger: run evaluations, stop, sync results */
  judger: {
    judge: (puzzleId: string, codeFilePath: string) =>
      ipcRenderer.invoke('judger:judge', puzzleId, codeFilePath),
    forceStop: () => ipcRenderer.invoke('judger:force-stop'),
    syncResults: () => ipcRenderer.invoke('judger:sync-results'),
    getZip: () => ipcRenderer.invoke('judger:get-zip'),
    syncCode: () => ipcRenderer.invoke('judger:sync-code')
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
