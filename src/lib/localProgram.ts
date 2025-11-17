import { app, ipcMain } from "electron";
import os from "os";
import path from "path";
import fs from "fs";
import admzip from "adm-zip";
import { readStudentInformation } from "./runTimeStore";

const tempRoot = app.getPath("temp"); // 系統 temp 目錄
const tempDir = fs.mkdtempSync(path.join(tempRoot, "myTempDir-"));

export class LocalProgramStore {
  constructor() {
    ipcMain.handle("localProgram:getZipFile", () => {
      return this.zipTempDir();
    });
  }
  public getTempDir() {
    return tempDir;
  }
  public addFile(file: File, fileName: string) {
    const filePath = path.join(tempDir, fileName);
    fs.copyFileSync(file.path, filePath);
    return filePath;
  }
  public clearTempDir() {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  public zipTempDir() {
    const studentID = readStudentInformation().studentID || "unknown";
    const zip = new admzip();
    zip.addLocalFolder(tempDir);
    const zipPath = path.join(os.tmpdir(), `${studentID}.zip`);
    zip.writeZip(zipPath);
    return zipPath;
  }
}
