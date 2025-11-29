import { app, shell, BrowserWindow, dialog } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import icon from '../../resources/icon.png?asset';
import setupAllIPC from './ipcHandler';
import { onAppQuit } from './ipcHandler';
import log from 'electron-log';
import { setMainWindow } from './system/windowsManager';
import { loggerSetup, clearLogOnStartup, actionLogger } from './system/logger';
import { store } from './store/store';

clearLogOnStartup();
loggerSetup();

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 900,
    minWidth: 800,
    height: 670,
    minHeight: 600,
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
      actionLogger.warn('User attempted to close the main window during an active test.');
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
    }
  });

  if (!is.dev) {
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow.webContents.closeDevTools();
    });
    mainWindow.webContents.on('context-menu', (e) => {
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
  actionLogger.info('Application Started');
  setupAllIPC();
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
  actionLogger.info('Application On Quit');
  onAppQuit();
  if (process.platform !== 'darwin') {
    app.quit();
  }
  // else {
  //   app.quit();
  // }
});
