import type {
  JudgeRunResult,
  PuzzleInfo,
  SpecialRuleResultRecord,
  SpecialRule,
} from '../common/types';

declare global {
  interface Window {
    api?: {
      store?: {
        getTestResults: () => Promise<Record<string, JudgeRunResult>>;
        getSpecialRuleResults: () => Promise<Record<string, SpecialRuleResultRecord[]>>;
  getEffectiveSpecialRules: () => Promise<Record<string, SpecialRule[]>>;
        getPuzzleInfo: () => Promise<PuzzleInfo[]>;
        getExamInfo: () => Promise<any>;
        onTestResultsUpdated?: (callback: (results: Record<string, JudgeRunResult>) => void) => void;
        onSpecialRuleResultsUpdated?: (
          callback: (results: Record<string, SpecialRuleResultRecord[]>) => void,
        ) => void;
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

export { };
