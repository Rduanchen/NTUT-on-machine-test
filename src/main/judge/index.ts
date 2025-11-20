import { ipcMain } from "electron";
import { readConfig, appendTestResult } from '../local-store/runTimeStore';
import { runPythonTestsAPI, stopProgram } from "./pyJudger";
import { LocalProgramStore } from "../localProgram";
// import { LocalProgramStore } from "../localProgram";
import { sendTestResultToServer } from "../api";

export class CodeJudger {
  public static setup() {
    ipcMain.handle(
      "judger:judge",
      async (event, questionId: string, codeFilePath: string) => {
        console.log(
          `Received judge request for questionId: ${questionId}, codeFile path: ${codeFilePath}`
        );
        let config = readConfig();
        let puzzle = config.puzzles.filter(
          (puzzle) => puzzle.id === questionId
        )[0];
        let result = await this.judgeCode(questionId, codeFilePath);
        result = this.maskTheTestResults(result, puzzle.testCases);
        appendTestResult(questionId, result);
        LocalProgramStore.addFile(codeFilePath, `${questionId}`);
        sendTestResultToServer();
        event.sender.send("judger:judge-complete", result);
        return result;
      }
    );
    ipcMain.handle("judger:force-stop", async () => {
      await stopProgram();
      return { success: true };
    });
  }
  private static async judgeCode(questionId: string, codeFilePath: string) {
    let config = readConfig();
    let puzzle = config.puzzles.filter((puzzle) => puzzle.id === questionId)[0];
    switch (puzzle.language) {
      case "python":
        return await runPythonTestsAPI(codeFilePath, puzzle.testCases);
      case "Python":
        return await runPythonTestsAPI(codeFilePath, puzzle.testCases);
      default:
        throw new Error("Unsupported language");
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
