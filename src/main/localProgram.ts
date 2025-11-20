import { app, ipcMain } from "electron";
import path from "path";
import fs from "fs";
import admzip from "adm-zip";
import { readStudentInformation } from "./local-store/runTimeStore";
import { actionLogger } from "./logger";

const tempRoot = app.getPath("temp"); // 系統 temp 目錄
const tempDir = fs.mkdtempSync(path.join(tempRoot, "myTempDir-"));

export class LocalProgramStore {
  static setup() {
    ipcMain.handle("localProgram:getZipFile", () => {
      return this.zipTempDir();
    });
  }
  public getTempDir() {
    return tempDir;
  }
  public static addFile(filePath: string, fileName: string) {
    const destPath = path.join(tempDir, `${fileName}.py`);
    fs.copyFileSync(filePath, destPath);
    actionLogger.info(`File ${filePath} copied to temporary directory as ${destPath}`);
    return destPath;
  }
  public static clearTempDir() {
    fs.rmSync(tempDir, { recursive: true, force: true });
    actionLogger.info(`Temporary directory ${tempDir} has been removed.`);
  }
  public static zipTempDir() {
    // const studentID = readStudentInformation().studentID || "unknown";
    const zip = new admzip();
    zip.addLocalFolder(tempDir);
    const zipDataBuffer = zip.toBuffer();
    return zipDataBuffer;
  }
}
