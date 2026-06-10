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
  score?: number;
  visible: TestCase[];
  hidden: TestCase[];
}

export type ExamState = 'UNINITIALIZED' | 'NOT_STARTED' | 'IN_PROGRESS' | 'FINISHED';

export type SupportedLanguage = 'C' | 'Cpp' | 'Python' | 'JavaScript' | 'Java';

export interface Puzzle {
  id?: string;
  title: string;
  score?: number;
  language: SupportedLanguage;
  timeLimit?: number;
  memoryLimit?: number;
  subtasks: Subtask[];
  specialRules?: SpecialRule[];
}

export type RuleConstraint = 'MUST_HAVE' | 'MUST_NOT_HAVE';

export interface SpecialRule {
  id: string;
  type: 'regex' | 'use' | 'composite' | 'nestedLoop';
  constraint: RuleConstraint;
  message: string;
  severity?: 'info' | 'warn';
  multiplier?: number;
  params: unknown;
}

export interface SpecialRuleResultRecord {
  ruleId: string;
  passed: boolean;
  message: string;
  reason?: string;
  checkedAt: string; // ISO
}

export interface AccessableUser {
  id: string;
  name: string;
  ip?: string;
}

export interface JudgerSettings {
  timeLimit: number;
  memoryLimit: number;
  compareMode?: 'strict' | 'loose';
}

export interface Section {
  id: string;
  title: string;
  description?: string;
  maxScore: number;
  puzzles: Puzzle[];
}

export interface ExamConfig {
  testTitle: string;
  description: string;
  judgerSettings: JudgerSettings;
  accessibleUsers: AccessableUser[];
  globalSpecialRules?: SpecialRule[];
  sections: Section[];
  puzzles?: Puzzle[]; // legacy/optional flat list
}

// ─── Notification & Messaging Types ───────────────────────────────

export interface ServerMessage {
  id: number;
  type: string;
  message: string;
  createdAt: string;
  namespace?: string;
}

export type SocketConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

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
  hiddenTestResults: Record<string, JudgeRunResult>;
  /** Per puzzleId latest evaluation results for special rules */
  specialRuleResults: Record<string, SpecialRuleResultRecord[]>;
  isTestResultDirty: boolean;
  connectionStatus: ConnectionStatus;
  backendUrl: string;
  notifications: ServerMessage[];
  messageVersion: number;
  configVersion: number;
  socketStatus: SocketConnectionStatus;
  examStatus: ExamState;
  isOfflineMode: boolean;
  pendingLoginSync: boolean;
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
  macAddress?: string;
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
  sectionId?: string;
  sectionTitle?: string;
  sectionDescription?: string;
  sectionMaxScore?: number;
  score?: number;
  subtasks?: { title: string; score?: number }[];
}

// ─── Connection Service Types ───────────────────────────────────────

export interface QueuedRequest {
  id: string;
  payload: unknown;
  timestamp: number;
}
