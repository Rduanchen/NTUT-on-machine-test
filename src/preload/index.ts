import { ipcRenderer, contextBridge } from 'electron';
// import { Config } from '../electron/lib/runTimeStore.ts';

const api = {
  // --- Config ---
  config: {
    setJson: (jsonFilePath: string) => ipcRenderer.invoke('config:set-json', jsonFilePath),
    getFromServer: (host: string) => ipcRenderer.invoke('config:get-from-server', host),
    getServerStatus: (hostname: string) => ipcRenderer.invoke('config:server-status', hostname),
    getIsConfigSetupComplete: () => ipcRenderer.invoke('config:setup-complete'),
  },

  // --- Store ---
  store: {
    readTestResult: () => ipcRenderer.invoke('store:read-test-result'),
    updateStudentInformation: (newInfo: { studentID: string }) =>
      ipcRenderer.invoke('store:update-student-information', newInfo),
    readStudentInformation: () => ipcRenderer.invoke('store:read-student-information'),
    getPuzzleInfo: () => ipcRenderer.invoke('store:get-puzzle-info'),
    getTestInfo: () => ipcRenderer.invoke('config:get-test-info'),
    isStudentInfoVerified: () => ipcRenderer.invoke('store:is-student-info-verified'),
    updateServerAvailability: (callback: (status: boolean) => void) => {
      ipcRenderer.removeAllListeners('store:availability-updated');
      ipcRenderer.on('store:availability-updated', (_event, status) => {
        callback(status);
      });
    }
  },

  // --- Judger ---
  judger: {
    /**
     * @param questionId The ID of the question to judge.
     * @param codeFile A File-like object that must have a `path` property (string) pointing to the code file.
     */
    judge: (questionId: string, codeFilePath: string) =>
      ipcRenderer.invoke('judger:judge', questionId, codeFilePath),
    forceStop: () => ipcRenderer.invoke('judger:force-stop'),
    onJudgeComplete: (callback) => {
      ipcRenderer.on('judger:judge-complete', (_event, data) => {
        callback(data);
      });
    }
  },

  // --- LocalProgram ---
  localProgram: {
    getZipFile: () => ipcRenderer.invoke('localProgram:getZipFile')
  }
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api);
  } catch (e) {
    console.error('Failed to expose api to main world:', e);
  }
} else {
  // @ts-ignore (define in dts)
  window.api = api;
}
