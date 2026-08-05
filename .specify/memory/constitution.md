<!--
Sync Impact Report
- Version change: 1.0.0 → 1.1.0 (Major principles updated)
- List of modified principles:
  - Added I. Type Safety
  - Added II. Async & High Concurrency
  - Added III. Strict Branching Strategy
  - Added IV. Absolute Security & Stability
  - Added V. Comprehensive Testing
- Added sections:
  - Communication & Offline Support
- Removed sections:
  - [SECTION_3_NAME] (Development Workflow - consolidated or not specified)
- Templates requiring updates: ✅ None (no static references found)
- Follow-up TODOs: 
  - TODO(GUIDANCE_FILE): Create or specify the runtime development guidance file.
-->
# ntut-code-tester Constitution

## Core Principles

### I. Type Safety
The project MUST be strictly type-safe under all circumstances. Unsafe typing or dynamic typing that bypasses the compiler/interpreter safety checks MUST NOT be used.

### II. Async & High Concurrency
The system MUST implement robust asynchronous processing. As an exam system, it will experience traffic spikes; therefore, it MUST be capable of handling high concurrency requests gracefully without performance degradation.

### III. Strict Branching Strategy
The repository MUST strictly adhere to the following branch separation: `main` (production), `develop` (integration), and `feat/XXX` (feature development). Direct commits to `main` or `develop` are strictly prohibited.

### IV. Absolute Security & Stability
Stability and security are the highest priorities. The backend MUST be absolutely secure against common vulnerabilities (e.g., SQLi, XSS, unauthorized access) and ensure data integrity at all times.

### V. Comprehensive Testing
All code within the main process MUST be comprehensively tested using vitest to ensure stability and correctness.

## Communication & Offline Support

- Communication between the local client and the host MUST be fully encrypted for users, as test data is stored locally.
- The system MUST support offline operation. It MUST continue to function despite being tightly integrated with the backend, even in a disconnected state.
- A compensation mechanism MUST be implemented to synchronize data and state once the connection is re-established.

## Governance

Amendments require documentation, approval, and migration plan. All PRs/reviews must verify compliance with this constitution. Use TODO(GUIDANCE_FILE) for runtime development guidance.

**Version**: 1.1.0 | **Ratified**: 2026-08-04 | **Last Amended**: 2026-08-04
