# Tasks: 考前預載加密考卷

**Input**: [spec.md](spec.md)、[plan.md](plan.md)、[research.md](research.md)、[data-model.md](data-model.md)、[contracts/paper-delivery.md](contracts/paper-delivery.md)、[quickstart.md](quickstart.md)

**Tests**: FR-010 明確要求跨端驗證，憲法要求主程序測試；以下包含服務、IPC、正式加密 HTTP 與配對測試。先補測並確認能辨識現有缺陷，再實作；既有已滿足的條件保留回歸斷言，不要求其刻意失敗。

**Organization**: 依使用者故事分階段；實作進度如下；已完成自動驗證的任務標示 [X]，真機驗收保持未完成。

## Format & Path Conventions

- 格式為 `- [ ] Tnnn [P?] [USn?] 描述與檔案路徑`；[P] 是滿足列出的共同前置條件後可並行的工作，不表示可以跳過前置任務。
- `desktop/` = `/Users/justinchen/Documents/ntut-exam-v2/desktop`；`host/` = `/Users/justinchen/Documents/ntut-exam-v2/host`。文件中的所有程式與測試路徑均相對於上述共同父目錄。
- 標示「新增」的路徑須建立，其餘為現有檔案。不新增套件、資料庫表、管理端儀表板或跨重啟考卷保存。
- 兩端實作前各建 feature branch；不重置、不覆蓋既有未提交修改。任務間只在檔案互不衝突且相依已滿足時並行。

## Phase 1: Setup

**Purpose**: 確認兩端工作基線與共同交付範圍。

- [X] T001 依兩端現有工作樹與分支建立或選用 `feat/` 功能分支，讀取適用的 agent guidelines 與 host knowledge，將 branch/base commit、未提交變更及範圍記錄於 `desktop/specs/003-prefetch-exam-config/plan.md`；禁止提交到 main/develop 或覆寫使用者變更。
- [X] T002 確認 `host/scripts/check-contract-fixture.sh`、`host/backend/test/fixtures/exam-config-payload.fixture.json` 與 `desktop/test/fixtures/exam-config-payload.fixture.json` 的既有契約及測試入口，執行兩端針對性基線檢查並將既有失敗記錄於 `desktop/specs/003-prefetch-exam-config/quickstart.md`，不把既有紅燈當成本功能驗證通過。

## Phase 2: Foundational

**Purpose**: 共用記憶體狀態、作業有效範圍及狀態讀取介面；完成後才進入故事實作。

- [X] T003 在 `desktop/test/service/ramStore.service.test.ts` 補上備卷初始狀態、revision 單調遞增、reset／backend 更換／cryptoState 清除或換鑰使 generation 失效的測試，驗證同一金鑰只更新學生 session 不會誤清考卷。
- [X] T004 在 `desktop/src/common/types.ts` 依 data-model 定義 PaperPreparationState discriminated union；IDLE 無卷、READY 有卷、FETCHING/ERROR 可保留有效卷，error 只包含可公開的 code/message，補入既有主程序狀態型別。
- [X] T005 在 `desktop/src/main/services/ramStore.service.ts` 實作備卷狀態、revision 與主程序內 generation；整合初始化、reset、backend 與裝置金鑰變動的失效清除，維持環境預檢與學生登入狀態各自獨立，使 T003 通過。
- [X] T006 在 `desktop/test/ipc/store.ipc.test.ts` 補上 `store:get-paper-preparation` 快照與 `store:paper-preparation-changed` 推播測試，確認 reset 也推播、不洩漏考卷／名單／金鑰，以及視窗不存在時不拋錯。
- [X] T007 在 `desktop/src/main/ipc/store.ipc.ts`、`desktop/src/preload/index.ts` 與 `desktop/src/preload/index.d.ts` 實作型別安全的備卷快照及可取消訂閱事件，使用 T004 共用型別，使 T006 通過；此步不新增人工重試 handler。

**Checkpoint**: 共用狀態與只讀 IPC 可用，所有自動取卷仍待 US1 接入。

## Phase 3: US1 — 準備完成後可離線登入與開考 (P1, MVP)

