import { app, ipcMain } from "electron";
import os from "os";
import path from "path";
import fs from "fs";
import admzip from "adm-zip";
import { readStudentInformation } from "./runTimeStore";

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
    console.log(`File copied to temporary directory: ${destPath}`);
    return destPath;
  }
  public static clearTempDir() {
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.log(`Temporary directory ${tempDir} has been removed.`);
  }
  public static zipTempDir() {
    const studentID = readStudentInformation().studentID || "unknown";
    const zip = new admzip();
    zip.addLocalFolder(tempDir);
    
    const zipDataBuffer = zip.toBuffer();

    // const zipPath = path.join(os.tmpdir(), `${studentID}.zip`);
    // zip.writeZip(zipPath);

    // // Return a Blob URL for the zip file
    // const zipData = fs.readFileSync(zipPath);
    // const blob = new Blob([zipData], { type: "application/zip" });
    // const blobUrl = URL.createObjectURL(blob);
    return zipDataBuffer;
  }
}
