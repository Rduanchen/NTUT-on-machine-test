import log, { LogMessage, Transport } from 'electron-log';
import { app } from 'electron';
import path from 'path';
import { logUserActionToServer } from './api';

const myServerTransport: Transport = ((msg: LogMessage) => {
  const logLevelsToSend = ['info', 'warn', 'error'];
  if (logLevelsToSend.includes(msg.level)) {
    updateLogToServer(msg);
  }
}) as Transport;

// 必須設定 level
myServerTransport.level = 'info';  // 你想要處理的最低等級

// transforms（如果你不需要轉換，可以給空陣列）
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
  
  // 添加自定義 server transport
  actionLogger.transports.myServer = myServerTransport;
  // bindConsoleToLogger();
  actionLogger.info('Logger 設定完成，warn 及以上級別將傳送至 server');
}

// 啟動時清空日誌檔案
function clearLogOnStartup() {
  try {
    // 呼叫客製化 Logger 實例的 clear() 方法清空檔案
    actionLogger.transports.file.getFile().clear();
    actionLogger.info('應用程式啟動，舊日誌內容已清除。');
  } catch (error) {
    actionLogger.error('清空日誌檔案時發生錯誤:', error);
  }
}

// 匯出客製化 Logger 實例和設定/清除函數
export { actionLogger, clearLogOnStartup, loggerSetup };