**Goal**: 不先登入學生，在 SETUP_FINISHED 備妥加密考卷，拔線後以合法學號及監考口令開考。

**Independent Test**: 全新已註冊 session 在準備完成取得考卷；確認未解封，拔線後合法學號及正確口令能讀題，錯誤口令及名單外學號遭拒。以 T018 配對測試及 quickstart 主要情境驗證。

### Tests

- [X] T008 [P] [US1] 在 `host/backend/test/unit/services/exam.service.test.ts` 與 `host/backend/test/integration/controllers/user/user.controller.test.ts` 補上無 student session 的正式加密取卷成功、未註冊／損毀 GCM／錯誤封包／逾時或重放 nonce／考卷不存在／不合法階段拒絕，以及回覆前換鑰、移除註冊或 reset 的交付拒絕案例。
- [X] T009 [P] [US1] 在 `desktop/test/service/config.service.test.ts` 補上未登入已註冊裝置取得完整封存考卷、未解封前 examConfig 為 null、錯誤 payload 不套用、未註冊或未允許階段不自動取卷、延遲結果 scope 檢查及同 scope single-flight 測試。
- [X] T010 [P] [US1] 在 `desktop/test/ipc/auth.ipc.test.ts` 與 `desktop/test/ipc/config.ipc.test.ts` 補上預載後斷網登入名單內學生、錯誤口令不開考／不損毀封存考卷、正確口令可解封與名單外學生拒絕的回歸案例；確認備卷不授予學生驗證或變更考試階段。
- [X] T011 [P] [US1] 在 `host/backend/test/integration/controllers/user/user-exam-key.controller.test.ts` 與 `host/backend/test/unit/middlewares/exam-phase.middleware.test.ts` 鎖定 key 僅 IN_PROGRESS 且既有合法學生認證可取，config 保留 INITIALIZED/SETUP_FINISHED/IN_PROGRESS 的原有階段矩陣。
- [X] T012 [P] [US1] 新增 `desktop/test/integration/paper-delivery.test.ts` 配對測試：透過隔離的 host 測試 HTTP app 與註冊裝置金鑰發出真實加密取卷，將回應交由 desktop 生產解碼／驗證／套用路徑處理，再停用網路存取驗證正確口令可解封、錯誤口令不可解封；沿用兩端 fixture，不以 mocked config 回應代替跨端交付。測試 app 如需共用 harness，新增 `host/backend/test/helpers/paper-delivery-app.ts`，不可啟動正式資料庫或使用正式考場金鑰。

### Implementation

- [X] T013 [P] [US1] 在 `host/backend/src/services/exam.service.ts` 收斂 getSecureConfig 的正式裝置驗證至既有 authenticateRegisteredDevice，schema 驗證 meta/cipher，回應前重查裝置金鑰與允許階段，於 `host/backend/src/services/system-settings.service.ts` 新增原子成對讀寫並接入初始化／更新／離線匯出，維持 nonce/time 驗證、原有 HttpError 慣例及負載測試模式隔離；審核 `host/backend/src/controllers/user/user.controller.ts`、`host/backend/src/routes/user/user-exam.route.ts`，確保不以可選 decryptedBody 繞過必要驗證且不新增學生 session 要求，使 T008/T011 通過。
- [X] T014 [P] [US1] 在 `desktop/src/main/services/config.service.ts` 實作統一 ensure／fetch 入口，捕捉 backend、裝置金鑰與 T005 generation，合併相同 scope 請求，驗證後僅在仍有效且階段允許時同步套用 meta/cipher；舊 finally 不能清新作業；更新備卷狀態，預載不抓開考金鑰、不改登入資格或離線模式，使 T009 通過。
- [X] T015 [US1] 在 `desktop/src/main/services/message-sync.service.ts` 接入 SETUP_FINISHED 的階段變更預載；保留 IN_PROGRESS 原本解封路徑，捕捉非同步錯誤，取卷不觸發尚未開封考卷的重評測；在 `desktop/test/service/message-sync.service.test.ts` 驗證 Socket 與狀態輪詢的階段變更皆會觸發且 INITIALIZED 不新增自動預載。
- [X] T016 [US1] 新增 `desktop/src/renderer/composables/usePaperPreparation.ts` 與 `desktop/src/renderer/components/PaperPreparationStatus.vue`，使用先訂閱／revision 排序的狀態快照，卸載時取消訂閱；於 `desktop/src/renderer/pages/LoginPage.vue`、`desktop/src/renderer/pages/WaitingForExamPage.vue` 接入未取得／取得中／已備妥／失敗的基本顯示，並於 `desktop/src/renderer/locales/zh.json`、`desktop/src/renderer/locales/en.json` 提供文字，與環境預檢分開呈現。
- [X] T017 [US1] 執行 T008–T012 及 T015 測試和兩端型別檢查，確認 `desktop/src/main/ipc/auth.ipc.ts` 的既有網路失敗備援及 `desktop/src/main/services/config.service.ts` 的 startWithPassword 可直接使用預載資料；若測試揭示缺口，僅修正這兩檔的必要整合，記錄結果於 `desktop/specs/003-prefetch-exam-config/quickstart.md`。
- [X] T018 [US1] 依 `desktop/specs/003-prefetch-exam-config/quickstart.md` 完成 US1 的獨立配對驗證，記錄未登入先取卷、封存狀態、拔線後合法登入與口令解封，以及錯誤口令／名單拒絕的結果；需真機的 10 次重複驗收可延至 T039，但未執行不得標示已通過。

