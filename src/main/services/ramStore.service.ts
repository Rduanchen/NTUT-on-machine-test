import type {
  ExamConfig,
  StudentInformation,
  CryptoState,
  ConnectionStatus,
  JudgeRunResult,
  RamStoreState,
  ServerMessage,
  SocketConnectionStatus,
  SpecialRuleResultRecord
} from '../../common/types';
import os from 'os';

/**
 * RAM Store Service - In-memory key-value store
 *
 * All exam data is stored in RAM only (never persisted to disk).
 * Provides typed getter/setter access via proxy pattern.
 * Auto-clears on app close.
 */
class RamStoreService {
  private static instance: RamStoreService;

  private state: RamStoreState = {
    examConfig: null,
    isConfigured: false,
    studentInfo: { id: '', name: '' },
    isStudentVerified: false,
    cryptoState: null,
    testResults: {},
    hiddenTestResults: {},
    specialRuleResults: {},
    isTestResultDirty: false,
    connectionStatus: 'disconnected',
    backendUrl: '',
    notifications: [],
    messageVersion: 0,
    configVersion: 0,
    socketStatus: 'disconnected'
  };

  /** Event listeners for state changes */
  private listeners: Map<string, Array<(value: unknown) => void>> = new Map();

  private constructor() { }

  public static getInstance(): RamStoreService {
    if (!RamStoreService.instance) {
      RamStoreService.instance = new RamStoreService();
    }
    return RamStoreService.instance;
  }

  // ─── Generic Key-Value Operations ──────────────────────────────

  public get<K extends keyof RamStoreState>(key: K): RamStoreState[K] {
    return this.state[key];
  }

  public set<K extends keyof RamStoreState>(key: K, value: RamStoreState[K]): void {
    this.state[key] = value;
    this.emit(key, value);
  }

  public delete<K extends keyof RamStoreState>(key: K): void {
    const mutableState = this.state as unknown as Record<string, unknown>;
    mutableState[String(key)] = null;
    this.emit(String(key), null);
  }

  public clear(): void {
    this.state = {
      examConfig: null,
      isConfigured: false,
      studentInfo: { id: '', name: '' },
      isStudentVerified: false,
      cryptoState: null,
      testResults: {},
      hiddenTestResults: {},
      specialRuleResults: {},
      isTestResultDirty: false,
      connectionStatus: 'disconnected',
      backendUrl: '',
      notifications: [],
      messageVersion: 0,
      configVersion: 0,
      socketStatus: 'disconnected'
    };
  }

  // ─── Event System ─────────────────────────────────────────────

  public on<K extends keyof RamStoreState>(
    key: K,
    listener: (value: RamStoreState[K]) => void
  ): void {
    const listeners = this.listeners.get(key) || [];
    listeners.push(listener as (value: unknown) => void);
    this.listeners.set(key, listeners);
  }

  public off<K extends keyof RamStoreState>(
    key: K,
    listener: (value: RamStoreState[K]) => void
  ): void {
    const listeners = this.listeners.get(key) || [];
    this.listeners.set(
      key,
      listeners.filter((l) => l !== listener)
    );
  }

  private emit(key: string, value: unknown): void {
    const listeners = this.listeners.get(key) || [];
    for (const listener of listeners) {
      try {
        listener(value);
      } catch (err) {
        console.error(`[RamStore] Error in listener for key "${key}":`, err);
      }
    }
  }

  // ─── ExamConfig ───────────────────────────────────────────────

  get examConfig(): ExamConfig | null {
    return this.state.examConfig;
  }

  set examConfig(config: ExamConfig | null) {
    this.set('examConfig', config);
    if (config) {
      this.set('isConfigured', true);
    }
  }

  get isConfigured(): boolean {
    return this.state.isConfigured;
  }

  set isConfigured(value: boolean) {
    this.set('isConfigured', value);
  }

  get backendUrl(): string {
    return this.state.backendUrl;
  }

  set backendUrl(url: string) {
    this.set('backendUrl', url);
  }

  // ─── Notifications & Versions ──────────────────────────────────

  get notifications(): ServerMessage[] {
    return this.state.notifications;
  }

  set notifications(messages: ServerMessage[]) {
    this.set('notifications', messages);
  }

  get messageVersion(): number {
    return this.state.messageVersion;
  }

  set messageVersion(version: number) {
    this.set('messageVersion', version);
  }

  get configVersion(): number {
    return this.state.configVersion;
  }

  set configVersion(version: number) {
    this.set('configVersion', version);
  }

  get socketStatus(): SocketConnectionStatus {
    return this.state.socketStatus;
  }

  set socketStatus(status: SocketConnectionStatus) {
    this.set('socketStatus', status);
  }

  // ─── Test Results ─────────────────────────────────────────────

  get testResults(): Record<string, JudgeRunResult> {
    return this.state.testResults;
  }

  public setTestResult(puzzleId: string, result: JudgeRunResult): void {
    this.state.testResults[puzzleId] = result;
    this.state.isTestResultDirty = true;
    this.emit('testResults', this.state.testResults);
  }

  get hiddenTestResults(): Record<string, JudgeRunResult> {
    return this.state.hiddenTestResults;
  }

  public setHiddenTestResult(puzzleId: string, result: JudgeRunResult): void {
    this.state.hiddenTestResults[puzzleId] = result;
  }

  // ─── Special Rule Results ─────────────────────────────────────

  get specialRuleResults(): Record<string, SpecialRuleResultRecord[]> {
    return this.state.specialRuleResults;
  }

  public setSpecialRuleResults(
    puzzleId: string,
    results: SpecialRuleResultRecord[],
  ): void {
    this.state.specialRuleResults[puzzleId] = results;
    this.emit('specialRuleResults', this.state.specialRuleResults);
  }

  get isTestResultDirty(): boolean {
    return this.state.isTestResultDirty;
  }

  public markTestResultSynced(): void {
    this.state.isTestResultDirty = false;
  }

  // ─── Student Information ──────────────────────────────────────

  get studentInfo(): StudentInformation {
    return this.state.studentInfo;
  }

  set studentInfo(info: StudentInformation) {
    this.set('studentInfo', info);
  }

  get isStudentVerified(): boolean {
    return this.state.isStudentVerified;
  }

  set isStudentVerified(value: boolean) {
    this.set('isStudentVerified', value);
  }

  // ─── Crypto State ─────────────────────────────────────────────

  get cryptoState(): CryptoState | null {
    return this.state.cryptoState;
  }

  set cryptoState(state: CryptoState | null) {
    this.set('cryptoState', state);
  }

  // ─── Connection Status ────────────────────────────────────────

  get connectionStatus(): ConnectionStatus {
    return this.state.connectionStatus;
  }

  set connectionStatus(status: ConnectionStatus) {
    this.set('connectionStatus', status);
  }

  get isConnected(): boolean {
    return this.state.connectionStatus === 'connected';
  }

  // ─── Utilities ────────────────────────────────────────────────

  /** Get the local IP address of this machine */
  public getLocalIpAddress(): string {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      const entries = nets[name] || [];
      for (const net of entries) {
        if (!net.internal && net.family === 'IPv4') {
          return net.address;
        }
      }
    }
    return '127.0.0.1';
  }
}

/** Singleton instance */
export const ramStore = RamStoreService.getInstance();
