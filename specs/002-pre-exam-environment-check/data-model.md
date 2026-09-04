# Data Model: 考前執行環境自我檢查

## EnvironmentCheckStatus

| Value | Meaning | Allowed next states |
|---|---|---|
| `IDLE` | 尚未有可評估的 config 或 report | `RUNNING` |
| `RUNNING` | 最新 config 的檢查正在進行 | `PASSED`, `FAILED`, `RUNNING`（新 config） |
| `PASSED` | 所有必要語言與檢查通過 | `RUNNING` |
| `FAILED` | 至少一個必要檢查未通過 | `RUNNING` |

## EnvironmentCheckReport

| Field | Type | Rules |
|---|---|---|
| `status` | EnvironmentCheckStatus | 最新 config 的整體狀態 |
| `configFingerprint` | string | 由必要語言集合與 config version/內容衍生；只允許相同指紋結果成為 latest |
| `platform` | string | 報告建立時的平台 |
| `architecture` | string | 報告建立時的 CPU architecture |
| `requiredLanguages` | SupportedLanguage[] | 由 config 擷取、固定順序、去重 |
| `languageResults` | LanguageCheckResult[] | 每個必要語言最多一筆 |
| `startedAt` | ISO timestamp | RUNNING 開始時設定 |
| `completedAt` | ISO timestamp or null | 終態時設定 |
| `message` | string | 可供 system bar / dialog 的摘要 |

## LanguageCheckResult

| Field | Type | Rules |
|---|---|---|
| `language` | SupportedLanguage | C / Cpp / Python / JavaScript / Java |
| `status` | pending / running / passed / failed | 工具與所有必要 checks 的彙總 |
| `tools` | ToolProbeResult[] | Java 至少有 compile/runtime 兩項 |
| `checks` | DiagnosticCheckResult[] | smoke、tle、mle，固定順序 |
| `startedAt` / `completedAt` | ISO timestamps | 反映此語言的序列執行期間 |

## ToolProbeResult

| Field | Type | Rules |
|---|---|---|
| `tool` | string | 對正式語言命令的可識別名稱 |
| `status` | passed / failed | 只有可啟動且取得辨識版本才 passed |
| `version` | string or null | 顯示用，不是 smoke 的替代品 |
| `summary` | string | 截斷後的人類可讀錯誤或版本資訊 |

## DiagnosticCheckResult

| Field | Type | Rules |
|---|---|---|
| `kind` | smoke / tle / mle | 每種語言各一筆 |
| `status` | passed / failed | TLE/MLE 僅接受對應 runner classification |
| `durationMs` | number | 非負有限數 |
| `peakMemoryBytes` | number or null | runner 提供時保留 |
| `summary` | string | UI-safe、長度上限 |
| `technicalDetails` | string or null | 截斷 stdout/stderr 或 failure details |

## Identity and consistency rules

- `configFingerprint + language` 是一次 coordinator 執行內 LanguageCheckResult 的唯一鍵。
- 新 fingerprint 抵達時，舊輪次不可覆寫 latest report；其子程序應取消並清理。
- 相同 fingerprint 的已通過 report 可被重用；使用者選擇 retry 時強制建立新輪次。
- 任何 failed tool/check 使該 LanguageCheckResult 和整體 report FAILED。
- report 不含學生 source code、答案、分數、隱藏測資或持久化識別資料。