**Checkpoint**: US1 可獨立展示。MVP 為階段推進後正常連線備妥再拔線；完整發布仍須 US2/US3 及最終驗收。

## Phase 4: US2 — 漏接事件與暫時失敗可自行恢復 (P1)

**Goal**: 初始階段已是準備完成、晚核准、重連或暫時下載失敗時，均能不經學生登入自行補抓。

**Independent Test**: 在 SETUP_FINISHED 才啟動並取得人工核准，第一次下載失敗，網路恢復後 65 秒內備妥；多觸發不重複下載，既有考卷在更新失敗時仍能離線解封。

### Tests

- [X] T019 [P] [US2] 在 `desktop/test/service/message-sync.service.test.ts` 補上初始公開狀態已是 SETUP_FINISHED、狀態未變的後續輪詢、漏接 Socket 及失敗後下輪補抓；確認已有有效卷的普通 ensure 不重抓，config_update 與 force refresh 走統一下載入口。
- [X] T020 [P] [US2] 在 `desktop/test/ipc/auth.ipc.test.ts` 與 `desktop/test/service/connection.service.test.ts` 補上晚註冊／人工核准後立即補抓、恢復連線自動備卷、pendingConfigRefresh 真正重抓且失敗保留待重試意圖，以及備卷失敗不阻斷 pendingLoginSync／待送工作補同步的測試。
- [X] T021 [P] [US2] 在 `desktop/test/service/config.service.test.ts` 補上登入後重抓與更新失敗保留 meta/cipher、isConfigured 與 hasUsablePaper，並發 ensure/refresh 合併、失敗後能再發請求，以及尚未完成下載即斷網不能憑口令開考的測試。

### Implementation

