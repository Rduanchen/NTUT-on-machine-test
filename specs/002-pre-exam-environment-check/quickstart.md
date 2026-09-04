# Quickstart Validation: 考前執行環境自我檢查

## Prerequisites

- Node dependencies 已安裝。
- 需驗證的系統語言工具已依目標情境安裝或刻意移除。
- 使用有效 exam config，並建立涵蓋單一語言與五種語言的 fixture。

## Automated validation

1. 執行 typecheck，確認主程序／preload／renderer 的 report contract 一致。
2. 執行 Vitest service、IPC、config source 與 UI mapping 測試。
3. 在不依賴真實 compiler 的單元測試中覆蓋：去重、成功、每一類失敗、retry、config replacement、取消、資料不污染與 route gate。
4. 在各平台 release validation runner 執行真實 toolchain suite：C、C++、Python、JavaScript、Java 的 smoke/TLE/MLE；Windows 為主要驗收，macOS/Linux 為相同行為驗證。

## Manual acceptance scenarios

### Authenticated config bootstrap

1. 讓後端從 `UNINITIALIZED` 進入 `NOT_STARTED`，但尚未登入取得 secure config。
2. 確認環境狀態顯示「等待考試設定」，且可以進入登入頁，不產生 settings/login redirect loop。
3. 登入成功後確認 secure config 寫入 RAM，隨即執行環境檢查。
4. 只有在已完成檢查且必要語言清單確實為空時，才顯示「沒有需要檢查的程式語言」。

### All required languages available

1. 載入使用多種語言的 config。
2. 確認登入前顯示檢查中，完成後為通過。
3. 確認登入可繼續。
4. 從 system bar 開啟報告，確認語言、工具版本、smoke/TLE/MLE、耗時及平台資訊。

### Missing or unusable tool

1. 使用需要缺少或不可執行工具的 config。
2. 確認 persistent failure dialog 自動出現，且只能明確選擇重新檢查或忽略風險。
3. 選擇「忽略風險並繼續」，確認可進入登入，但 system bar 仍維持失敗狀態。
4. 修復工具後選擇 retry，確認新 report 取代失敗 report。

### TLE/MLE protection failure

1. 在 test double 或專用 integration fixture 中，使診斷不得到預期 TLE 或 MLE classification。
2. 確認 report 清楚標示 check 類型與失敗原因，並顯示風險警告。
3. 確認測試完成後沒有遺留診斷程序，且學生作答與判題資料沒有變更。

### Config replacement

1. 開始一輪包含語言 A 的檢查後，載入需要語言 B 的新 config。
2. 確認 report 最終只代表新 config；語言 A 舊結果不可開放登入。
3. 在已進行的考試中進行相同操作，確認 report 更新但考生不被導離目前頁面。

## Commands

```bash
# Feature tests (deterministic; includes the bundled Node runtime)
npx vitest run \
  test/service/environment-profiles.test.ts \
  test/service/ramStore.service.test.ts \
  test/service/environment-check-runner.test.ts \
  test/service/environment-check.service.test.ts \
  test/service/config.service.test.ts \
  test/service/message-sync.service.test.ts \
  test/ipc/environment-check.ipc.test.ts \
  test/ui/environment-check-route.test.ts \
  test/ui/environment-check.ui-mapping.test.ts

# Real installed toolchain matrix
RUN_ENVIRONMENT_CHECK_INTEGRATION=1 npx vitest run test/integration/environment-check.runtime.test.ts

npm run typecheck
npm run build
```

## Validation record (2026-09-02)

- Platform: macOS arm64 (`darwin`), local PATH toolchains.
- Feature suite: 9 files, 88 tests passed.
- Real runtime matrix: C, Cpp, Python, JavaScript, Java all passed tool probe, smoke, TLE, and MLE; 5 tests completed in about 4.2 seconds.
- Node and renderer typechecks: passed.
- Production Electron/Vite build: passed. The existing bytecode plugin printed its pre-existing ES-module compatibility warning; output bundles were still produced successfully.
- Full Vitest suite: 286 passed, 8 failed, 5 opt-in tests skipped. The failures are outside this feature and occur in existing auth filesystem mock isolation, schema fixtures requiring `environmentVariables`, store null fixture handling, logger queue tests, and judge-manager upload gating. They remain recorded rather than being changed as part of this feature.

## Platform caveats

- Windows remains the primary release target. CI or release validation must run the same opt-in matrix on Windows and Linux; this workstation can only provide direct macOS evidence.
- Python resolves as `python` on Windows and `python3` on macOS/Linux. Java checks both `javac` and `java`.
- Process-tree termination uses `taskkill /T /F` on Windows and detached process groups on macOS/Linux.
- MLE is based on observed root-process RSS. Language profiles use separate ceilings to allow runtime startup overhead while still requiring an actual `MLE` classification.
