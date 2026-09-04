# Phase 0 Research: 考前執行環境自我檢查

## 1. 使用正式判題命令與執行語意

**Decision**: profile 以 `SupportedLanguage` 為鍵，映射現有判題語言設定並使用同一組 command／args 生成邏輯；預檢使用低階 Judge/runner，不使用 `nodeJudgerService.judge()`。

**Rationale**: 現有語言設定已處理 Windows `.exe`、Windows Python、Java `javac` 與 `java` 的不同命令。正式 service 會儲存程式檔、special rule 與成績結果，不能用於診斷。此設計使工具鏈修改只需在單一 canonical 設定調整。

**Alternatives considered**:

- 為預檢重複硬編碼命令：拒絕，正式判題與預檢將漂移。
- 只跑版本命令：拒絕，不能證明編譯、執行或資源限制。
- 用假題目呼叫正式 service：拒絕，會污染學生資料。

## 2. Config 寫入與非同步閘門

**Decision**: 建立 shared async config orchestration；每一個已驗證 config 來源都呼叫它。流程先將 config 寫入 RAM、立即標記 report 為 RUNNING，再等待當前檢查完成後才釋放登入流程；FAILED 會顯示需明確處置的警告，但助教可知情繼續。

**Rationale**: config 目前來自上傳檔、首次伺服器取得及 socket refresh。RAM listener 是同步且會吞掉 listener 例外，不能承擔可等待的控制流程。先寫入 RAM 保持「config 寫入時開始驗證」語意，亦讓 UI 可識別本次所需語言。

**Alternatives considered**:

- 在 `ramStore.on('examConfig')` 非同步檢查：拒絕，無法可靠 await，且可能與導航競爭。
- 每個 config write site 各自實作檢查：拒絕，容易漏掉 socket refresh。
- 所有檢查通過前不存 config：拒絕，違反 config 寫入 RAM 即驗證且降低錯誤報告可用性。

## 3. TLE 與 MLE 診斷方式

**Decision**: 每種語言使用固定、無使用者輸入的三支診斷程式：預定 token 的 smoke、無輸出的 CPU 無限迴圈 TLE、保留且實際觸碰記憶體區塊的 MLE。語言按序執行，只有 runner 明確分類 TLE／MLE 時通過。

**Rationale**: runner 已有 timeout、pidusage RSS 監控、output cap 與跨平台程序樹 kill。固定限制不受考試題目資源設定影響，避免超大 memory limit 將診斷本身變成風險。runtime 自己 OOM 的 RE 不能證明 runner 的 MLE 機制可用。

**Alternatives considered**:

- 使用題目 time/memory limit：拒絕，變動大且可能危害考場機器。
- 會輸出的無限迴圈：拒絕，可能先得到 OLE。
- 使用 sleep loop：拒絕，不能有效確認 CPU 執行與 timeout 路徑。

## 4. 跨平台及 MLE 風險

**Decision**: 採每語言可調的安全 memory ceiling 與 headroom，特別為 Java 保留較高 baseline；診斷不產生子程序；透過 release/CI 的 Windows、macOS、Linux 真實 runtime suite 驗證 smoke/TLE/MLE。

**Rationale**: runner 目前量測 spawned PID RSS；JVM baseline 和 runtime 自行 OOM 可能導致 RE。Windows 使用 taskkill，Unix 使用 process group；Python 在 Windows 也可能解析到 Store alias，只有 smoke 能發現。真實 compiler/runtime 不能成為一般 Vitest 的必要依賴。

**Alternatives considered**:

- 所有語言採同一 MLE ceiling：拒絕，runtime baseline 差異容易假失敗。
- 在 routine unit test 真實跑五種工具：拒絕，開發／CI 環境會不穩定。

## 5. UI、IPC 與設定更新

**Decision**: 主程序持有 latest report，透過專用 IPC 提供讀取、重跑與事件訂閱。App root 使用 persistent dialog 顯示失敗，提供重新檢查與明確忽略風險兩種處置；system bar 在 server status 附近顯示真實狀態並開啟 report。socket config update 比較語言集合：未變則保留通過結果；改變才跑新檢查，且不將已進行考試的學生導離頁面。

**Rationale**: renderer 不能安全地起 child process；App 是跨頁可見 system bar 及 force-dialog 的自然位置。socket refresh 現在會 rejudge stored programs，重跑壓力診斷會競爭資源，需以語言集合避免無效重跑。

**Alternatives considered**:

- renderer polling：拒絕，modal 與 button 需要即時、可信狀態。
- 每次 socket update 都重跑：拒絕，可能在考試中造成資源干擾。
- config update 失敗立即踢出已登入考生：拒絕，違反規格且破壞進行中的作答。

## 6. 測試策略

**Decision**: Vitest 用 injectable runner/probe 測試 coordinator 的去重、失敗、重試、取消、過期結果與 config source；IPC 與 UI mapping 採既有 mock 模式。真實 runtime suite 作為分平台選用驗收，特別驗證 Java MLE 與 process cleanup。

**Rationale**: constitution 要求 main process 有完整 Vitest coverage，但 compiler availability 是外部條件。將 orchestration 與 platform process adapter 隔離能產生穩定單元測試；真實 suite 補足 mock 無法證明的工具鏈行為。

**Alternatives considered**:

- 只測 UI：拒絕，無法驗證判題語意及競爭條件。
- 只測 service 而省略 IPC／route：拒絕，無法保證檢查中仍會等待，或失敗後能按設計知情繼續。