- [X] T022 [US2] 在 `desktop/src/main/services/config.service.ts` 統一處理初次下載及更新錯誤；僅無有效卷時維持不可用，更新失敗保留原卷與 ERROR(true)，保存 requested/completed 刷新意圖、下載中收到新更新則補抓，成功後清錯誤；確保 fetchAndSaveConfig 不再因背景失敗無條件設 isConfigured=false，使 T021 通過。
- [X] T023 [US2] 在 `desktop/src/main/services/message-sync.service.ts` 讓初始同步與每次成功讀取目前階段後均做適用的 ensure（即使階段未變）；將 refreshConfigFromServer/config_update/forceConfigRefresh 改接統一入口並保留成功更新後的必要重評測及版本旗標語意，使 T019 通過。
- [X] T024 [US2] 在 `desktop/src/main/ipc/auth.ipc.ts` 完成裝置合法註冊後觸發冪等備卷，處理先得知階段後取得資格與人工核准重試路徑；失敗不得抹除成功註冊、冒充登入成功或撤銷人工核准，使 T020 的註冊案例通過。
- [X] T025 [US2] 在 `desktop/src/main/services/connection.service.ts` 接入恢復連線 ensure 及 pendingConfigRefresh 真正刷新，只有成功才清刷新意圖，失敗可再試且不阻擋其他補同步；以既有 60 秒輪詢補抓而不新增高頻 timer，使 T020 的重連案例通過。
- [X] T026 [US2] 於 `desktop/test/service/message-sync.service.test.ts` 與 `desktop/test/service/connection.service.test.ts` 用受控時鐘驗證暫時錯誤解除後最多 60 秒觸發下一次補抓、已得知階段且註冊仍有效、取卷在 5 秒請求時限內成功時，可在 65 秒驗收窗口內備妥，同時註冊／同步／重連不重複發相同 scope 請求，且已有卷時一般輪詢不下載。
- [X] T027 [US2] 依 `desktop/specs/003-prefetch-exam-config/quickstart.md` 驗證晚啟動核准、漏接事件、暫時下載失敗、重連與更新失敗後離線開考的獨立情境，記錄自動測試及可執行的配對結果，不將尚待真機的案例誤標完成。

**Checkpoint**: US2 可在不需重新切換階段的情況下備妥考卷，保留 US1 的離線開考能力。

## Phase 5: US3 — 清楚辨識備卷狀態並避免舊資料混入 (P2)

**Goal**: 加入可理解錯誤與人工重試，並驗證所有生命週期清除路徑拒收舊結果。

**Independent Test**: 已通過環境預檢但取卷失敗時，畫面明確顯示尚未備妥；手動重試可恢復；延遲取卷期間 reset、換 backend、force_logout 或換鑰後放行舊回覆均無法恢復舊卷。

### Tests

- [X] T028 [P] [US3] 在 `desktop/test/ipc/config.ipc.test.ts`、`desktop/test/ipc/store.ipc.test.ts` 補上 `config:prepare-paper` 人工重試合約、未註冊／非法階段不得跳過條件、回傳 IpcResponse 及錯誤不含敏感內容的測試。
- [X] T029 [P] [US3] 新增 `desktop/test/renderer/paper-preparation.test.ts`，使用現有 Vitest 可用環境測試 composable 的快照／事件亂序、revision、訂閱清理與重試錯誤處理；若現有環境無 Vue mount 支援，測試抽出的純狀態邏輯並將實際元件呈現列入 T035，不為此引入套件。
- [X] T030 [P] [US3] 在 `desktop/test/service/config.service.test.ts` 與 `desktop/test/service/message-sync.service.test.ts` 補延遲 Promise 案例，交叉驗證 reset、backend A→B→A、force_logout、清除／換鑰、舊 finally 與新作業重疊；新 ensure 及舊 refresh 路徑皆不得套用舊資料，且 reset 後 revision 不倒退。

### Implementation

- [X] T031 [US3] 在 `desktop/src/main/ipc/config.ipc.ts`、`desktop/src/preload/index.ts` 與 `desktop/src/preload/index.d.ts` 實作 `config:prepare-paper` 及公開型別，呼叫主程序統一入口；不接受 renderer 傳入資格、金鑰或任意 payload，對完全離線匯入模式維持既有流程，使 T028 通過。
- [X] T032 [US3] 在 `desktop/src/renderer/composables/usePaperPreparation.ts` 與 `desktop/src/renderer/components/PaperPreparationStatus.vue` 完成人工重試、點擊中禁用、ERROR(true) 有效舊卷加更新失敗的顯示，以及快照／推播 revision 排序；於 `desktop/src/renderer/locales/zh.json`、`desktop/src/renderer/locales/en.json` 補上可理解的原因與重試文字，使 T029 通過。
- [X] T033 [US3] 審核並補齊 `desktop/src/main/services/ramStore.service.ts`、`desktop/src/main/services/message-sync.service.ts`、`desktop/src/main/services/config.service.ts` 的 reset／force_logout／切換 backend／清換 cryptoState 失效整合；使用 T005 generation 丟棄所有舊成功、舊失敗及 finally，不讓它們污染新狀態，使 T030 通過。
- [X] T034 [US3] 在 `desktop/test/service/offline-config.test.ts` 與 `desktop/test/service/config.service.test.ts` 驗證離線檔案匯入亦會正確呈現備妥、環境預檢失敗與備卷成功可同時存在，reset 清除敏感卷／金鑰；以既有生命週期確認關閉後無持久化恢復，不新增磁碟保存。
- [ ] T035 [US3] 依 `desktop/specs/003-prefetch-exam-config/quickstart.md` 走查登入／等待頁所有狀態、有效舊卷更新失敗、重試、環境結果獨立呈現及舊回覆隔離；量測完成／失敗後 1 秒內畫面更新並記錄結果。

