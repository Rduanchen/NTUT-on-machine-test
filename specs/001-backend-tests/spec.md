# Feature Specification: backend-tests

**Feature Branch**: `[001-backend-tests]`

**Created**: 2026-08-05

**Status**: Draft

**Input**: User description: "把後端的 service 所有的東西都補上完整的測試，確保穩定性以及邊界的狀況都沒有問題，同時確保 ipc 呼叫的東西都做過整合測試"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 基礎設施服務測試 (Priority: P1)

作為一名開發者，我希望所有不具外部依賴的基礎 Service (如 `crypto`, `logger`, `ramStore`) 都有單元測試，以便確保系統最核心的邏輯是堅不可摧的。

**Why this priority**: 基礎設施是所有上層服務的地基，如果有潛在 Bug 會導致整個系統崩潰。

**Independent Test**: 可以透過獨立執行基礎 Service 的單元測試來驗證，不需要 mock 網路或檔案系統。

**Acceptance Scenarios**:

1. **Given** 基礎 Service 執行邊界條件操作時，**When** 餵入異常參數，**Then** 系統能正確捕捉錯誤或回傳預設值。

---

### User Story 2 - 外部連線與狀態服務測試 (Priority: P2)

作為一名開發者，我希望負責連線與同步的 Service (如 `api`, `connection`, `message-sync`) 都有完整的測試，確保網路斷線或逾時的情境下系統能夠容錯。

**Why this priority**: 呼應專案的「離線容錯與最終一致的單一真相」根公理，必須嚴格保證斷線重連機制的正確性。

**Independent Test**: 透過 Mock 網路請求來驗證 API 重試與狀態機的行為。

**Acceptance Scenarios**:

1. **Given** 系統處於斷線狀態，**When** 嘗試發送同步請求，**Then** 請求會被推入離線佇列並等待重新連線。

---

### User Story 3 - 核心評測服務測試 (Priority: P1)

作為一名開發者，我希望核心的評測引擎 (如 `judge-manager`, `node-judger`) 有 100% 分支覆蓋率的測試，以涵蓋學生的惡意程式碼或無限迴圈導致的系統崩潰。

**Why this priority**: 評測引擎是考試系統的心臟，容錯率為 0。

**Independent Test**: 使用 mock 的檔案系統與 child_process 來驗證 Timeout kill 機制。

**Acceptance Scenarios**:

1. **Given** 學生程式碼會陷入無限迴圈，**When** 交由 Judger 執行，**Then** Judger 必須能在超時限制到達時強制擊殺該 Process 並回傳 Time Limit Exceeded。

---

### User Story 4 - IPC 整合測試 (Priority: P2)

作為一名開發者，我希望所有 Electron 的 `ipcMain.handle` 都有對應的整合測試，確保前端呼叫與後端處理的介面一致，且不會因為型別錯誤而失敗。

**Why this priority**: 確保前端 UI 與後端服務溝通無礙。

**Independent Test**: 透過 mock Electron 模組，驗證所有 IPC 路由的註冊與執行。

**Acceptance Scenarios**:

1. **Given** 前端發送一個非法的 payload，**When** 觸發 IPC handle，**Then** 後端應該能安全地攔截並回傳錯誤訊息，而不會造成 Main Process 崩潰。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 測試環境必須在 `vitest.config.ts` 引入 `@vitest/coverage-v8` 以啟用覆蓋率報告。
- **FR-002**: `src/main/services/` 目錄下的所有服務，其測試分支覆蓋率 (Branch Coverage) 必須達到 100%。
- **FR-003**: 必須對 `src/main/ipc/` 內的所有模組撰寫整合測試，模擬前端的調用。
- **FR-004**: 所有牽涉到底層環境 (如 `child_process`, `fs`, `axios/fetch`, `WebSocket`) 的服務，必須使用 mock 進行隔離測試。

### Key Entities

- **Test Suite**: 負責執行所有的測試案例並產出 Coverage 報告。
- **Service Layer**: 專案的後端業務邏輯層。
- **IPC Handlers**: Electron 的進程間通訊路由。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 覆蓋率報告顯示所有後端 Service 達成 100% 分支覆蓋。
- **SC-002**: 所有的 IPC 路由都至少被一個整合測試所覆蓋。
- **SC-003**: 測試在一般開發機上的執行總時間小於 3 分鐘，確保能快速進行 CI/CD 驗證。

## Assumptions

- 開發者會使用 Vitest 作為唯一的後端測試框架。
- IPC 的整合測試不需要啟動真正的 Electron 視窗，而是透過 Mock Electron API 的方式進行。
