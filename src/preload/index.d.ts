import type {
  IpcResponse,
  PuzzleInfo,
  StudentInformation,
  JudgeRunResult,
  ConnectionStatus,
  ServerMessage,
  SocketConnectionStatus,
  SpecialRuleResultRecord,
  SpecialRule,
  ExamConfig,
  ExamState,
  UploadVersionPreference
} from '../common/types';

interface ConfigAPI {
  setJson: (jsonFilePath: string) => Promise<IpcResponse<void>>;
  getFromServer: (host: string) => Promise<IpcResponse<void>>;
  getServerStatus: (hostname: string) => Promise<IpcResponse<void>>;
  isSetupComplete: () => Promise<boolean>;
}

interface AuthAPI {
  login: (studentID?: string) => Promise<IpcResponse<void>>;
  isVerified: () => Promise<boolean>;
  getStudentInfo: () => Promise<StudentInformation>;
}

interface StoreAPI {
  getConnectionStatus: () => Promise<ConnectionStatus>;
  getTestResults: () => Promise<Record<string, JudgeRunResult>>;
  getHiddenTestResults: () => Promise<Record<string, JudgeRunResult>>;
  getExamConfig: () => Promise<ExamConfig | null>;
  getSpecialRuleResults: () => Promise<Record<string, SpecialRuleResultRecord[]>>;
  getHighestTestResults: () => Promise<Record<string, JudgeRunResult>>;
  getHighestHiddenTestResults: () => Promise<Record<string, JudgeRunResult>>;
  getHighestSpecialRuleResults: () => Promise<Record<string, SpecialRuleResultRecord[]>>;
  getUploadVersionPreference: () => Promise<UploadVersionPreference>;
  setUploadVersionPreference: (preference: UploadVersionPreference) => Promise<IpcResponse<void>>;
  getEffectiveSpecialRules: () => Promise<Record<string, SpecialRule[]>>;
  getPuzzleInfo: () => Promise<PuzzleInfo[]>;
  getExamInfo: () => Promise<{ testTitle: string; description: string } | null>;
  getExamStatus: () => Promise<ExamState>;
  onConnectionStatusChanged: (callback: (status: string) => void) => () => void;
  onExamStatusChanged: (callback: (status: string) => void) => () => void;
  onTestResultsUpdated: (callback: (results: Record<string, JudgeRunResult>) => void) => () => void;
  onSpecialRuleResultsUpdated: (callback: (results: Record<string, SpecialRuleResultRecord[]>) => void) => () => void;
  onHighestTestResultsUpdated: (callback: (results: Record<string, JudgeRunResult>) => void) => () => void;
  onHighestSpecialRuleResultsUpdated: (callback: (results: Record<string, SpecialRuleResultRecord[]>) => void) => () => void;
}

interface JudgerAPI {
  judge: (puzzleId: string, codeFilePath: string) => Promise<IpcResponse<JudgeRunResult>>;
  forceStop: () => Promise<{ success: boolean }>;
  syncResults: () => Promise<IpcResponse<void>>;
  getZip: () => Promise<Buffer | null>;
  syncCode: () => Promise<IpcResponse<void>>;
}

interface NotificationAPI {
  getAll: () => Promise<ServerMessage[]>;
  getVersions: () => Promise<{ configVersion: number; messageVersion: number }>;
  getSocketStatus: () => Promise<SocketConnectionStatus>;
  refresh: () => Promise<IpcResponse<void>>;
  onUpdated: (callback: (messages: ServerMessage[]) => void) => () => void;
  onSocketStatusChanged: (callback: (status: SocketConnectionStatus) => void) => () => void;
}

interface API {
  config: ConfigAPI;
  auth: AuthAPI;
  store: StoreAPI;
  judger: JudgerAPI;
  notifications: NotificationAPI;
}

declare global {
  interface Window {
    api: API;
    electron: unknown;
  }
}

export { };
