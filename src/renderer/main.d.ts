import type {
  JudgeRunResult,
  PuzzleInfo,
  SpecialRuleResultRecord,
  SpecialRule,
  ExamState,
} from '../common/types';

declare global {
  interface Window {
    api?: {
      store?: {
        getConnectionStatus: () => Promise<string>;
        getTestResults: () => Promise<Record<string, JudgeRunResult>>;
        getHiddenTestResults?: () => Promise<Record<string, JudgeRunResult>>;
        getExamConfig?: () => Promise<any>;
        getSpecialRuleResults: () => Promise<Record<string, SpecialRuleResultRecord[]>>;
        getEffectiveSpecialRules: () => Promise<Record<string, SpecialRule[]>>;
        getPuzzleInfo: () => Promise<PuzzleInfo[]>;
        getExamInfo: () => Promise<any>;
        getExamStatus: () => Promise<ExamState>;
        onConnectionStatusChanged: (callback: (status: string) => void) => (() => void);
        onExamStatusChanged?: (callback: (status: ExamState) => void) => (() => void);
        onTestResultsUpdated?: (callback: (results: Record<string, JudgeRunResult>) => void) => (() => void);
        onSpecialRuleResultsUpdated?: (
          callback: (results: Record<string, SpecialRuleResultRecord[]>) => void,
        ) => (() => void);
      };
      judger?: {
        forceStop: () => void;
        judge: (puzzleId: string, filePath: string) => Promise<{ success: boolean; error?: { code: string; message: string } }>;
        getZip: () => Promise<ArrayBuffer | Uint8Array | null>;
        syncResults: () => Promise<{ success: boolean; error?: { code: string; message: string } }>;
        syncCode: () => Promise<{ success: boolean; error?: { code: string; message: string } }>;
      };
      auth?: {
        getStudentInfo: () => Promise<{ id: string; name: string }>;
        isVerified: () => Promise<boolean>;
        login: (studentId?: string) => Promise<{ success: boolean; error?: { code: string; message: string } }>;
      };
      config?: {
        setJson: (jsonFilePath: string) => Promise<any>;
        getFromServer: (host: string) => Promise<any>;
        getServerStatus: (hostname: string) => Promise<any>;
        isSetupComplete: () => Promise<boolean>;
      };
      notifications?: {
        getAll: () => Promise<any[]>;
        getVersions: () => Promise<any>;
        getSocketStatus: () => Promise<string>;
        refresh: () => Promise<void>;
        onUpdated: (callback: (messages: unknown[]) => void) => void;
        onSocketStatusChanged: (callback: (status: string) => void) => void;
      };
    };
  }
}

export { };
