# Implementation Plan: 考前預載加密考卷

**Branch**: desktop `feat/003-prefetch-exam-config`；host `feat/prefetch-exam-config`。 | **Date**: 2026-10-25 | **Spec**: [spec.md](spec.md)

**Input**: `specs/003-prefetch-exam-config/spec.md`

## Summary

在 SETUP_FINISHED 時，已註冊裝置不經學生登入即可預載 `{ meta, cipher }`。desktop 統一處理階段、註冊、同步及重連觸發，備卷成功後學生可在斷網下登入並用口令開考。host 保持原有裝置層級交付契約，補強回應前資格與階段檢查及跨端測試。已實作兩端程式碼，自動驗證結果見 quickstart；真機驗收未完成。

## Technical Context

**Language/Version**: TypeScript；desktop 使用 TS ^5.5.2、Vue ^3.4.30，host backend 使用 TS ^5.9.3、Node >=20.19.0（package.json 宣告範圍）。
**Primary Dependencies**: Electron 34、Vue 3、Vuetify、Axios、Socket.IO；host Express 4、Sequelize、Zod 3；desktop Zod 4。
**Storage**: desktop ramStore 記憶體；host 沿用 SystemSettings 與 DeviceKeyMap。無新增持久化表。
**Testing**: desktop Vitest 3；host Vitest 4、Supertest、測試型別檢查；現有跨 repo fixture 比對。
**Target Platform**: 現有桌面支援平台及 host Node.js 服務。
**Project Type**: 跨 repository desktop app + web service。
**Performance Goals**: 每個裝置至多一個有效備卷請求在途；輪詢補抓沿用 60 秒週期；暫時錯誤解除後 65 秒內完成備卷的受控驗收。
**Constraints**: 考卷只留 RAM；考前不取開考金鑰；不繞過人工核准及學生認證；reset 不得被舊回覆覆蓋；不新增依賴。
**Scale/Scope**: 同一考場已註冊機器；不定義未有依據的最大機器數，不新增管理端儀表板。

## Constitution Check

*Phase 0 與 Phase 1 文件審查均通過；以下是設計要求，不表示實作驗證已通過。*

- Type safety：網路資料以 unknown 進入 schema；新增狀態用 discriminated union；host 的本功能交付路徑移除依賴 any 的新設計。
- Async/concurrency：非阻塞下載、同一註冊範圍 single-flight、沿用既有同步節奏；取卷不觸發未開封考卷的評測。
- Branching：目前僅文件變更，無 commit；兩端實作前建立 feature branch，禁止直接提交 develop/main。
- Security/stability：保留加密、nonce/timestamp、階段及裝置身分驗證；金鑰端點政策不變；資格變更即作廢舊下載。
- Testing：變動主程序服務具 Vitest 測試，host 同時做型別及 HTTP 整合測試，配對驗收證明跨端可用。
- Offline/compensation：沿用離線學號、監考口令與 pendingLoginSync；新的備卷狀態不切換 isOfflineMode。
- host knowledge：遵守人工核准、防作弊、跨 repo fixture 與密文／金鑰分離原則。

## Project Structure

### Documentation (this feature)

```text
specs/003-prefetch-exam-config/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── checklists/requirements.md
└── contracts/paper-delivery.md
```

### Source Code (repository roots)

```text
desktop/
  src/main/services/{config,message-sync,connection,ramStore}.service.ts
  src/main/ipc/{auth,config,store}.ipc.ts
  src/common/types.ts
  src/preload/index.ts
  src/renderer/pages/{LoginPage,WaitingForExamPage}.vue
  src/renderer/locales/{zh,en}.json
  test/service/  test/ipc/  test/fixtures/
host/
  backend/src/services/exam.service.ts
  backend/src/controllers/user/user.controller.ts
  backend/src/routes/user/user-exam.route.ts
  backend/src/middlewares/exam-phase.middleware.ts
  backend/test/unit/services/exam.service.test.ts
  backend/test/integration/controllers/user/
  scripts/check-contract-fixture.sh
  EXAM-LIFECYCLE.md
```

**Structure Decision**: 功能規格統一存放 desktop；實作涵蓋上述兩個真實 repo。host frontend 無必要變更。不複製另一套規格；host 既有四個未提交修改檔案均保留，未覆寫其內容。

## Implementation Sequence

