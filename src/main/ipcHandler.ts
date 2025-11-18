// import NewsSources from './news-sources';
import { ipcMain } from 'electron';
import { ConfigStore } from './runTimeStore';
import { CodeJudger } from './judge/index';
import { LocalProgramStore } from './localProgram';
import { ConfigSystem } from './config';

function setupAllIPC() {
  ConfigStore.setup();
  CodeJudger.setup();
  ConfigSystem.setup();
  LocalProgramStore.setup();
}

export function onAppQuit() {
  // 在應用程式退出時執行清理操作
  LocalProgramStore.clearTempDir();
}
export default setupAllIPC;
