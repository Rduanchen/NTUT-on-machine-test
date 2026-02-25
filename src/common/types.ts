/**
 * Shared types for main and renderer processes
 */

// ─── Exam Config Types ──────────────────────────────────────────────

export interface TestCase {
  input: string;
  output: string;
}

export interface Subtask {
  title: string;
  visible: TestCase[];
  hidden: TestCase[];
}

export type SupportedLanguage = 'C' | 'Cpp' | 'Python' | 'JavaScript' | 'Java';

export interface Puzzle {
  title: string;
  language: SupportedLanguage;
  timeLimit?: number;
  memoryLimit?: number;
  subtasks: Subtask[];
}

export interface AccessableUser {
  id: string;
  name: string;
}

export interface JudgerSettings {
  timeLimit: number;
  memoryLimit: number;
}

export interface ExamConfig {
  testTitle: string;
  description: string;
  judgerSettings: JudgerSettings;
  accessableUsers: AccessableUser[];
  puzzles: Puzzle[];
}

// ─── Pre-Settings Types ─────────────────────────────────────────────

export interface PreSettings {
  testTitle: string;
  description: string;
  remoteHost?: string;
}

// ─── Student & Auth Types ───────────────────────────────────────────

export interface StudentInformation {
  id: string;
  name: string;
}

export interface RegisterUserCryptoPayload {
  studentID: string;
  aesKey: string;
  userSessionID: string;
  ipAddress: string;
}

export interface UserAccessTokenPayload {
  studentID: string;
  timestamp: number;
  userSessionID: string;
  randomString: string;
}

// ─── RAM Store Types ────────────────────────────────────────────────

export interface CryptoState {
  aesKeyHex: string;
  userSessionID: string;
  rsaPublicKey: string;
}

export interface RamStoreState {
  examConfig: ExamConfig | null;
  isConfigured: boolean;
  studentInfo: StudentInformation;
  isStudentVerified: boolean;
  cryptoState: CryptoState | null;
  testResults: Record<string, JudgeRunResult>;
  isTestResultDirty: boolean;
  connectionStatus: ConnectionStatus;
  backendUrl: string;
}

export type ConnectionStatus = 'connected' | 'disconnected';

// ─── Judge Result Types ─────────────────────────────────────────────

export type JudgeStatusCode = 'AC' | 'WA' | 'TLE' | 'MLE' | 'RE' | 'CE' | 'SE' | 'ABORTED';

export interface JudgeTestCaseResult {
  statusCode: JudgeStatusCode;
  input: string;
  expectingOutput: string;
  userOutput: string;
  time: string;
}

export interface JudgeRunResult {
  subtasks: JudgeTestCaseResult[][];
  totalCases: number;
  correctCount: number;
}

// ─── API Types ──────────────────────────────────────────────────────

export interface LogActionPayload {
  action: string;
  studentID: string;
  level?: string;
  timestamp?: string;
  message?: string;
  details?: unknown;
}

export interface UploadSubtaskResultPayload {
  visible: JudgeTestCaseResult[];
  hidden: JudgeTestCaseResult[];
}

export interface UploadResultPayload {
  studentID: string;
  testResult: Record<string, UploadSubtaskResultPayload[]>;
}

// ─── IPC Response ───────────────────────────────────────────────────

export interface IpcResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// ─── Puzzle Info (for renderer) ─────────────────────────────────────

export interface PuzzleInfo {
  /**
   * Derived from puzzle index. Stored as string because it is used as
   * a key for result maps on both main and renderer.
   */
  id: string;
  title: string;
  language: SupportedLanguage;
}

// ─── Connection Service Types ───────────────────────────────────────

export interface QueuedRequest {
  id: string;
  payload: unknown;
  timestamp: number;
}