**Checkpoint**: 三個故事皆可獨立驗證，備卷顯示不會混淆環境預檢或已失效的考卷。

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T036 [P] 更新 `host/EXAM-LIFECYCLE.md` 的 SETUP_FINISHED 取卷、無學生 session 交付、合法核准與金鑰分離說明；註明已備妥後的離線登入與關閉 app 的限制，避免暗示 host 新版能替舊 desktop 補齊預載。
- [X] T037 [P] 執行 `host/scripts/check-contract-fixture.sh` 對應的 `pnpm test:contract-fixture`，核對 `host/backend/test/fixtures/exam-config-payload.fixture.json` 與 `desktop/test/fixtures/exam-config-payload.fixture.json`；只有契約資料真的變動才同步兩端 fixture，將執行結果記錄於 `desktop/specs/003-prefetch-exam-config/quickstart.md`。
- [X] T038 執行 `desktop/package.json` 的 typecheck、所有本功能服務／IPC／renderer 邏輯／配對測試，以及 `host/backend/package.json` 的 test（含測試型別檢查）與 build；修正本功能造成的失敗，另列既有缺口，將確切命令、結果與配對 commit 記錄於 `desktop/specs/003-prefetch-exam-config/quickstart.md`。
- [ ] T039 依 `desktop/specs/003-prefetch-exam-config/quickstart.md` 完成隔離考場真機驗收：四種補抓情境各 5 次、備妥後斷網登入及口令開考 10 次、錯誤口令／名單拒絕、65 秒恢復、1 秒畫面更新與三類失效回覆；另回歸正常線上開考、IN_PROGRESS 重入、離線匯入及恢復連線補同步。缺乏真機或必要外部條件時記錄缺項並保持此任務未勾選。
- [ ] T040 審查兩端 diff 確認未新增考前金鑰暴露、敏感日誌／磁碟保存、身分或人工核准繞過，核對 FR/SC 全部證據後更新 `desktop/specs/003-prefetch-exam-config/spec.md`、`desktop/specs/003-prefetch-exam-config/plan.md` 與本 `desktop/specs/003-prefetch-exam-config/tasks.md` 的實際完成狀態；文件審查不得代替自動或真機驗收。

## Dependencies & Execution Order

### Phase dependency graph

```text
Setup T001–T002
  → Foundation T003–T007
  → US1 T008–T018 (MVP)
  → US2 T019–T027
  → US3 T028–T035
  → Final T036–T040
```

三個故事共用 config/message-sync/ramStore，不宣稱能整個故事同時修改；依優先順序逐步擴充，每階段有獨立驗收。US2/US3 的測試設計可提早準備，但整合採上述順序。US3 的基本失效原語已在 Foundation／US1 完成，其故事階段負責完整入口覆蓋及 UI 錯誤復原。

### Task prerequisites

| 任務 | 前置條件 |
| --- | --- |
| T002 | T001 |
| T003 → T004 → T005 | Setup 完成，依序建立測試、型別、狀態 |
| T006 → T007 | T005，依序補 IPC 測試及實作 |
| T008–T012 | Foundation 完成；這五組測試可並行準備 |
| T013 / T014 | 對應失敗測試 T008–T011 完成後可分 host/desktop 並行實作 |
| T015 | T014 |
| T016 | T015，使用 T007 IPC；本步建立狀態元件 |
| T017 → T018 | T012–T016 完成，依序整合與獨立驗收 |
| T019–T021 | US1 完成；三組測試可並行準備 |
| T022 → T023 → T024 → T025 | US2 測試完成後依序整合，避免相同服務呼叫契約漂移 |
| T026 → T027 | T022–T025 完成 |
| T028–T030 | US2 完成；三組測試可並行準備 |
| T031 → T032 → T033 → T034 → T035 | US3 測試完成後依序實作與驗證 |
| T036 / T037 | US3 完成後可並行：一個更新 host 生命週期，另一個比對 fixture 並記錄 quickstart |
| T038 → T039 → T040 | T036/T037 完成後，依序自動檢查、真機驗收、交付審查 |

