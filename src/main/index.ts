import { app, shell, BrowserWindow, dialog } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import icon from '../../resources/icon.png?asset';
import { registerAllIpc } from './ipc/index.ipc';
import { setMainWindow } from './system/windowManager';
import { logger, setupLogger, clearLogOnStartup } from './services/logger.service';
import { configService } from './services/config.service';
import { connectionService } from './services/connection.service';
import { localProgramStore } from './services/localProgram.service';
import { ramStore } from './services/ramStore.service';

clearLogOnStartup();
setupLogger();

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    minWidth: 800,
    height: 900,
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
    logger.warn('User attempted to close the main window during an active test.');
    e.preventDefault();

    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      buttons: ['取消[cancel]', '關閉[close]'],
      defaultId: 0,
      title: '您尚未完成考試，請勿關閉這個程式！[Do not close the application]',
      message: '這個動作會影響到你的考試成績 [This action will affect your test results]',
      detail:
        '如果您擅自關閉，系統會通知監考人員 [If you close it unauthorized, the system will notify the proctor]'
    });
    if (choice === 1) {
      mainWindow.destroy();
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
    logger.error(`Failed to load: ${validatedURL}, Error: ${errorCode}, ${errorDescription}`);
  });

  mainWindow.webContents.on('render-process-gone', (_, details) => {
    logger.error(`Renderer process gone: ${details.reason}`);
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
  setMainWindow(mainWindow);
}

app.whenReady().then(async () => {
  logger.info('Application Started');

  // Register all IPC handlers
  registerAllIpc();

  // Try to load config from pre_settings.json
  await configService.initFromPreSettings();

  electronApp.setAppUserModelId('com.ntut-exam');
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });
  createWindow();
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  logger.info('Application On Quit');
  connectionService.stop();
  localProgramStore.deleteTempDir();
  ramStore.clear();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
