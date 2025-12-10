import { ipcMain } from 'electron';
import { store } from '../store/store';
import { runPythonTestsAPI, stopProgram } from './pyJudger';
import { LocalProgramStore } from '../localProgram';
import { sendTestResultToServer } from '../api';

export class CodeJudger {
  public static setup() {
    ipcMain.handle('judger:judge', async (event, questionId: string, codeFilePath: string) => {
      console.log(
        `Received judge request for questionId: ${questionId}, codeFile path: ${codeFilePath}`
      );
      let config = store.getConfig();
      let puzzle = config.puzzles.filter((puzzle) => puzzle.id === questionId)[0];
      let result = await this.judgeCode(questionId, codeFilePath);
      store.appendTestResult(questionId, result);
      result = this.maskTheTestResults(result, puzzle.testCases);
      LocalProgramStore.addFile(codeFilePath, `${questionId}`);
      sendTestResultToServer();
      console.warn('Judging complete. Result:', result);
      const isHigher = this.ifScoreHigherThanPrevious(questionId, result);
      console.log(`Judging complete. Is score higher than previous? ${isHigher}`);
      if (true) {
        LocalProgramStore.syncToBackend();
      }
      event.sender.send('judger:judge-complete', result);
      return result;
    });
    ipcMain.handle('judger:force-stop', async () => {
      await stopProgram();
      return { success: true };
    });
  }
  private static async judgeCode(questionId: string, codeFilePath: string) {
    let config = store.getConfig();
    let puzzle = config.puzzles.filter((puzzle) => puzzle.id === questionId)[0];
    switch (puzzle.language) {
      case 'python':
        return await runPythonTestsAPI(codeFilePath, puzzle.testCases);
      case 'Python':
        return await runPythonTestsAPI(codeFilePath, puzzle.testCases);
      default:
        throw new Error('Unsupported language');
    }
  }
  private static maskTheTestResults(results: any, testDefinitions: any) {
    const openIds = new Set<string>();
    for (const group of testDefinitions) {
      if (group.openTestCases) {
        for (const test of group.openTestCases) {
          openIds.add(test.id);
        }
      }
    }

    const maskedResults = JSON.parse(JSON.stringify(results)); // 深拷貝
    for (const group of maskedResults.groupResults) {
      for (const testResult of group.testCasesResults) {
        // 如果 ID 不在白名單中 (即不是公開案例)，則遮罩輸出
        if (!openIds.has(testResult.id)) {
          testResult.userOutput = '';
        }
      }
    }

    return maskedResults;
  }
  private static ifScoreHigherThanPrevious(id: string, newResult: any): boolean {
    const previousResult = store.getTestResult()[id];
    console.warn('Previous Result:', previousResult);
    if (!previousResult) {
      console.warn('No previous result found, marking as higher.');
      store.updateResultHigherThanPrevious(true);
      return true;
    }
    if (newResult.correctCount > previousResult.correctCount) {
      store.updateResultHigherThanPrevious(true);
      return true;
    }
    return false;
  }
}
