import log from 'electron-log';
import { app } from 'electron';
import path from 'path';

function updateLogToServer(logInfo) {
  const payload = {
    level: logInfo.level,
    timestamp: logInfo.date.toISOString(),
    message: logInfo.text,
    details: logInfo.data
  };
  console.log('Prepared log payload for server:', payload);
}

const actionLogger = log.create({ logId: 'ActionLogger' });

const isDev = !app.isPackaged;
let logPath;
if (isDev) {
  logPath = path.join(process.cwd(), 'main.log');
} else {
  logPath = path.join(app.getPath('userData'), 'main.log');
}

function bindConsoleToLogger() {
  console.log = actionLogger.info.bind(actionLogger);
  console.info = actionLogger.info.bind(actionLogger);
  console.warn = actionLogger.warn.bind(actionLogger);
  console.error = actionLogger.error.bind(actionLogger);
  console.debug = actionLogger.debug.bind(actionLogger);
  actionLogger.info('原生 Console 方法已綁定至 customLogger，所有 console 訊息將被捕獲。');
}

function loggerSetup() {
  // 設定檔案 transport
  // const formatDate = (date: Date) => {
  //   // return date.toISOString(); 
  //   return date.toLocaleString('zh-TW', { hour12: false });
  // };

  actionLogger.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';

  actionLogger.transports.file.resolvePathFn = () => {
    return logPath;
  };
  actionLogger.transports.file.level = 'info';
  actionLogger.transports.file.maxSize = 5 * 1024 * 1024; // 檔案大小上限 5MB
  
  // 添加自定義 server transport
  (actionLogger.transports as any).server = {
    level: 'warn', // 只傳送 warn 及以上級別
    transforms: [],
    log: (logMessage) => {
      updateLogToServer(logMessage);
    }
  };
  
  bindConsoleToLogger();
  
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