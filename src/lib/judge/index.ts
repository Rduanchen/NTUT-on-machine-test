import { ipcMain } from "electron";
import { readConfig, appendTestResult } from "../runTimeStore";
import { runPythonTestsAPI, stopProgram } from "./pyJudger";
import { LocalProgramStore } from "../localProgram";
const config = readConfig();

export class CodeJudger {
  constructor() {
    ipcMain.handle(
      "judger:judge",
      async (_event, questionId: string, codeFile: File) => {
        console.log(
          `Received judge request for questionId: ${questionId}, codeFile path: ${codeFile.path}`
        );
        let result = await this.judgeCode(questionId, codeFile);
        let puzzle = config.puzzles.filter(
          (puzzle) => puzzle.id === questionId
        )[0];
        result = await this.maskTheTestResults(result, puzzle.testCases);
        appendTestResult(questionId, result);
        return result;
      }
    );
    ipcMain.handle("judger:force-stop", async () => {
      await stopProgram();
      return { success: true };
    });
  }
  private async judgeCode(questionId: string, codeFile: File) {
    let puzzle = config.puzzles.filter((puzzle) => puzzle.id === questionId)[0];
    switch (puzzle.language) {
      case "python":
        return await runPythonTestsAPI(codeFile.path, puzzle.testCases);
      case "Python":
        return await runPythonTestsAPI(codeFile.path, puzzle.testCases);
      default:
        throw new Error("Unsupported language");
    }
  }
  private async maskTheTestResults(results: any, testDefinitions: any) {
    const openIds = new Set<string>();
    for (const group of testDefinitions) {
      if (group.openTestCases) {
        for (const test of group.openTestCases) {
          openIds.add(test.id);
        }
      }
    }

    // 2. 迭代並遮罩輸出
    const maskedResults = JSON.parse(JSON.stringify(results)); // 深拷貝
    for (const group of maskedResults.groupResults) {
      for (const testResult of group.testCasesResults) {
        // 如果 ID 不在白名單中 (即不是公開案例)，則遮罩輸出
        if (!openIds.has(testResult.id)) {
          testResult.userOutput = "";
        }
      }
    }

    return maskedResults;
  }
}
