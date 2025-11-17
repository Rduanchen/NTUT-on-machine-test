// import { contextBridge } from 'electron';
// import { electronAPI } from '@electron-toolkit/preload';
// import { ipcRenderer } from 'electron';
// import newsAPI from './news';
// import settingsAPI from './settings';
// import questionsAPI from './questions';

// const testAPI = {
//   test: async () => {
//     return await ipcRenderer.invoke('test');
//   }
// };

// // Custom APIs for renderer
// const api = {
//   settings: settingsAPI,
//   questions: questionsAPI,
//   news: newsAPI,
//   test: testAPI
// };

// // Use `contextBridge` APIs to expose Electron APIs to
// // renderer only if context isolation is enabled, otherwise
// // just add to the DOM global.

// if (process.contextIsolated) {
//   try {
//     contextBridge.exposeInMainWorld('electron', electronAPI);
//     contextBridge.exposeInMainWorld('api', api);
//   } catch (error) {
//     console.error('Failed to expose APIs to main world:', error);
//   }
// } else {
//   // @ts-ignore (define in dts)
//   window.electron = electronAPI;
//   // @ts-ignore (define in dts)
//   window.api = api;
// }

import { ipcRenderer, contextBridge } from 'electron';
// import { puzzleData } from "./preload/puzzle.ts";

//

// import { contextBridge, ipcRenderer } from "electron";
import { Config } from '../electron/lib/runTimeStore.ts';

// 將主行程的功能暴露給渲染行程
// contextBridge.exposeInMainWorld("electronAPI", );

const api = {
  // --- Config ---
  config: {
    setJson: (jsonString: Config) => ipcRenderer.invoke('config:set-json', jsonString),
    getFromServer: (host: string) => ipcRenderer.invoke('config:get-from-server', host),
    getServerStatus: () => ipcRenderer.invoke('config:server-status')
  },

  // --- Store ---
  store: {
    readTestResult: () => ipcRenderer.invoke('store:read-test-result'),
    updateStudentInformation: (newInfo: { studentID: string }) =>
      ipcRenderer.invoke('store:update-student-information', newInfo),
    readStudentInformation: () => ipcRenderer.invoke('store:read-student-information'),
    getPuzzleInfo: () => ipcRenderer.invoke('store:get-puzzle-info')
  },

  // --- Judger ---
  judger: {
    /**
     * @param questionId The ID of the question to judge.
     * @param codeFile A File-like object that must have a `path` property (string) pointing to the code file.
     */
    judge: (questionId: string, codeFile: File) =>
      ipcRenderer.invoke('judger:judge', questionId, codeFile),
    forceStop: () => ipcRenderer.invoke('judger:force-stop')
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
