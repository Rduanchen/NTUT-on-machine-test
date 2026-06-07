export type Language = 'C' | 'CPP' | 'JAVA' | 'PYTHON' | 'NODEJS';
export type CompareMode = 'strict' | 'loose';
export type StatusCode = 'AC' | 'WA' | 'TLE' | 'MLE' | 'RE' | 'CE' | 'SE' | 'ABORTED';

export interface TestCase {
  input: string;
  output: string;
}

export interface JudgeRequest {
  compilerPath?: string;
  language: Language;
  codeString: string;
  compareMode: CompareMode;
  timeLimit: number;       // ms
  memoryLimit?: number;    // Bytes
  subtasks: TestCase[][];
}

export interface TestCaseResult {
  statusCode: StatusCode;
  input: string;
  expectingOutput: string;
  userOutput: string;
  time: string;
  memory?: string;
  error?: string;
}

export interface JudgeResult {
  subtasks: TestCaseResult[][];
}

export interface JudgeHandle {
  pid: number;
  stop: () => void;
  promise: Promise<JudgeResult>;
}

export type JudgeCallback = (error: Error | null, result: JudgeResult | null) => void;

export interface LanguageConfig {
  extension: string;
  compile?: (codePath: string, outputPath: string, compilerPath?: string) => { cmd: string; args: string[] };
  run: (compiledPath: string, compilerPath?: string) => { cmd: string; args: string[] };
  needsCompilation: boolean;
}