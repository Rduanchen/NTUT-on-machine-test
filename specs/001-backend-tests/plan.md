# Implementation Plan: backend-tests

**Branch**: `[001-backend-tests]` | **Date**: 2026-08-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-backend-tests/spec.md`

## Summary

為所有的後端服務 (`src/main/services/`) 以及 IPC 模組 (`src/main/ipc/`) 補齊測試防護網。利用 Vitest 確保服務的 100% 分支覆蓋率，並透過 Mock 方式完成 IPC 整合測試。

## Technical Context

**Language/Version**: TypeScript, Node.js
**Primary Dependencies**: Vitest, `@vitest/coverage-v8`
**Storage**: N/A
**Testing**: Vitest
**Target Platform**: Electron (Main Process)
**Project Type**: desktop-app
**Performance Goals**: 測試能在 3 分鐘內執行完畢
**Constraints**: Service 層需達 100% 分支覆蓋率，且底層依賴需 Mock 隔離
**Scale/Scope**: 12 個 Service 與 6 個 IPC 模組

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Type Safety**: 嚴格的型別檢查套用於測試檔與 Mock 物件。
- [x] **II. Async & High Concurrency**: 測試驗證非同步邏輯（如 timeout, Promise 拒絕）的正確性。
- [x] **IV. Absolute Security & Stability**: 100% 覆蓋率確保系統穩定。
- [x] **V. Comprehensive Testing**: 完美契合，此任務即為擴展全面測試覆蓋。

## Project Structure

### Documentation (this feature)

```text
specs/001-backend-tests/
├── plan.md              # This file
├── research.md          # Mock 與覆蓋率策略
├── data-model.md        # 測試目標分組
└── quickstart.md        # 測試與覆蓋率驗證指南
```

### Source Code (repository root)

```text
src/
├── main/
│   ├── services/
│   └── ipc/

test/
├── service/
└── ipc/
```

**Structure Decision**: 所有的 Service 測試放置於 `test/service/`，所有 IPC 整合測試統一存放於 `test/ipc/`。
