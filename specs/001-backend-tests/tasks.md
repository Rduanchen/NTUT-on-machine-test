---
description: "Task list for backend testing"
---

# Tasks: backend-tests

**Input**: Design documents from `/specs/001-backend-tests/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, quickstart.md

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 測試環境與 Coverage 工具設定

- [x] T001 安裝 `@vitest/coverage-v8` 依賴套件 (修改 `package.json`)
- [x] T002 修改 `vitest.config.ts` 以啟用分支覆蓋率 (Branch Coverage) 報表

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 準備所有 IPC 與 Service 測試所需的 Mock 環境

- [x] T003 建立 `test/setup.ts` 用於全域 mock `electron` 模組以及環境變數 (Environment variables)

**Checkpoint**: 基礎測試環境與 Mock 完成，可以開始平行開發單元/整合測試

---

## Phase 3: User Story 1 - 基礎設施服務測試 (Priority: P1)

**Goal**: 確保所有不具外部依賴的基礎 Service 都有單元測試，涵蓋率達 100%

**Independent Test**: 可以直接針對 `test/service/` 執行，確認通過並查看 coverage

### Implementation for User Story 1

- [x] T004 [P] [US1] 撰寫 `test/service/crypto.service.test.ts` 以測試加解密邏輯
- [x] T005 [P] [US1] 撰寫 `test/service/logger.service.test.ts` 以測試日誌記錄功能
- [x] T006 [P] [US1] 撰寫 `test/service/ramStore.service.test.ts` 以測試記憶體狀態管理
- [x] T007 [P] [US1] 補齊 `test/service/config.service.test.ts` 與 `special-rules.service.test.ts` 剩餘的邊界條件測試

**Checkpoint**: US1 相關服務皆達到 100% 分支覆蓋率

---

## Phase 4: User Story 3 - 核心評測服務測試 (Priority: P1)

**Goal**: 核心的評測引擎有 100% 分支覆蓋率的測試，以防堵超時或例外崩潰

**Independent Test**: 確認 mock 的 `child_process` 行為符合預期

### Implementation for User Story 3

- [x] T008 [P] [US3] 撰寫 `test/service/node-judger.service.test.ts` 以驗證 timeout kill 與執行結果解析
- [x] T009 [P] [US3] 撰寫 `test/service/judge-manager.service.test.ts` (核心排程邏輯) 補齊除 upload-gating 以外的所有涵蓋率
- [x] T010 [P] [US3] 撰寫 `test/service/localProgram.service.test.ts`

**Checkpoint**: 核心評測服務均能安全處理超時及檔案異常狀況

---

## Phase 5: User Story 2 - 外部連線與狀態服務測試 (Priority: P2)

**Goal**: 確保網路斷線或逾時的情境下系統能夠正確容錯

**Independent Test**: Mock Axios / Fetch，驗證 API 失敗重試邏輯

### Implementation for User Story 2

- [x] T011 [P] [US2] 撰寫 `test/service/api.service.test.ts` 以驗證連線行為
- [x] T012 [P] [US2] 撰寫 `test/service/connection.service.test.ts` 以測試網路狀態監控與斷線事件
- [x] T013 [P] [US2] 撰寫 `test/service/message-sync.service.test.ts` 驗證資料同步與佇列機制

**Checkpoint**: 網路斷線容錯機制已具備完整測試覆蓋

---

## Phase 6: User Story 4 - IPC 整合測試 (Priority: P2)

**Goal**: 確保所有 Electron 的 `ipcMain.handle` 與前端介面對接無誤

**Independent Test**: 呼叫 Mock 過的 IPC handle 並斷言其回傳或內部呼叫 Service 的正確性

### Implementation for User Story 4

- [x] T014 [P] [US4] 撰寫 `test/ipc/auth.ipc.test.ts` 測試登入與驗證路由
- [x] T015 [P] [US4] 撰寫 `test/ipc/config.ipc.test.ts` 測試組態讀寫路由
- [x] T016 [P] [US4] 撰寫 `test/ipc/judger.ipc.test.ts` 測試觸發評測與狀態同步路由
- [x] T017 [P] [US4] 撰寫 `test/ipc/log.ipc.test.ts` 測試遠端日誌紀錄路由
- [x] T018 [P] [US4] 撰寫 `test/ipc/notification.ipc.test.ts` 測試通知路由
- [x] T019 [P] [US4] 撰寫 `test/ipc/store.ipc.test.ts` 測試前端 Store 拉取資料路由

**Checkpoint**: 所有進程間通訊介面驗證完畢

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: 整體驗證與涵蓋率結算

- [ ] T020 執行 `quickstart.md` 所述的 `npm run test -- --coverage`，檢查所有 `src/main/services/` 與 `src/main/ipc/` 的分支覆蓋率是否均顯示 100%。若有遺漏，則回頭補齊測試。
- [ ] T021 確保測試時間落在 3 分鐘以內，並將 CI workflow 加入 coverage 驗證。

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 無依賴，必須先執行。
- **Foundational (Phase 2)**: 依賴 Setup，必須完成全域 mock 才能讓後續測試順利執行。
- **User Stories (Phase 3 ~ 6)**: 可視開發者量能平行執行。推薦先完成 US1 & US3 (P1)。
- **Polish (Phase 7)**: 依賴所有故事完成。

### User Story Dependencies

- 無互相依賴。US1 ~ US4 針對不同領域，可以被不同開發者同時領取實作。

### Parallel Opportunities

- 標記 `[P]` 的所有測試任務完全獨立，可由不同工具人/代理人平行處理。
- 可以一鍵利用 Vitest 平行跑所有服務的測試。
