# Quickstart Validation

已完成下列自動檢查與隔離 HTTP 配對測試；考場真機驗收尚未執行。只使用隔離的測試考試，不重設真實考場。

## Prerequisites

- 使用 host 與 desktop 的配對 feature branches，具現有依賴及可運作的測試 host。
- 測試考卷含正確監考口令、至少一位學生，以及可辨識的題目。
- 機器完成裝置註冊；考卷仍只保留 RAM。人工核准晚入場另準備第二台或獨立 app session。
- 確認登入頁與等待頁可見獨立備卷狀態，不能以環境預檢通過當成備妥證據。

## Automated checks

從 desktop 執行：

```sh
npm run typecheck
npx vitest run test/service/config.service.test.ts test/service/message-sync.service.test.ts test/ipc/auth.ipc.test.ts test/ipc/config.ipc.test.ts test/service/offline-config.test.ts
```

新增的備卷、重連、ramStore 及 IPC 測試亦須納入 Vitest 執行。需涵蓋相同階段補抓、並發合併、下載失敗保留有效卷、generation 失效與事件排序。

從 host 執行：

```sh
pnpm test:contract-fixture
pnpm --filter backend test
pnpm --filter backend build
```

正式驗證模式下測試無 session 取卷成功、未註冊／錯誤 GCM／重放／非法階段拒絕、回應前資格改變，以及開考金鑰仍不提早釋出。不得只在 pure load-test mode 驗證。

## Paired acceptance

1. **主要重現**：學生完全未線上登入；將考試推至 SETUP_FINISHED，等待「離線考卷已備妥」後拔線。手動輸入名單內學號及正確口令，應進入可讀題目畫面，且不依賴任何成功的網路回應。重複 10 次。
2. **口令與名單**：同一離線狀況，錯誤口令不開卷；有非空名單時，名單外學號不能登入；正確口令不應因前一次失敗而損毀有效卷。
3. **補抓矩陣**：階段推進、晚核准、漏接 Socket 後由公開狀態查詢補抓、斷線恢復，各 5 次皆能不經學生登入備妥。另驗證階段已是 SETUP_FINISHED 才啟動並獲人工核准的路徑。
4. **重試**：攔截一次取卷令其逾時；顯示錯誤；恢復正常後 65 秒內自動備妥。確認手動重試與同步同時發生只有一個有效請求在途。
5. **已有卷仍可開考**：先成功備卷，再讓登入後重抓或 config_update 失敗；顯示更新失敗但仍持有有效卷，斷網後仍可解封。
6. **延遲回覆**：控制取卷回覆延遲，分別在等待時 reset、更換伺服器、清除／換註冊資格。放行舊回覆後，不可恢復舊卷或顯示 READY；舊 finally 不可影響新作業。
7. **環境獨立**：預檢通過但取卷失敗時不得顯示已備妥；預檢失敗但卷完整時可顯示已備妥，同時保留環境警示。
8. **恢復連線**：離線開考後恢復連線，確認 pendingLoginSync 與既有待送工作補同步，不能被新的備卷作業阻斷。
9. **既有流程回歸**：正常線上開考、IN_PROGRESS 合法重入、完全離線匯入仍可用；關閉 app 後不得承諾離線重開保留考卷。

## Evidence

記錄 host/desktop commit、平台、測試情境與次數、開始／完成時間、畫面狀態、期望與實際結果。記錄不可包含金鑰、監考口令或完整考卷內容。自動檢查與真機拔線都通過才視為共同部署驗收完成。


## Execution Record — 2026-10-25

**Branches/base**: desktop `feat/003-prefetch-exam-config` / `470c570`；host `feat/prefetch-exam-config` / `53fc627`。變更尚未提交，故以上為基準 commit，不是包含功能的發布 commit。

| 檢查 | 結果 |
| --- | --- |
| desktop 修改前針對性基線 | 8 個檔案、185 項測試通過 |
| host 修改前針對性基線 | 3 個檔案、43 項測試通過 |
| desktop `npm run typecheck` | node 與 web 均通過 |
| desktop `npx vitest run --coverage` | 44 個檔案通過；484 項通過、5 項依既有 runtime opt-in 設定略過；主程序納入範圍整體行覆蓋率 94.04%（不是全專案 100%） |
| host `pnpm --filter backend test` | 含測試型別檢查，81 個檔案、791 項通過 |
| host `pnpm --filter backend build` | 通過 |
| host `pnpm test:contract-fixture` | 考卷三端及語言兩端 fixture 逐位元組相同 |

配對測試 `desktop/test/integration/paper-delivery.test.ts` 以現有 ts-node 啟動 `host/backend/test/helpers/paper-delivery-server.ts`，強制 `DB_STORAGE=:memory:`、停用 pure bypass、使用測試裝置與隨機 loopback port。desktop 真實 API 執行裝置 AES-GCM 請求並解析 host 真實加密回應；host 關閉後，桌面端 auth IPC 經實際連線失敗走離線名單驗證，再以錯誤／正確監考口令驗證拒絕／解封。未曾先完成學生線上登入。無需既有運作中的 host 或正式考場資料庫。

獨立備卷服務測試驗證預載時不開卷、相同 scope 合併、下載中新增刷新意圖會補抓、更新失敗保留有效卷且自動重試、錯誤格式不洩漏內容、reset／換 backend／換鑰及舊 finally 不覆寫新作業，另驗證完全離線匯入不受預檢失敗影響。IPC 測試驗證狀態快照、事件及重試委派；Vue 自訂 renderer 測試驗證舊快照排序、卸載清理及重試防重入，無新增 UI 測試依賴。

使用受控時鐘確認初始消息同步尚未完成時，既有 60 秒 timer 仍會獨立嘗試備卷。65 秒上限限定已得知階段、仍有註冊資格、後續取卷在既有 5 秒時限內成功的測試條件；未知階段或仍在等待核准不計入此上限。

### 尚待考場驗收

- T035：在真實 Electron 視窗走查所有備卷狀態、預檢獨立警示及手動重試，量測可見狀態更新 1 秒內完成。
- T039：考場機器實體拔線、四種補抓情境各 5 次及離線開考 10 次，並完成平台上的完整既有流程回歸。
- T040：上述證據補齊後才可整體結案；目前只完成程式差異與自動證據審查。

停止隔離 host 的測試證明無法連線時的程式行為，但未宣稱等同真實網卡拔線或已完成 20／10 次重複驗收。runtime 語言環境的 5 個既有 opt-in 測試尚未在本輪開啟，亦未宣稱通過。
