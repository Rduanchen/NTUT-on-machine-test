import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import admzip from 'adm-zip';
import { app } from 'electron';
import { localProgramStore } from '../../src/main/services/localProgram.service';

vi.mock('fs');
vi.mock('adm-zip');

describe('LocalProgramStoreService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // @ts-ignore reset singleton for testing
    localProgramStore.constructor.instance = undefined;
    // mock mkdtempSync
    (fs.mkdtempSync as any).mockReturnValue('/mock/path/temp/ntut-exam-mock');
  });

  it('should initialize and create temp dir', () => {
    const store = (localProgramStore as any).constructor.getInstance();
    expect(fs.mkdtempSync).toHaveBeenCalled();
    expect(store.getTempDir()).toBe('/mock/path/temp/ntut-exam-mock');
  });

  it('should return the same instance', () => {
    const store1 = (localProgramStore as any).constructor.getInstance();
    const store2 = (localProgramStore as any).constructor.getInstance();
    expect(store1).toBe(store2);
  });

  it('should add file correctly', () => {
    const store = (localProgramStore as any).constructor.getInstance();
    (fs.copyFileSync as any).mockClear();
    
    const result = store.addFile('puz1', 'js', '/mock/source/puz1.js');
    expect(fs.copyFileSync).toHaveBeenCalled();
    expect(result.endsWith('puz1.js')).toBe(true);
  });

  it('should not copy if source and dest are same in addFile', () => {
    const store = (localProgramStore as any).constructor.getInstance();
    (fs.copyFileSync as any).mockClear();
    
    // Simulate source being same as dest
    const dest = path.join(store.getTempDir(), 'puz1.js');
    const result = store.addFile('puz1', 'js', dest);
    expect(fs.copyFileSync).not.toHaveBeenCalled();
    expect(result).toBe(dest);
  });

  /* Feature 007 bugfix BUG-07. A missing path reached `path.resolve` and threw
   * about `paths[0]`, which names an argument position and nothing else. */
  it('names the missing file when no source path is given', () => {
    const store = (localProgramStore as any).constructor.getInstance();
    (fs.copyFileSync as any).mockClear();

    expect(() => store.addFile('puz1', 'js', undefined)).toThrowError(/puz1/);
    expect(fs.copyFileSync).not.toHaveBeenCalled();
  });

  it('should save highest score file correctly', () => {
    const store = (localProgramStore as any).constructor.getInstance();
    (fs.copyFileSync as any).mockClear();
    
    const result = store.saveHighestScoreFile('puz2', 'py', '/mock/source/puz2.py');
    expect(fs.copyFileSync).toHaveBeenCalled();
    expect(result.endsWith('puz2.highest.py')).toBe(true);
  });

  it('should not copy if source and dest are same in saveHighestScoreFile', () => {
    const store = (localProgramStore as any).constructor.getInstance();
    (fs.copyFileSync as any).mockClear();
    
    const dest = path.join(store.getTempDir(), 'puz2.highest.py');
    const result = store.saveHighestScoreFile('puz2', 'py', dest);
    expect(fs.copyFileSync).not.toHaveBeenCalled();
    expect(result).toBe(dest);
  });

  it('should delete temp dir safely', () => {
    const store = (localProgramStore as any).constructor.getInstance();
    (fs.existsSync as any).mockReturnValue(true);
    (fs.rmSync as any).mockClear();
    
    store.deleteTempDir();
    expect(fs.existsSync).toHaveBeenCalledWith(store.getTempDir());
    expect(fs.rmSync).toHaveBeenCalledWith(store.getTempDir(), { recursive: true, force: true });
  });

  it('should not delete temp dir if it does not exist', () => {
    const store = (localProgramStore as any).constructor.getInstance();
    (fs.existsSync as any).mockReturnValue(false);
    (fs.rmSync as any).mockClear();
    
    store.deleteTempDir();
    expect(fs.rmSync).not.toHaveBeenCalled();
  });

  it('should catch error on delete temp dir', () => {
    const store = (localProgramStore as any).constructor.getInstance();
    (fs.existsSync as any).mockImplementation(() => { throw new Error('Delete Error'); });
    
    expect(() => store.deleteTempDir()).not.toThrow();
  });

  it('should return boolean from hasFiles', () => {
    const store = (localProgramStore as any).constructor.getInstance();
    (fs.readdirSync as any).mockReturnValue(['file1.js']);
    expect(store.hasFiles()).toBe(true);
    
    (fs.readdirSync as any).mockReturnValue([]);
    expect(store.hasFiles()).toBe(false);
  });

  it('should return false on hasFiles error', () => {
    const store = (localProgramStore as any).constructor.getInstance();
    (fs.readdirSync as any).mockImplementation(() => { throw new Error('Read Error'); });
    expect(store.hasFiles()).toBe(false);
  });

  it('should list files', () => {
    const store = (localProgramStore as any).constructor.getInstance();
    (fs.readdirSync as any).mockReturnValue(['a.js', 'b.py']);
    expect(store.listFiles()).toEqual(['a.js', 'b.py']);
  });

  it('should return empty array on list files error', () => {
    const store = (localProgramStore as any).constructor.getInstance();
    (fs.readdirSync as any).mockImplementation(() => { throw new Error('Read Error'); });
    expect(store.listFiles()).toEqual([]);
  });

  it('should get file path for puzzle', () => {
    const store = (localProgramStore as any).constructor.getInstance();
    (fs.readdirSync as any).mockReturnValue(['puz1.js', 'puz1.highest.js', 'puz2.py']);
    
    expect(store.getFilePathForPuzzle('puz1', 'current')).toContain('puz1.js');
    expect(store.getFilePathForPuzzle('puz1', 'highest')).toContain('puz1.highest.js');
    // fallback if highest not found
    expect(store.getFilePathForPuzzle('puz2', 'highest')).toContain('puz2.py');
    expect(store.getFilePathForPuzzle('puz3', 'current')).toBeNull();
  });

  it('should get stored program entries', () => {
    const store = (localProgramStore as any).constructor.getInstance();
    (fs.readdirSync as any).mockReturnValue(['puz1.js', 'puz2.highest.py', '.DS_Store']);
    
    const entries = store.getStoredProgramEntries('current');
    expect(entries.length).toBeGreaterThan(0);
    
    const entriesHighest = store.getStoredProgramEntries('highest');
    expect(entriesHighest.length).toBeGreaterThan(0);
    
    (fs.readdirSync as any).mockReturnValue([]);
    expect(store.getStoredProgramEntries()).toEqual([]);
  });

  it('should zip temp dir', () => {
    const store = (localProgramStore as any).constructor.getInstance();
    (fs.readdirSync as any).mockReturnValue(['puz1.js']);
    
    const mockAddLocalFile = vi.fn();
    const mockToBuffer = vi.fn().mockReturnValue(Buffer.from('mock-zip'));
    (admzip as any).mockImplementation(() => ({
      addLocalFile: mockAddLocalFile,
      toBuffer: mockToBuffer
    }));
    
    const buffer = store.zipTempDir();
    expect(mockAddLocalFile).toHaveBeenCalled();
    expect(mockToBuffer).toHaveBeenCalled();
    expect(buffer).toBeDefined();
  });

  it('should zip temp dir and fallback to txt extension', () => {
    const store = (localProgramStore as any).constructor.getInstance();
    (fs.readdirSync as any).mockReturnValue(['puz1.']); // empty extension
    
    const mockAddLocalFile = vi.fn();
    const mockToBuffer = vi.fn().mockReturnValue(Buffer.from('mock-zip'));
    (admzip as any).mockImplementation(() => ({
      addLocalFile: mockAddLocalFile,
      toBuffer: mockToBuffer
    }));
    
    store.zipTempDir();
    expect(mockAddLocalFile).toHaveBeenCalledWith(expect.any(String), '', 'puz1.txt');
  });
});
