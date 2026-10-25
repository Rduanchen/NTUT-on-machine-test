# Contract: 裝置取卷與備卷狀態

## POST /user/exam/config（既有，host）

- 請求：既有裝置加密封包，device_uuid、iv、ciphertext、tag；解密內容含 timestamp、nonce。學生 session_token 可缺席，不應以缺少學生登入拒絕合法已註冊裝置。
- 驗證：正式模式依註冊金鑰驗證 GCM 完整性與 request schema，執行 replay protection；無註冊資格不得交付。回應前再次確認裝置金鑰未改、階段仍允許。
- 階段：保留 INITIALIZED、SETUP_FINISHED、IN_PROGRESS；UNINITIALIZED、FINISHED 拒絕。desktop 本功能的自動預載從 SETUP_FINISHED 開始。
- 一致性：meta/cipher 必須以單一儲存及單一讀取操作取得，禁止更新交錯導致混合兩份考卷。
- 成功：200，既有裝置 AES 加密回應；解密後嚴格符合 `{ meta, cipher }`。
- 失敗：維持既有 HttpError 格式；未註冊或失效資格為認證錯誤，封包格式不合法為請求錯誤，考卷未準備或取卷期間資格／階段變動為衝突。測試鎖定實作既有錯誤碼，避免無必要地更改所有既有 API 的錯誤慣例。
- 副作用：不登入學生、不註冊新裝置、不改考試階段、不授予人工核准、不包含解封後題目或 examKey。

## POST /user/exam/key（既有）

保持 IN_PROGRESS 及既有有效學生 session 等驗證要求。預載與其測試不得放寬條件；監考口令仍使用本機 wrappedExamKey 解封。

## desktop IPC（新增或擴充）

- `store:get-paper-preparation`：取得 PaperPreparationState 快照；與資料模型共用型別。
- `store:paper-preparation-changed`：主程序推播新的狀態與 revision，renderer 忽略較舊 revision。
- `config:prepare-paper`：人工重試，回傳既有 IpcResponse；仍由主程序檢查階段與裝置資格，不接受 renderer 指定考卷、身分、金鑰或跳過條件。
- UI：登入頁與等待頁顯示「尚未取得／取得中／離線考卷已備妥／取得失敗」；ERROR(true) 顯示已備妥舊卷及更新失敗。環境檢查是獨立顯示。

## Compatibility

維持考卷形狀與既有 fixtures，只有本機 IPC 擴充；host 變更不得要求學生先登入。兩端 schema 與 fixture 比對須共同通過。無管理端 API 變更。
