import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import admzip from 'adm-zip';
import { logger } from './logger.service';

/**
 * Local Program Store - Manages student code files in a temp directory
 *
 * Lifecycle:
 * - on app start: create temp directory
 * - on app close: delete temp directory and all files
 *
 * Features:
 * - addFile(puzzleId, extension, sourcePath): copy file to temp as {puzzleId}.{ext}
 * - deleteTempDir(): remove all files
 * - zipTempDir(): package all files as zip Buffer
 */

class LocalProgramStoreService {
  private static instance: LocalProgramStoreService;
  private tempDir: string;

  private constructor() {
    const tempRoot = app.getPath('temp');
    this.tempDir = fs.mkdtempSync(path.join(tempRoot, 'ntut-exam-'));
    logger.info(`[LocalProgram] Temp directory created: ${this.tempDir}`);
  }

  public static getInstance(): LocalProgramStoreService {
    if (!LocalProgramStoreService.instance) {
      LocalProgramStoreService.instance = new LocalProgramStoreService();
    }
    return LocalProgramStoreService.instance;
  }

  /** Get the temp directory path */
  public getTempDir(): string {
    return this.tempDir;
  }

  /**
   * Add a file to the temp directory.
   * Copies the source file and renames to {puzzleId}.{extension}.
   * Replaces any existing file for the same puzzle.
   */
  public addFile(puzzleId: string, extension: string, sourcePath: string): string {
    const destPath = path.join(this.tempDir, `${puzzleId}.${extension}`);
    const resolvedSource = path.resolve(sourcePath);
    const resolvedDest = path.resolve(destPath);
    if (resolvedSource !== resolvedDest) {
      fs.copyFileSync(resolvedSource, resolvedDest);
    }
    logger.info(`[LocalProgram] File added: ${sourcePath} → ${destPath}`);
    return destPath;
  }

  /** Delete the entire temp directory and all files */
  public deleteTempDir(): void {
    try {
      if (fs.existsSync(this.tempDir)) {
        fs.rmSync(this.tempDir, { recursive: true, force: true });
        logger.silly(`[LocalProgram] Temp directory removed: ${this.tempDir}`);
      }
    } catch (error) {
      logger.error('[LocalProgram] Error deleting temp directory:', error);
    }
  }

  /** Package all files in temp directory as a zip, returns Buffer */
  public zipTempDir(): Buffer {
    const zip = new admzip();
    zip.addLocalFolder(this.tempDir);
    return zip.toBuffer();
  }

  /** Check if temp directory has any files */
  public hasFiles(): boolean {
    try {
      const files = fs.readdirSync(this.tempDir);
      return files.length > 0;
    } catch {
      return false;
    }
  }

  /** List all files in the temp directory */
  public listFiles(): string[] {
    try {
      return fs.readdirSync(this.tempDir);
    } catch {
      return [];
    }
  }

  /** Get the stored file path for a given puzzle id if it exists */
  public getFilePathForPuzzle(puzzleId: string): string | null {
    const entry = this.listFiles().find((fileName) => fileName.startsWith(`${puzzleId}.`));
    if (!entry) return null;
    return path.join(this.tempDir, entry);
  }

  /** Get all stored program entries (puzzle id + absolute file path) */
  public getStoredProgramEntries(): Array<{ puzzleId: string; filePath: string }> {
    return this.listFiles()
      .map((fileName) => {
        const [puzzleId] = fileName.split('.');
        if (typeof puzzleId === 'undefined' || puzzleId === '') return null;
        return {
          puzzleId,
          filePath: path.join(this.tempDir, fileName)
        };
      })
      .filter((entry): entry is { puzzleId: string; filePath: string } => Boolean(entry));
  }
}

export const localProgramStore = LocalProgramStoreService.getInstance();
