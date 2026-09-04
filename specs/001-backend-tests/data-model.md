# Test Structure / Domain Groupings

雖然此任務並未引入新的資料庫模型，但將測試目標分類，有助於後續分批實作。

## 1. 基礎設施層 (Infrastructure)
無需複雜外部 Mock，重點在於邏輯的精確度。
- `crypto.service`
- `logger.service`
- `ramStore.service`
- `special-rules.service` (部分已完成)
- `config.service` (部分已完成)

## 2. 網路與通訊層 (Networking & Sync)
重點在於連線失敗、Timeout 等邊界條件。
- `api.service`
- `connection.service`
- `message-sync.service`

## 3. 核心評測層 (Execution Engine)
重點在於時間複雜度限制、記憶體限制及無限迴圈的擊殺。
- `judge-manager.service`
- `node-judger.service`
- `localProgram.service`

## 4. IPC 路由層 (Integration)
重點在於參數校驗與回傳格式。
- `auth.ipc`, `config.ipc`, `judger.ipc`, `log.ipc`, `notification.ipc`, `store.ipc`