### Parallel examples per story

- **US1**：Foundation 完成後，同時準備 T008 的 host 取卷測試、T009 的 desktop config 測試、T010 的離線登入測試、T011 的金鑰邊界與 T012 的配對 harness；測試就緒後 T013 host 實作可與 T014 desktop 下載實作並行。T008 與 T012 如需共用測試 harness，先確立 helper 介面，避免同時修改同一檔案。
- **US2**：US1 完成後，T019 修改 message-sync 測試、T020 修改 auth/connection 測試、T021 修改 config 測試，三者互不修改相同檔案；後續整合按 T022–T027 順序。
- **US3**：US2 完成後，T028 的 IPC 測試、T029 的 renderer 邏輯測試、T030 的 config/message-sync 競態測試可並行準備；實作遵循 T031–T035，避免 preload、元件與失效路徑競爭修改。

以上描述僅是工作可並行性，不會自動啟動子代理。

## Requirement Coverage

| Requirement | 主要任務 |
| --- | --- |
| FR-001 | T009, T014–T018 |
| FR-002 | T019–T020, T023–T027 |
| FR-003 | T008–T015, T017–T018 |
| FR-004 | T010, T017–T018, T020, T025, T039 |
| FR-005 | T006–T007, T016, T028–T032, T035 |
| FR-006 | T009, T014, T021–T023, T025–T026 |
| FR-007 | T003–T005, T009, T014, T030, T033–T035 |
| FR-008 | T008, T011, T013 |
| FR-009 | T011, T013, T038 |
| FR-010 | T002, T012, T017–T018, T037–T039 |
| FR-011 | T005, T034, T036, T040 |
| SC-001 | T027, T039 |
| SC-002 | T018, T039 |
| SC-003 | T026, T035, T039 |
| SC-004 | T030, T033, T035, T039 |
| SC-005 | T010–T012, T017–T018, T039–T040 |

## Implementation Strategy

1. **MVP first**：完成 Setup、Foundation 與 US1，展示「準備完成預載 → 斷網 → 學號 → 口令 → 可讀題目」。MVP 不宣稱晚啟動、重連或完整復原已驗收。
2. **Incremental delivery**：US2 補漏接／恢復，US3 補完整提示、人工重試與失效情境；每個故事完成後跑其獨立驗收及既有故事回歸。
3. **Paired release**：兩端型別、單元、HTTP、配對測試與真機驗收完成後才宣告可共同部署；本任務清單不包含發布、合併或操作真實考場。
4. **Completion discipline**：僅在交付結果與驗證證據存在時勾選任務；受外部條件限制的真機項目保持未完成，清楚區分文件審查、自動測試及現場驗收。

## Execution Notes (2026-10-25)

- T003/T009/T021/T030 的核心測試集中於 `desktop/test/service/paper-preparation.test.ts`，搭配既有服務與 IPC 測試；T012 helper 實際為 `host/backend/test/helpers/paper-delivery-server.ts`（以既有 ts-node 執行且型別檢查開啟）。
- T018/T027 已完成自動配對及觸發／復原測試；不代表完成實體網路拔線的重複次數，該部分仍由 T039 追蹤。
- T035 未完成：已測試狀態排序、訂閱清理、重試錯誤與防重點擊；尚未在 Electron 真實視窗走查所有狀態及量測 1 秒可見更新。
- T039 未完成：目前環境可停止隔離 host 模擬連線失效，但不能替代考場機器的實體拔線與 20／10 次重複驗收。
- T040 尚未整體結案：已審查程式差異及自動驗證證據，最終需求／成功條件簽核等待 T035/T039。
