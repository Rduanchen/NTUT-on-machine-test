# Environment Check IPC Contract

Renderer 只能透過以下介面讀取或請求環境檢查；不得傳入任意 command、source code、資源限制或檔案路徑。

## Read current report

**Channel**: `environment-check:get-report`

**Request**: none

**Response**: `EnvironmentCheckReport`

**Behavior**: 若尚未有 config，回傳 `IDLE` report；不得啟動檢查。

## Rerun latest check

**Channel**: `environment-check:retry`

**Request**: none

**Response**: `IpcResponse<EnvironmentCheckReport>`

**Behavior**: 僅對目前 config 重跑；沒有 config 時回傳受控失敗；重跑會使舊輪次失效。

## Subscribe to updates

**Event**: `environment-check:updated`

**Payload**: `EnvironmentCheckReport`

**Behavior**: 在狀態變更、語言完成、新 report 完成時傳送；renderer subscription 必須可取消。

## Navigation decision contract

登入導航在尚未驗證的使用者情境下，必須視目前 report 為：

| Status    | Login allowed                                                             |
| --------- | ------------------------------------------------------------------------- |
| `PASSED`  | yes                                                                       |
| `IDLE`    | yes; authenticated login may be required before the config can be fetched |
| `RUNNING` | no                                                                        |
| `FAILED`  | yes, after the warning is presented and explicitly acknowledged           |

已在進行中的考試不因 config update 的新 report 被強制導頁；但 UI 必須顯示其最新狀態。
