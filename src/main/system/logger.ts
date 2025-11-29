import log, { LogMessage, Transport } from 'electron-log';
import { app } from 'electron';
import path from 'path';
import { logUserActionToServer } from '../api';
import fs from 'fs';

const myServerTransport: Transport = ((msg: LogMessage) => {
  const logLevelsToSend = ['info', 'warn', 'error'];
  if (logLevelsToSend.includes(msg.level)) {
    updateLogToServer(msg);
  }
}) as Transport;
myServerTransport.level = 'info';
myServerTransport.transforms = [];

async function updateLogToServer(logInfo) {
  const payload = {
    level: logInfo.level,
    timestamp: logInfo.date.toISOString(),
    message: logInfo.text,
    details: logInfo.data
  };
  await logUserActionToServer(payload);
}

const actionLogger = log.create({ logId: 'ActionLogger' });

const isDev = !app.isPackaged;
let logPath;
if (isDev) {
  logPath = path.join(process.cwd(), 'main.log');
} else {
  logPath = path.join(app.getPath('userData'), 'main.log');
}


function loggerSetup() {
  actionLogger.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
  actionLogger.transports.file.resolvePathFn = () => {
    return logPath;
  };
  actionLogger.transports.file.level = 'info';
  actionLogger.transports.file.maxSize = 5 * 1024 * 1024; // 檔案大小上限 5MB
  actionLogger.transports.myServer = myServerTransport;
  console.info("Logger setup complete. Log file at:", logPath);
}

// 啟動時清空日誌檔案
function clearLogOnStartup() {
  try {
    actionLogger.transports.file.resolvePathFn = () => {
      return logPath;
    };
    fs.writeFileSync(logPath, '');
    actionLogger.info('應用程式啟動，舊日誌內容已清除。');
  } catch (error) {
    actionLogger.error('清空日誌檔案時發生錯誤:', error);
  }
}


export { loggerSetup, clearLogOnStartup, actionLogger };