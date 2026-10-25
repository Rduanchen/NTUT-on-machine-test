# Research: 考前預載加密考卷

本研究只依據兩個 repo 的程式碼、測試與專案知識，無外部套件選型；無待解決技術未知項。

## Decision 1: 以 SETUP_FINISHED 啟動必要預載

**Decision**: 以原始需求的準備完成階段為自動備卷基準，含晚到裝置補抓。
**Rationale**: `message-sync.service.ts:onPhaseChanged` 目前只處理 IN_PROGRESS；`auth.ipc.ts` 只在登入成功後明確 fetchAndSaveConfig。現有環境預檢改用 `/exam/languages`，因此預檢通過不代表持有考卷。
**Alternatives considered**: INITIALIZED 一律立即下載可更早備妥，但使用者尚未選定，暫不擴大必要時點；僅搬動登入後呼叫則仍漏掉啟動／核准晚於狀態變更的情況。

## Decision 2: 沿用 host 的裝置層級取卷

**Decision**: 不新增取卷端點；補強現有正式驗證路徑並添加配對測試。
**Rationale**: `host/backend/src/routes/user/user-exam.route.ts` 的 `/config` 無學生 session middleware；`ExamService.getSecureConfig` 已透過 decryptDevicePayload 驗證加密、nonce/timestamp，回傳 `{meta,cipher}`。現有 `authenticateRegisteredDevice` 已具 schema 驗證；`getLanguages` 已有回應前檢查裝置金鑰與階段的範例可延用。不能把「需要改 host」解讀成放寬金鑰釋出。
**Alternatives considered**: 新公開端點會增加重複契約；要求學生先登入直接違背離線前未輸入學號的需求。

## Decision 3: 分離備卷、環境與認證狀態

**Decision**: 備卷以獨立 RAM 狀態及 IPC 顯示；isConfigured 保留既有有效資料語意，不直接當載入中／失敗狀態。
**Rationale**: `config.service.ts:fetchAndSaveConfig` 目前在下載錯誤時設 isConfigured=false，可能把仍有效的考卷視為未取得；`ramStore` 與既有環境預檢報告已有不同責任。
**Alternatives considered**: 複用環境報告會讓語言檢查與密文交付產生錯誤等價；增加 renderer 全域 store 違反既有主程序單一狀態來源。

## Decision 4: 一個請求入口與 generation 防護

**Decision**: configService 統一抓取與套用；以 backend、註冊金鑰及 lifecycle generation 校驗回覆，reset 或資格失效即作廢。依現有輪詢週期補抓，不另建高頻 timer。
**Rationale**: message-sync 目前有自己的 refreshConfigFromServer，connection 的 pendingConfigRefresh 分支未實際抓取。只保護新入口會留下舊入口覆寫漏洞；只在 phase changed 執行會漏掉階段未變但剛註冊的機器。
**Alternatives considered**: 僅 AbortController 不足以排除已抵達的延遲回覆；每個事件獨立下載會在全班切換時重複請求。

## Decision 5: 維持 RAM 範圍與原有離線登入政策

**Decision**: 關閉 app 即失去考卷；不改名單空值政策，不切換 isOfflineMode。保留 pendingLoginSync 的重連補登入。
**Rationale**: desktop AGENT.md 明定敏感考卷不得持久化；`auth.ipc.ts` 已有已註冊機器的網路失敗備援及名單檢查；`startWithPassword` 已可使用 meta.wrappedExamKey 開卷。
**Alternatives considered**: 寫磁碟能支援離線重開，但超出本次範圍與現有規則。
