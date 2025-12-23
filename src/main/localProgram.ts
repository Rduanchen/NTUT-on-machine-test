import { app, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import admzip from 'adm-zip';
import { actionLogger } from './system/logger';
import { sendProgramFileToServer } from './api';

const tempRoot = app.getPath('temp'); // 系統 temp 目錄
const tempDir = fs.mkdtempSync(path.join(tempRoot, 'myTempDir-'));

export class LocalProgramStore {
  static setup() {
    ipcMain.handle('localProgram:getZipFile', () => {
      return this.zipTempDir();
    });
    ipcMain.handle('localProgram:syncToBackend', () => {
      return this.syncToBackend();
    });
  }
  public getTempDir() {
    return tempDir;
  }
  public static addFile(filePath: string, fileName: string) {
    const destPath = path.join(tempDir, `${fileName}.py`);
    fs.copyFileSync(filePath, destPath);
    actionLogger.info(`File ${filePath} copied to temporary directory as ${destPath}`);
    // this.syncToBackend();
    return destPath;
  }
  public static syncToBackend() {
    const zipBuffer = this.zipTempDir();
    sendProgramFileToServer(zipBuffer);
    return true;
  }
  public static clearTempDir() {
    fs.rmSync(tempDir, { recursive: true, force: true });
    actionLogger.silly(`Temporary directory ${tempDir} has been removed.`);
  }
  public static zipTempDir(): Buffer {
    const zip = new admzip();
    zip.addLocalFolder(tempDir);
    const zipDataBuffer = zip.toBuffer();
    return zipDataBuffer;
  }
}