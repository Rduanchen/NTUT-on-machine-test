import type {
  IpcResponse,
  PuzzleInfo,
  StudentInformation,
  JudgeRunResult,
  ConnectionStatus
} from '../common/types';

interface ConfigAPI {
  setJson: (jsonFilePath: string) => Promise<IpcResponse<void>>;
  getFromServer: (host: string) => Promise<IpcResponse<void>>;
  getServerStatus: (hostname: string) => Promise<IpcResponse<void>>;
  isSetupComplete: () => Promise<boolean>;
}

interface AuthAPI {
  login: (studentID: string) => Promise<IpcResponse<void>>;
  isVerified: () => Promise<boolean>;
  getStudentInfo: () => Promise<StudentInformation>;
}

interface StoreAPI {
  getConnectionStatus: () => Promise<ConnectionStatus>;
  getTestResults: () => Promise<Record<string, JudgeRunResult>>;
  getPuzzleInfo: () => Promise<PuzzleInfo[]>;
  getExamInfo: () => Promise<{ testTitle: string; description: string } | null>;
  onConnectionStatusChanged: (callback: (status: string) => void) => void;
}

interface JudgerAPI {
  judge: (puzzleId: string, codeFilePath: string) => Promise<IpcResponse<JudgeRunResult>>;
  forceStop: () => Promise<{ success: boolean }>;
  syncResults: () => Promise<IpcResponse<void>>;
  getZip: () => Promise<Buffer | null>;
  syncCode: () => Promise<IpcResponse<void>>;
}

interface API {
  config: ConfigAPI;
  auth: AuthAPI;
  store: StoreAPI;
  judger: JudgerAPI;
}

declare global {
  interface Window {
    api: API;
    electron: unknown;
  }
}

export {};
