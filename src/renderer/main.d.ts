import type { JudgeRunResult, PuzzleInfo } from '../common/types';

declare global {
  interface Window {
    api?: {
      store?: {
        getTestResults: () => Promise<Record<string, JudgeRunResult>>;
        getPuzzleInfo: () => Promise<PuzzleInfo[]>;
        getExamInfo: () => Promise<any>;
      };
      judger?: {
        forceStop: () => void;
        judge: (puzzleId: string, filePath: string) => Promise<{ success: boolean }>;
        getZip: () => Promise<ArrayBuffer | Uint8Array | null>;
        syncResults: () => Promise<void>;
        syncCode: () => Promise<void>;
      };
      auth?: {
        getStudentInfo: () => Promise<{ id: string }>;
        login: (studentID: string) => Promise<{ success: boolean; error?: string }>;
      };
    };
  }
}

export {};
