import fs from 'fs';
import { ramStore } from './ramStore.service';
import { localProgramStore } from './localProgram.service';
import {
  evaluateSpecialRules,
  getEffectiveSpecialRules,
} from './special-rules.service';
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

  public async judge(
    puzzleId: string,
    codeFilePath: string
  ): Promise<{ public: JudgeRunResult; hidden: JudgeRunResult }> {
    const config = ramStore.examConfig;
    if (!config) throw new Error('ExamConfig not loaded');

    let puzzle: Puzzle | undefined;
    if (config.sections && config.sections.length > 0) {
      puzzle = config.sections.flatMap(s => s.puzzles).find((p, idx) => (p.id ?? String(idx)) === puzzleId);
    } else if (config.puzzles) {
      puzzle = config.puzzles.find((p, idx) => (p.id ?? String(idx)) === puzzleId);
    }

    if (!puzzle) throw new Error(`Puzzle not found with ID: ${puzzleId}`);

    const extension = getExtensionForLanguage(puzzle.language);
    const storedPath = localProgramStore.addFile(puzzleId, extension, codeFilePath);
    const codeString = fs.readFileSync(storedPath, 'utf-8');

    // Evaluate special rules immediately (student should see PASS/FAIL right after submit)
    let specialRuleResults: any[] = [];
    try {
      const effectiveRules = getEffectiveSpecialRules({
        examConfig: config,
        puzzleId,
      });
      specialRuleResults = evaluateSpecialRules({
        rules: effectiveRules,
        language: puzzle.language,
        sourceText: codeString,
      });
      ramStore.setSpecialRuleResults(puzzleId, specialRuleResults);
    } catch (e: any) {
      // Defensive: don't break judging even if rule evaluation fails.
      specialRuleResults = [
        {
          ruleId: '__engine_error__',
          passed: false,
          message: 'Special rule evaluation failed',
          reason: e?.message ?? String(e),
          checkedAt: new Date().toISOString(),
        },
      ];
      ramStore.setSpecialRuleResults(puzzleId, specialRuleResults);
    }

    const judgerSettings = config.judgerSettings || {};
    const timeLimit = puzzle.timeLimit ?? judgerSettings.timeLimit ?? 5000;
    const memoryLimitMB = puzzle.memoryLimit ?? judgerSettings.memoryLimit ?? 128; // fallback to 128MB
    
    // Auto-detect if memory limit was entered in bytes instead of MB
    // If it's > 10240 (10 GB), it's highly likely they meant bytes.
    let memoryLimitBytes = Math.floor(memoryLimitMB * 1024 * 1024);
    if (memoryLimitMB > 10240) {
      memoryLimitBytes = Math.floor(memoryLimitMB);
    }

    const compareMode = judgerSettings.compareMode || 'loose';

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
      defaultMemoryLimit: memoryLimitBytes
    });

    currentHandle = judge.run({
      language: mapLanguage(puzzle.language),
      codeString,
      compareMode,
      timeLimit,
      memoryLimit: memoryLimitBytes,
      subtasks
    });

    let rawResult: JudgeResult;
    try {
      rawResult = await currentHandle.promise;
    } finally {
      currentHandle = null;
    }

    const finalPublic = this.processResult(rawResult, puzzle);
    const finalHidden = this.proccessUnHiddenResult(rawResult, puzzle);

    // Evaluate scores to determine if this is the highest score
    try {
      const globalRules = config.globalSpecialRules || [];
      const currentScore = this.calculateScore(puzzle, finalHidden, specialRuleResults, globalRules);
      
      const prevHighestHidden = ramStore.highestHiddenTestResults[puzzleId];
      const prevHighestSR = ramStore.highestSpecialRuleResults[puzzleId];
      const prevHighestScore = prevHighestHidden 
        ? this.calculateScore(puzzle, prevHighestHidden, prevHighestSR || [], globalRules)
        : -1;

      if (currentScore >= prevHighestScore) {
        // Update highest results in ramStore
        ramStore.setHighestTestResult(puzzleId, finalPublic);
        ramStore.setHighestHiddenTestResult(puzzleId, finalHidden);
        ramStore.setHighestSpecialRuleResults(puzzleId, specialRuleResults);
        
        // Save the highest score code file
        localProgramStore.saveHighestScoreFile(puzzleId, extension, codeFilePath);
      }
    } catch (err) {
      console.error('Failed to calculate and update highest score:', err);
    }

    return {
      public: finalPublic,
      hidden: finalHidden
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

  private calculateScore(puzzle: Puzzle, result: JudgeRunResult, specialRuleResults: any[], globalRules: any[]): number {
    let score = 0;
    if (puzzle.subtasks && puzzle.subtasks.length > 0) {
      for (let i = 0; i < puzzle.subtasks.length; i++) {
        const subtask = puzzle.subtasks[i];
        const subtaskResult = result.subtasks[i];
        if (subtaskResult && Array.isArray(subtaskResult) && subtaskResult.every((c: any) => c.statusCode === 'AC')) {
          score += (subtask.score || 0);
        }
      }
    } else {
      let passed = 0;
      let total = 0;
      if (result.subtasks) {
        total = result.subtasks.length;
        for (const subtaskCases of result.subtasks) {
          if (Array.isArray(subtaskCases) && subtaskCases.every((c: any) => c.statusCode === 'AC')) {
            passed++;
          }
        }
      }
      const rate = total > 0 ? (passed / total) : 0;
      score = (puzzle.score || 0) * rate;
    }

    let multiplier = 1.0;
    const esr = puzzle.specialRules || [];
    if (specialRuleResults) {
      for (const res of specialRuleResults) {
        if (!res.passed) {
          const rule = esr.find((r: any) => r.id === res.ruleId) || globalRules?.find((r: any) => r.id === res.ruleId);
          if (rule && rule.multiplier !== undefined) {
            multiplier *= rule.multiplier;
          }
        }
      }
    }

    return Math.floor(score * multiplier);
  }

  private proccessUnHiddenResult(rawResult: JudgeResult, puzzle: Puzzle): JudgeRunResult {
    let totalCases = 0;
    let correctCount = 0;

    const processedSubtasks: JudgeTestCaseResult[][] = rawResult.subtasks.map(
      (subtaskResults, subtaskIdx) => {
        const subtaskDef = puzzle.subtasks[subtaskIdx];
        void subtaskDef;

        return subtaskResults.map((result) => {
          totalCases++;
          if (result.statusCode === 'AC') correctCount++;

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
