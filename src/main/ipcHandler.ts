// import NewsSources from './news-sources';
import { ipcMain } from 'electron';
import { ConfigStore } from './local-store/runTimeStore';
import { CodeJudger } from './judge/index';
import { LocalProgramStore } from './localProgram';
import { ConfigSystem } from './config';
import { ApiSystem } from './api';

function setupAllIPC() {
  ConfigStore.setup();
  CodeJudger.setup();
  ConfigSystem.setup();
  LocalProgramStore.setup();
  ApiSystem.setup();
}

export function onAppQuit() {
  // 在應用程式退出時執行清理操作
  LocalProgramStore.clearTempDir();
  ApiSystem.onremove();
}
export default setupAllIPC;
