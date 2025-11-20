import { app, shell, BrowserWindow, dialog } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import icon from '../../resources/icon.png?asset';
import setupAllIPC from './ipcHandler';
import { onAppQuit } from './ipcHandler';
import log from 'electron-log';
import { setMainWindow } from './windowsManager';

import pkg from 'electron-updater';
const { autoUpdater } = pkg;

autoUpdater.logger = log;
log.info('App starting...');

// 觸發更新檢查
const checkForUpdates = (): void => {
  autoUpdater.checkForUpdatesAndNotify();
};

autoUpdater.on('update-available', (info) => {
  log.info(`Update available. Version: ${info.version}`);
});

autoUpdater.on('update-not-available', (info) => {
  log.info(`Update not available. Version: ${info.version}`);
});

autoUpdater.on('error', (err) => {
  log.error('Error in auto-updater. ' + err.stack);
});

autoUpdater.on('update-downloaded', (info) => {
  log.info(`Update downloaded. Version: ${info.version}`);

  let releaseNotes: string;
  if (Array.isArray(info.releaseNotes)) {
    releaseNotes = info.releaseNotes.map((note) => note.note).join('\n');
  } else if (typeof info.releaseNotes === 'string') {
    releaseNotes = info.releaseNotes;
  } else {
    releaseNotes = info.releaseName || `Version ${info.version}`;
  }

  const dialogOpts: Electron.MessageBoxOptions = {
    type: 'info',
    buttons: ['重新啟動', '稍後'],
    title: '應用程式更新',
    message: '發現新版本',
    detail: `新版本 (${info.version}) 已經下載完成。請重新啟動以套用更新。\n\n更新內容：\n${releaseNotes}`
  };

  dialog.showMessageBox(dialogOpts).then((returnValue) => {
    if (returnValue.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
});

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
      allowRunningInsecureContent: true
    }
  });

  mainWindow.on('close', (e) => {
    const shouldWarn = true;

    if (shouldWarn) {
      // 1. 阻止視窗立即關閉
      e.preventDefault();

      // 2. 顯示同步原生對話框
      const choice = dialog.showMessageBoxSync(mainWindow, {
        type: 'warning',
        buttons: ['取消', '關閉'], // 按鈕選項
        defaultId: 0,
        title: '您尚未完成考試，請勿關閉這個程式！',
        message: '這個動作會影響到你的考試成績',
        detail: '如果您擅自關閉，系統會通知監考人員'
      });
      if (choice === 1) {
        mainWindow.destroy();
      }
    }
  });

  if (!is.dev) {
    mainWindow.once('ready-to-show', () => {
      checkForUpdates();
    });
    mainWindow.webContents.on('devtools-opened', () => {
      // 即使某些隱藏的呼叫嘗試開啟，也立即關閉它
      mainWindow.webContents.closeDevTools();
    });
    mainWindow.webContents.on('context-menu', (e) => {
      // 阻止右鍵選單彈出 (右鍵選單通常包含 'Inspect Element' 選項)
      e.preventDefault();
    });
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
    if (is.dev) {
      mainWindow.webContents.openDevTools();
    }
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('did-fail-load', (_, errorCode, errorDescription, validatedURL) => {
    log.error(`Failed to load: ${validatedURL}, Error: ${errorCode}, ${errorDescription}`);
  });

  mainWindow.webContents.on('render-process-gone', (_, details) => {
    log.error(`Renderer process gone: ${details.reason}`);
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
  setMainWindow(mainWindow);
}

app.whenReady().then(() => {
  setupAllIPC();
  // NewsSources();
  electronApp.setAppUserModelId('com.electron');

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  onAppQuit();
  if (process.platform !== 'darwin') {
    app.quit();
  }
  // else {
  //   app.quit();
  // }
});
