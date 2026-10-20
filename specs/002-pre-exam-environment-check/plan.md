# Implementation Plan: 考前執行環境自我檢查

**Branch**: `feat/pre-exam-environment-check` | **Date**: 2026-09-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-pre-exam-environment-check/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

在 config 成為目前考試設定後，建立一個獨立的主程序環境檢查服務。它從設定擷取並去重考試使用語言，依序以正式本機判題相同的命令和執行語意驗證工具可用性、正常執行、TLE 與 MLE；將結構化報告存於 RAM 並透過 IPC 推送給 renderer。路由在檢查進行中封鎖登入；失敗時根 App 顯示需明確處置的 warning dialog，助教可重試或知情繼續，system bar 則持續保留失敗報告入口。

服務使用低階 judge/runner 原語，而不是會保存學生程式與成績的 service。每一輪檢查都帶設定／語言指紋；新設定到達會使舊輪次結果失效。詳細取捨見 [research.md](./research.md)。

## Technical Context

**Language/Version**: TypeScript 5.5、Node 20、Electron 34、Vue 3

**Primary Dependencies**: Electron IPC、pidusage、Vuetify、Vitest

**Storage**: 僅應用程式執行期間的 RAM；不得寫入學生作答、分數或結果檔

**Testing**: Vitest 主程序單元／整合測試；平台矩陣的選用真實 runtime integration suite

**Target Platform**: Windows 為主要驗收平台；同時支援 macOS 與 Linux

**Project Type**: Electron desktop application

**Performance Goals**: 五種支援語言的完整序列檢查，在具備所需工具的參考機器上 60 秒內完成

**Constraints**: 離線可用；不可經 shell 拼接命令；診斷必須有固定有界資源；不得干擾現有考試或遺留子程序

**Scale/Scope**: 五種語言（C、C++、Python、JavaScript、Java）、三個執行檢查加工具探測、全域單一最近報告

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| 原則                          | 設計回應                                                                                                                        | Gate |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---- |
| Type Safety                   | 共享型別描述 report、language profile、IPC 回應；不以 `any` 跨越主程序／renderer 邊界。                                         | PASS |
| Async & High Concurrency      | 單一 coordinator、設定版本 token、同語言去重與序列化檢查，避免重試或 socket 更新競爭。                                          | PASS |
| Strict Branching Strategy     | 實作在 `feat/pre-exam-environment-check`。                                                                                      | PASS |
| Absolute Security & Stability | 固定診斷程式、無 shell、固定資源上限、程序樹清理、輸出截斷、檢查中登入封鎖及失敗風險確認。                                      | PASS |
| Comprehensive Testing         | service、config source、IPC、route decision、UI mapping 皆有 Vitest 覆蓋；真實 runtime integration suite 於發版／平台矩陣執行。 | PASS |
| Offline Support               | file config 和 server/socket config 皆經同一 coordinator；結果只存 RAM，不依賴網路。                                            | PASS |

**Post-design re-check**: PASS。沒有為此功能新增不必要的資料庫、外部服務或第二套判題命令。

## Project Structure

### Documentation (this feature)

```text
specs/002-pre-exam-environment-check/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── common/
│   └── types.ts                         # shared report and status contracts
├── main/
│   ├── judge/node-judger/               # canonical language/runner primitives
│   ├── services/
│   │   ├── environment-check.service.ts # new coordinator and report state
│   │   ├── config.service.ts            # config source orchestration
│   │   └── message-sync.service.ts      # refreshed config orchestration
│   └── ipc/
│       └── environment-check.ipc.ts     # new renderer boundary
├── preload/
│   ├── index.ts
│   └── index.d.ts
└── renderer/
    ├── App.vue                          # system bar and persistent dialog
    ├── router/index.ts                  # login guard decision
    └── components/                      # report dialog when extracted

test/
├── service/environment-check.service.test.ts
├── service/config.service.test.ts
├── service/message-sync.service.test.ts
├── ipc/environment-check.ipc.test.ts
└── ui/environment-check.ui-mapping.test.ts
```

**Structure Decision**: 維持單一 Electron 專案。執行與狀態協調放主程序 service；固定診斷 profile 與 canonical runner 置於 judge 層附近；IPC/preload 是唯一 renderer 邊界；UI 僅讀取／請求 report，不能自行啟動程序。
