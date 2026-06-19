import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import admzip from 'adm-zip';
import { logger } from './logger.service';
import type { UploadVersionPreference } from '../../common/types';

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

  /**
   * Add a high score file to the temp directory.
   * Copies the source file and renames to {puzzleId}.highest.{extension}.
   */
  public saveHighestScoreFile(puzzleId: string, extension: string, sourcePath: string): string {
    const destPath = path.join(this.tempDir, `${puzzleId}.highest.${extension}`);
    const resolvedSource = path.resolve(sourcePath);
    const resolvedDest = path.resolve(destPath);
    if (resolvedSource !== resolvedDest) {
      fs.copyFileSync(resolvedSource, resolvedDest);
    }
    logger.info(`[LocalProgram] Highest score file saved: ${sourcePath} → ${destPath}`);
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

  /** Package files in temp directory as a zip according to preference, returns Buffer */
  public zipTempDir(preference: UploadVersionPreference = 'current'): Buffer {
    const zip = new admzip();
    const entries = this.getStoredProgramEntries(preference);
    for (const entry of entries) {
      // The entry.filePath points to either the current or the highest file
      // We want it to be named simply `${puzzleId}.${extension}` inside the zip
      const extension = entry.filePath.split('.').pop() || 'txt';
      const zipFileName = `${entry.puzzleId}.${extension}`;
      zip.addLocalFile(entry.filePath, '', zipFileName);
    }
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

  /** Get the stored file path for a given puzzle id based on version preference */
  public getFilePathForPuzzle(puzzleId: string, preference: UploadVersionPreference = 'current'): string | null {
    const files = this.listFiles();
    let targetFileName: string | undefined;

    if (preference === 'highest') {
      targetFileName = files.find((fileName) => fileName.startsWith(`${puzzleId}.highest.`));
    }
    
    // Fallback to current version if highest doesn't exist or wasn't requested
    if (!targetFileName) {
      targetFileName = files.find((fileName) => fileName.startsWith(`${puzzleId}.`) && !fileName.includes('.highest.'));
    }

    if (!targetFileName) return null;
    return path.join(this.tempDir, targetFileName);
  }

  /** Get all stored program entries (puzzle id + absolute file path) based on version preference */
  public getStoredProgramEntries(preference: UploadVersionPreference = 'current'): Array<{ puzzleId: string; filePath: string }> {
    const files = this.listFiles();
    const puzzleIds = Array.from(new Set(
      files
        .map((fileName) => fileName.split('.')[0])
        .filter((id) => id && id.length > 0)
    ));

    return puzzleIds
      .map((puzzleId) => {
        const filePath = this.getFilePathForPuzzle(puzzleId, preference);
        if (!filePath) return null;
        return { puzzleId, filePath };
      })
      .filter((entry): entry is { puzzleId: string; filePath: string } => Boolean(entry));
  }
}

export const localProgramStore = LocalProgramStoreService.getInstance();
