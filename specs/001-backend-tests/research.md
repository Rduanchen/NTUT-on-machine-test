# Research: Testing Strategies for Electron Backend

## Decision 1: 覆蓋率計算工具 (Coverage Tooling)
- **Decision**: 使用 `@vitest/coverage-v8`。
- **Rationale**: 原生整合於 Vitest，效能極高，且預設即可提供清晰的分支 (Branch)、語句 (Statement) 與函數 (Function) 覆蓋率報表。
- **Alternatives considered**: Istanbul (c8)。V8 的執行速度較快且為 Vitest 官方推薦的預設。

## Decision 2: 隔離與 Mock Electron IPC
- **Decision**: 建立全域的 Electron 模組 Mock (利用 `vi.mock('electron')`)，在內部實作一個簡易的 Event Emitter。
- **Rationale**: 要測試 `ipcMain.handle` 註冊的邏輯，不需要啟動真實的 Electron 視窗（過於緩慢）。透過 Mock `ipcMain`，我們可以直接在測試中觸發對應的 channel。
- **Alternatives considered**: Playwright 或 WebdriverIO。這些適合 E2E 測試，但針對後端介面邏輯，單元/整合測試的速度更理想。

## Decision 3: 隔離底層評測環境 (Child Process & FS)
- **Decision**: 使用 `vi.mock('child_process')` 與 `vi.mock('fs')` (或 `memfs`)。
- **Rationale**: `node-judger` 等核心評測邏輯涉及讀寫檔案與開 Process。我們需要能「瞬間」模擬超時 (timeout kill) 或是「模擬無限輸出」，用 Mock 才能 100% 掌握極端狀況的覆蓋。
