# NTUT Exam Desktop Client (Agent Guidelines)

This document provides architectural, structural, and developmental guidelines for agents and developers working on the `desktop` application in the NTUT Exam system.

## 1. Architecture Overview

The desktop application is built with **Electron + Vue 3 + Vuetify + TypeScript**, packaged using **electron-vite**.

### 1.1 Process Model
- **Main Process (`src/main/`)**: Handles file system access, external processes (running code/judger), heavy networking (Axios requests, encrypted APIs), Socket.IO connections, and local state management (`ramStore`).
- **Preload Script (`src/preload/index.ts`)**: The secure bridge between Main and Renderer. Exposes an `api` object (e.g., `window.api.judger.judge()`, `window.api.store.onExamStatusChanged()`) via `contextBridge`.
- **Renderer Process (`src/renderer/`)**: The Vue 3 frontend. Displays UI using Vuetify components, handles routing, and interacts with the OS only via the injected `window.api`.

### 1.2 Communication (IPC)
- Renderer initiates requests via `ipcRenderer.invoke` (wrapped in `preload`). Main responds via `ipcMain.handle`.
- Main pushes updates to Renderer via `webContents.send`. Preload wraps these with `ipcRenderer.on` and exposes callback registration methods (e.g., `onTestResultsUpdated(callback)`).

## 2. Directory Structure

```
desktop/
├── src/
│   ├── main/                 # Main Process
│   │   ├── ipc/              # IPC handlers
│   │   ├── services/         # Core business logic (api, judger, config, message-sync)
│   │   └── schemas/          # Zod validation schemas
│   ├── preload/              # Preload script
│   │   └── index.ts          # contextBridge exposure
│   ├── renderer/             # Vue 3 Frontend
│   │   ├── components/       # Reusable UI components
│   │   ├── composables/      # Vue composables
│   │   ├── pages/            # View components corresponding to router paths
│   │   ├── router/           # Vue Router definitions & lifecycle guards
│   │   ├── plugins/          # Vuetify & i18n initialization
│   │   └── App.vue           # Root layout and global listeners
```

## 3. Core Features & Rules

### 3.1 Exam Lifecycle Routing
Routing strictly follows the exam state broadcasted by the backend:
- `UNINITIALIZED`: `/not-initialized` (Device Registration)
- `NOT_STARTED`: `/login` (Auto-login by IP) -> `/waiting`
- `IN_PROGRESS`: `/exam` (Main coding interface)
- `FINISHED`: `/finished` (Code upload & scoreboard verification)

**Rule:** `router/index.ts` uses navigation guards to ensure students cannot bypass these states. Do not add bypass mechanisms.

### 3.2 State Management
The desktop client does **NOT** use Vuex or Pinia for global state. Instead, the Single Source of Truth is the `ramStore` service residing in the **Main Process**. 
- The Renderer requests state from the Main process (e.g., `window.api.store.getExamStatus()`).
- The Main process pushes state changes to the Renderer via IPC events.

### 3.3 Security & Networking
- **Encryption**: API requests are encrypted using AES-GCM and session keys exchanged during the initial RSA registration handshake. All API calls (except `/health` and `/exam/status`) must be routed through `authClient` in `api.service.ts`.
- **Data Persistence**: Do **NOT** persist sensitive exam config or test cases to the hard drive. All configurations are held in `ramStore` in memory and discarded upon app closure.

### 3.4 Code Evaluation (Judger)
- Code submission format is a string (`codeContent`) sent directly to the backend.
- Local evaluation logic (if any) should securely handle sandbox limitations.
- `SpecialRules` validation runs during code submissions, applying constraints (`MUST_HAVE`, `MUST_NOT_HAVE`) through regex or abstract syntax tree patterns.

## 4. Development & Testing
- Use `npm run dev` to start the electron application in development mode.
- Use **Vitest** for testing services and schemas. Place test files alongside their implementations (e.g., `api.service.test.ts`).
- Avoid adding third-party dependencies unless absolutely necessary. Rely on Vue/Vuetify features.
