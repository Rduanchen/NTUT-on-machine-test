import fs from 'fs';
import { ramStore } from './ramStore.service';
import { localProgramStore } from './localProgram.service';
import {
  Judge,
  type JudgeHandle,
  type JudgeResult,
  type Language,
  type TestCase as NodeJudgeTestCase
} from '../judge/node-judger';
import type {
  Puzzle,
  JudgeRunResult,
  JudgeTestCaseResult,
  SupportedLanguage
} from '../../common/types';

/**
 * Node-Judger Service - Code evaluation using built-in node-judger
 */

const languageMap: Record<SupportedLanguage, Language> = {
  Python: 'PYTHON',
  C: 'C',
  Cpp: 'CPP',
  Java: 'JAVA',
  JavaScript: 'NODEJS'
};

function mapLanguage(lang: SupportedLanguage): Language {
  return languageMap[lang] || 'PYTHON';
}

const extensionMap: Record<SupportedLanguage, string> = {
  Python: 'py',
  C: 'c',
  Cpp: 'cpp',
  Java: 'java',
  JavaScript: 'js'
};

export function getExtensionForLanguage(lang: SupportedLanguage): string {
  return extensionMap[lang] || 'txt';
}

let currentHandle: JudgeHandle | null = null;

class NodeJudgerService {
  private static instance: NodeJudgerService;
  private constructor() { }

  public static getInstance(): NodeJudgerService {
    if (!NodeJudgerService.instance) {
      NodeJudgerService.instance = new NodeJudgerService();
    }
    return NodeJudgerService.instance;
  }

  public async judge(puzzleId: string, codeFilePath: string): Promise<{ public: JudgeRunResult; hidden: JudgeRunResult }> {
    const config = ramStore.examConfig;
    if (!config) throw new Error('ExamConfig not loaded');

    const puzzleIndex = Number(puzzleId);
    if (Number.isNaN(puzzleIndex)) throw new Error(`Invalid puzzle index: ${puzzleId}`);

    const puzzle = config.puzzles[puzzleIndex];
    if (!puzzle) throw new Error(`Puzzle not found at index: ${puzzleId}`);

    const extension = getExtensionForLanguage(puzzle.language);
    const storedPath = localProgramStore.addFile(String(puzzleIndex), extension, codeFilePath);
    const codeString = fs.readFileSync(storedPath, 'utf-8');

    const judgerSettings = config.judgerSettings;
    const timeLimit = puzzle.timeLimit || judgerSettings.timeLimit;
    const memoryLimit = puzzle.memoryLimit || judgerSettings.memoryLimit;

    const subtasks: NodeJudgeTestCase[][] = puzzle.subtasks.map((subtask) => {
      const cases: NodeJudgeTestCase[] = [];
      for (const tc of subtask.visible) {
        cases.push({ input: tc.input, output: tc.output });
      }
      for (const tc of subtask.hidden) {
        cases.push({ input: tc.input, output: tc.output });
      }
      return cases;
    });

    const judge = new Judge({
      defaultTimeLimit: timeLimit,
      defaultMemoryLimit: memoryLimit
    });

    currentHandle = judge.run({
      language: mapLanguage(puzzle.language),
      codeString,
      compareMode: 'loose',
      timeLimit,
      memoryLimit,
      subtasks
    });

    let rawResult: JudgeResult;
    try {
      rawResult = await currentHandle.promise;
    } finally {
      currentHandle = null;
    }

    return {
      public: this.processResult(rawResult, puzzle),
      hidden: this.proccessUnHiddenResult(rawResult, puzzle)
    };
  }

  public stop(): boolean {
    if (!currentHandle) {
      return false;
    }
    currentHandle.stop();
    currentHandle = null;
    return true;
  }

  private proccessUnHiddenResult(rawResult: JudgeResult, puzzle: Puzzle): JudgeRunResult {
    let totalCases = 0;
    let correctCount = 0;

    const processedSubtasks: JudgeTestCaseResult[][] = rawResult.subtasks.map(
      (subtaskResults, subtaskIdx) => {
        const subtaskDef = puzzle.subtasks[subtaskIdx];
        const visibleCount = subtaskDef?.visible?.length || 0;

        return subtaskResults.map((result, caseIdx) => {
          totalCases++;
          if (result.statusCode === 'AC') correctCount++;

          const isVisible = caseIdx < visibleCount;

          return {
            statusCode: result.statusCode,
            input: result.input,
            expectingOutput: result.expectingOutput,
            userOutput: result.userOutput,
            time: result.time
          };
        });
      }
    );

    return {
      subtasks: processedSubtasks,
      totalCases,
      correctCount
    };
  }

  private processResult(rawResult: JudgeResult, puzzle: Puzzle): JudgeRunResult {
    let totalCases = 0;
    let correctCount = 0;

    const processedSubtasks: JudgeTestCaseResult[][] = rawResult.subtasks.map(
      (subtaskResults, subtaskIdx) => {
        const subtaskDef = puzzle.subtasks[subtaskIdx];
        const visibleCount = subtaskDef?.visible?.length || 0;

        return subtaskResults.map((result, caseIdx) => {
          totalCases++;
          if (result.statusCode === 'AC') correctCount++;

          const isVisible = caseIdx < visibleCount;
          return {
            statusCode: result.statusCode,
            input: result.input,
            expectingOutput: result.expectingOutput,
            userOutput: isVisible ? result.userOutput : '',
            time: result.time
          };
        });
      }
    );

    return {
      subtasks: processedSubtasks,
      totalCases,
      correctCount
    };
  }
}

export const nodeJudgerService = NodeJudgerService.getInstance();
