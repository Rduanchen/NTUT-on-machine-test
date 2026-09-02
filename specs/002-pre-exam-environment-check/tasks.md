# Tasks: 考前執行環境自我檢查

**Input**: Design documents from `/specs/002-pre-exam-environment-check/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Main-process code must have Vitest coverage per project constitution. Story tests are written before their implementation tasks.

**Organization**: Tasks are grouped by user story and ordered so each phase reaches an independently testable checkpoint.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish shared contracts and module seams used by all stories.

- [x] T001 Add environment status, report, language result, tool result, and diagnostic result contracts in src/common/types.ts
- [x] T002 Extend in-memory environment report state, accessors, reset behavior, and events in src/main/services/ramStore.service.ts
- [x] T003 [P] Define fixed language diagnostic profiles and canonical language mapping in src/main/judge/node-judger/environment-profiles.ts
- [x] T004 [P] Export environment profile types and runner-facing interfaces from src/main/judge/node-judger/index.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build deterministic, isolated orchestration that all user-facing stories require.

**⚠️ CRITICAL**: No user story integration begins until this phase is complete.

- [x] T005 [P] Add profile completeness, Java dual-tool, and bounded diagnostic source tests in test/service/environment-profiles.test.ts
- [x] T006 [P] Add RamStore environment state lifecycle and event tests in test/service/ramStore.service.test.ts
- [x] T007 Implement tool probing and isolated smoke/TLE/MLE profile execution with abort support in src/main/judge/node-judger/environment-check-runner.ts
- [x] T008 Implement single-flight coordinator, language deduplication, fingerprinting, stale-result suppression, retry, caching, and cleanup in src/main/services/environment-check.service.ts
- [x] T009 Add coordinator tests for empty configs, dedupe, success/failure classification, retry, replacement, cancellation, and no exam-state mutation in test/service/environment-check.service.test.ts

**Checkpoint**: A config can be checked in isolation and produces a typed latest report without touching student data.

---

## Phase 3: User Story 1 - 登入前確認考試執行環境 (Priority: P1) 🎯 MVP

**Goal**: Every validated config source runs the environment check before it can release the pre-login flow.

**Independent Test**: Load a single-language config and verify tool, smoke, TLE, and MLE results; login setup completes only after PASSED.

### Tests for User Story 1

- [x] T010 [P] [US1] Add file/server config gating and environment failure tests in test/service/config.service.test.ts
- [x] T011 [P] [US1] Add socket config replacement, language-cache, and rejudge ordering tests in test/service/message-sync.service.test.ts

### Implementation for User Story 1

- [x] T012 [US1] Route file and initial server config through the shared awaited environment orchestration in src/main/services/config.service.ts
- [x] T013 [US1] Route socket config refresh through environment orchestration without ejecting an active examinee in src/main/services/message-sync.service.ts
- [x] T014 [US1] Initialize and stop environment check lifecycle with application startup/shutdown in src/main/index.ts

**Checkpoint**: All validated config sources produce a latest report, and pre-login setup cannot complete while it is RUNNING or FAILED.

---

## Phase 4: User Story 2 - 阻擋不安全的登入並協助修復 (Priority: P1)

**Goal**: Expose trusted status/retry operations and enforce a non-bypassable login gate.

**Independent Test**: Force a missing-tool failure, attempt every login navigation path, repair/retry, and verify login becomes available without restart.

### Tests for User Story 2

- [x] T015 [P] [US2] Add get-report/retry and update-event IPC contract tests in test/ipc/environment-check.ipc.test.ts
- [x] T016 [P] [US2] Add pure login-gate decision tests for IDLE, RUNNING, FAILED, PASSED, and active-exam cases in test/ui/environment-check-route.test.ts

### Implementation for User Story 2

- [x] T017 [US2] Register typed get-report and retry handlers plus report update forwarding in src/main/ipc/environment-check.ipc.ts and src/main/ipc/index.ipc.ts
- [x] T018 [US2] Expose environment check invoke/subscription APIs in src/preload/index.ts, src/preload/index.d.ts, and src/renderer/main.d.ts
- [x] T019 [US2] Extract and apply environment-aware navigation decision logic in src/renderer/router/environment-check.guard.ts and src/renderer/router/index.ts

**Checkpoint**: No route can enter login before PASSED, retry is available, and active exams are not forcibly redirected by a later config update.

---

## Phase 5: User Story 3 - 隨時查看環境檢測報告 (Priority: P2)

**Goal**: Keep environment readiness visible and provide a persistent failure/retry report dialog.

**Independent Test**: From each report state, verify the system bar indicator and dialog content; FAILED opens persistently, retry shows progress, and PASSED remains inspectable.

### Tests for User Story 3

- [x] T020 [P] [US3] Add status-to-color/icon/label, failed-summary, and dialog persistence mapping tests in test/ui/environment-check.ui-mapping.test.ts

### Implementation for User Story 3

- [x] T021 [P] [US3] Implement pure report presentation mappings in src/renderer/components/environment-check.presentation.ts
- [x] T022 [US3] Implement report details, per-language checks, failure details, and retry action in src/renderer/components/EnvironmentCheckDialog.vue
- [x] T023 [US3] Integrate environment subscription, system bar button, and persistent failed dialog in src/renderer/App.vue
- [x] T024 [P] [US3] Add Traditional Chinese and English environment-check messages in src/renderer/locales/zh.json and src/renderer/locales/en.json

**Checkpoint**: Environment state is visible throughout the app and the latest report is accessible in one action without mutating exam data.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verify type safety, regression safety, cleanup, and supported-platform behavior.

- [x] T025 Add mocked process-error, output truncation, timeout, MLE, abort, and cleanup tests in test/service/environment-check-runner.test.ts
- [x] T026 [P] Add opt-in real runtime smoke/TLE/MLE validation harness for supported installed tools in test/integration/environment-check.runtime.test.ts
- [x] T027 Update specs/002-pre-exam-environment-check/quickstart.md with final commands and observed platform caveats
- [x] T028 Run targeted tests, full Vitest suite, node/web typechecks, and build validation; record outcomes in specs/002-pre-exam-environment-check/quickstart.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Phase 1; blocks all user stories.
- **US1 (Phase 3)**: Depends on Phase 2.
- **US2 (Phase 4)**: Depends on Phase 2 and consumes the report lifecycle delivered by US1 integration.
- **US3 (Phase 5)**: Depends on US2 preload/IPC contracts; pure presentation mapping can begin after Phase 2.
- **Polish (Phase 6)**: Depends on all desired user stories.

### User Story Dependency Graph

```text
Setup → Foundation → US1 config lifecycle → US2 gate/IPC → US3 report UI → Polish
```

### Parallel Opportunities

- T003 and T004 can run in parallel after T001.
- T005 and T006 can run in parallel.
- T010 and T011 can run in parallel after the coordinator exists.
- T015 and T016 can run in parallel.
- T020, T021, and T024 can run in parallel after shared report contracts exist.
- T026 can be prepared independently from documentation work in T027.

---

## Parallel Example: User Story 2

```text
Task T015: Validate environment-check IPC contract in test/ipc/environment-check.ipc.test.ts
Task T016: Validate login-gate decisions in test/ui/environment-check-route.test.ts
```

---

## Implementation Strategy

### MVP First

1. Complete shared contracts and foundation (T001-T009).
2. Complete US1 config lifecycle (T010-T014).
3. Validate that a real config cannot reach login before PASSED.

### Incremental Delivery

1. Foundation provides typed, isolated reports.
2. US1 adds automatic checks to every config source.
3. US2 makes failure non-bypassable and retryable.
4. US3 makes the report continuously visible.
5. Polish proves process safety and platform behavior.

## Notes

- `[P]` tasks affect different files and can proceed without incomplete same-file dependencies.
- Tests precede implementation within each user story.
- Real compiler/runtime integration tests are opt-in; routine Vitest remains deterministic.
- Do not commit unrelated dirty-worktree changes while completing these tasks.
