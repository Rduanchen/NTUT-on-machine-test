# Data Model

## 現有封存考卷

沿用 `examConfigPayloadSchema` 的 `{ meta, cipher }`；meta 具有既有名單及 wrappedExamKey，cipher 為 `{ iv, ciphertext, tag }`。傳輸封包再由裝置 AES 金鑰加密；兩層用途不同，不改格式。解封後仍須通過既有 secret 與合併 schema。

## 本機 PaperPreparationState（新增，RAM only）

型別以 discriminated union 表達，實作時放在 `src/common/types.ts`：

| 欄位／變體 | 語意與限制 |
| --- | --- |
| status | IDLE / FETCHING / READY / ERROR |
| hasUsablePaper | 目前 generation 是否有完整已驗證考卷；不等於可讀題目 |
| error | 僅 ERROR 具有已過濾的 code/message，不含密文、金鑰或名單 |
| revision | 單調增加的本機狀態版本，用於快照與推播排序 |

IDLE 時 hasUsablePaper=false；READY 時為 true；FETCHING/ERROR 可以為 true，表示更新尚未完成或失敗但舊卷仍可用。舊卷不能在 reset、伺服器切換或資格失效後繼續標示可用。相同伺服器離線時無法確認遠端是否已有新版，不承諾最新版本。

## DownloadScope（主程序內部）

- generation：reset、backend 變更或 cryptoState 清除／換鑰時遞增。
- backendUrl、device AES key identity：請求開始時快照，只留主程序，不進 IPC／日誌。
- inFlight：該 scope 的 Promise 及識別；finally 僅清除自己，不能清除新 scope 的作業。
- requested/completed：已知刷新意圖與已成功取得的批次計數；失敗保留差額，下載中新增意圖在同一作業內補抓，generation 改變後歸零。

套用回覆前須同時確認 scope 仍相同、裝置已合法註冊、當前階段允許。舊回覆在 parse 後、任何狀態修改前丟棄。

## State Transitions

- 無考卷 IDLE/ERROR → 合法觸發 → FETCHING(false) → 驗證成功 READY(true) 或 ERROR(false)。
- 已備妥 READY → 更新／手動刷新 → FETCHING(true) → READY(true) 或 ERROR(true)。
- 無實際更新需求的重複 ensure → 沿用 READY 或同一 inFlight，不另發請求。
- reset／目標或資格變更 → generation++、IDLE(false)、清除對應卷與金鑰；舊作業不能再更新狀態。

## host

沿用 DeviceKeyMap、SystemSettings；不新增資料表、學生登入、裝置核准或備卷回報欄位。資料庫中的既有 meta/cipher 以單一 SQL upsert 更新、單一 SELECT 讀取，保證同一交付單位；本功能不引入遠端版本比對協定。