1. **host 交付契約與防護（FR-008/009/010）**：將 `/user/exam/config` 的正式驗證路徑收斂到既有 `authenticateRegisteredDevice`，保留必要的測試負載模式隔離；回傳前確認裝置金鑰仍相同、階段仍允許，驗證 meta/cipher 的資料結構。不存在考卷、錯誤封包或失效裝置均不得回傳成功。補測無 student session 的合法取卷及所有拒絕分支。保留現有 INITIALIZED/SETUP_FINISHED/IN_PROGRESS 端點允許範圍；金鑰仍只在 IN_PROGRESS 且合法學生認證後釋出。同步更新生命週期說明。
2. **desktop 統一備卷（FR-001/002/006/007）**：由 configService 負責單一下載入口及 operation generation。meta/cipher 先完整驗證，再在仍有效的 generation 下同步套用；失敗不將既有有效資料標成未設定。所有既有取卷路徑（含 message-sync 的更新）需經同一防護，避免繞路覆寫。
3. **觸發與補抓（FR-002/004）**：在階段進入 SETUP_FINISHED、註冊成功後、每次成功取得目前階段後（即使狀態未變）及連線恢復時呼叫冪等 ensure。只有 cryptoState/hasEverRegistered 均有效且階段適用才自動發出；已有考卷時不重抓，除非更新或手動刷新。IN_PROGRESS 沿用原有解封路徑。失敗由下一次同步、重連或手動重試補救；修正目前 pendingConfigRefresh 只清旗標而未實際抓取的路徑。
4. **生命週期隔離（FR-007）**：reset、切換 backend、force_logout、清除或更換 cryptoState 都遞增 generation 並清除相應狀態；舊 finally 也不能清掉新作業的 in-flight 標記。取卷準備不能修改學生身分、階段或授予人工核准。
5. **狀態及畫面（FR-005）**：ramStore 新增備卷狀態，經 store IPC 快照及事件提供 preload 的型別安全介面，登入與等待頁共用精簡顯示及重試。先訂閱再讀快照或採 revision 排序，避免漏接事件；失敗與有效舊考卷可同時表達。不將完整 config 傳給 renderer 作為備卷狀態。
6. **配對驗收（FR-003/004/010/011）**：以現有 fixture 驗證 host 回應被 desktop 接收並可在離線使用正確口令解封；跑服務／IPC／型別檢查後，走真實拔線與延遲回覆情境。只在改動契約資料時同步兩端 fixture，始終執行既有 fixture 比對。

## Validation & Delivery

依 [quickstart.md](quickstart.md) 執行；驗收結果附於後續實作 PR。文件審查與測試執行結果分開記錄。host 與 desktop 使用配對版本發布；舊桌面端仍有本次缺陷，即使 host 新版也不會自動補齊預載。

本功能不加入新的考卷版本協定；連線中已知的 config_update 會重抓，離線無法確認是否有新修訂。任何跨重啟保留或全班備卷監控均需另行規劃。

## Implementation Decisions & Analysis Remediation

- U1：統一下載 operation 具有 requested/completed 計數；下載中收到 force refresh 會再抓一次，失敗保留差額供普通輪詢重試。只有對應更新下載成功才清除意圖。原有 message-sync refreshing guard 已移除，避免吞掉更新。
- U2：SystemSettingsService.savePreparedPaper 以 SQLite 單一 bulk upsert 同時寫入兩列；getPreparedPaper 以單一 SELECT 讀取兩列，再做 schema 驗證。初始化、重發及離線匯出均使用此介面，沒有新增資料表或版本協定。
- A1：65 秒是已知階段、註冊仍有效、後續取卷在 5 秒內成功的受控上限；每 60 秒獨立嘗試備卷，不等待消息／狀態同步。晚啟動仍先取得階段及人工核准。
- I1：RAM-only 限定 desktop；host 沿用既有資料庫存放考卷與金鑰。
- 測試配置：大部分新增主程序測試集中在 test/service/paper-preparation.test.ts； renderer 測試以 Vue 自訂 renderer 驗證 composable 生命週期，無新增 DOM 套件。配對測試使用 host/test helper 的獨立子程序、正式加密驗證與 in-memory SQLite，停止 host 後測試真正 API 連線失敗的登入備援。
- 工作基線：desktop 470c570、host 53fc627。開始時 desktop 僅有本功能規格與 feature pointer 變更；host 的 user.controller.ts、device.service.ts 及各自測試已有未提交變更。本次未提交、合併或發布。
