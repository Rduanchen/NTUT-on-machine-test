import { ipcMain } from 'electron';
import { verifyStudentIDFromServer } from '../api';
import { actionLogger } from '../system/logger';
import { store } from './store';

export class StoreIpcManager {
  public static setup() {
    // 讀取測試結果
    ipcMain.handle('store:get-server-availability', () => {
      return store.getServerAvailability();
    });

    ipcMain.handle('store:read-test-result', async () => {
      return store.getTestResult();
    });

    // 取得題目資訊 (只回傳前端需要的欄位)
    ipcMain.handle('store:get-puzzle-info', () => {
      const config = store.getConfig();
      return config.puzzles.map((puzzle) => {
        return { id: puzzle.id, name: puzzle.name, language: puzzle.language };
      });
    });

    // 更新學生資訊 (包含驗證邏輯)
    ipcMain.handle('store:update-student-information', async (_event, newInfo: any) => {
      const config = store.getConfig();

      let response = await verifyStudentIDFromServer(newInfo.studentID);
      console.warn('Server verification response:', response);
      if (response == 'offline') {
        const userFound = config.accessableUsers.find((user) => user.id === newInfo.studentID);

        if (userFound) {
          store.updateStudentInformation(userFound);
          store.setStudentVerified(true);
          return { success: true };
        }

        actionLogger.error('Error verifying student ID');
        return { success: false, message: 'Error verifying student ID' };
      }

      if (response?.data.isValid === true) {
        store.updateStudentInformation(response.data.info);
        store.setStudentVerified(true);
      } else {
        return { success: false, message: 'Student ID not found' };
      }

      actionLogger.info('Student information updated:', newInfo);
      store.setStudentVerified(true);
      return { success: true };
    });

    // 檢查學生是否已驗證
    ipcMain.handle('store:is-student-info-verified', async () => {
      return store.isStudentVerified();
    });

    // 讀取學生資訊
    ipcMain.handle('store:read-student-information', async () => {
      return store.getStudentInformation();
    });

    // 取得測試基本資訊
    ipcMain.handle('config:get-test-info', async () => {
      const config = store.getConfig();
      return {
        testTitle: config.testTitle,
        description: config.description,
        testTime: config.testTime
      };
    });
  }
}
