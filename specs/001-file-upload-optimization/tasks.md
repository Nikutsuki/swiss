# Tasks: Optimize file upload UX and performance

**Input**: Design documents from `/specs/001-file-upload-optimization/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md

**Tests**: Vitest for utility/logic, Playwright for E2E transfers.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and telemetry utilities

- [X] T001 [P] Create telemetry utility file in `apps/monolith-drop/src/utils/telemetry.ts`
- [X] T002 [P] Create Vitest setup for telemetry in `apps/monolith-drop/src/utils/telemetry.test.ts`
- [X] T003 [P] Create transfer card component file in `apps/monolith-drop/app/session/transfer-card.tsx`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core logic for smoothed telemetry and multi-file state management

- [X] T004 Implement Exponential Moving Average (EMA) and ETA logic in `apps/monolith-drop/src/utils/telemetry.ts`
- [X] T005 [P] Implement `TransferSession` type and `TransferMap` in `apps/monolith-drop/app/session/types.ts`
- [X] T006 Write unit tests for EMA and ETA calculations in `apps/monolith-drop/src/utils/telemetry.test.ts`
- [X] T007 Define basic `TransferCard` UI structure in `apps/monolith-drop/app/session/transfer-card.tsx`

**Checkpoint**: Foundational telemetry logic and UI components ready.

---

## Phase 3: User Story 1 - Efficient Large File Upload (Priority: P1) 🎯 MVP

**Goal**: Optimize transfer speed for large files using dynamic chunking.

**Independent Test**: Upload a 500MB file; verify higher throughput and smooth progress updates.

### Tests for User Story 1
- [X] T008 [P] [US1] Create unit test for dynamic chunking logic in `packages/webrtc-signaling/src/file-sender.test.ts`
- [X] T009 [US1] Create Playwright E2E test for large file transfer in `apps/monolith-drop/e2e/transfer-performance.spec.ts`

### Implementation for User Story 1
- [X] T010 [US1] Implement dynamic `chunkPayloadSize` and `maxBufferedAmount` logic in `packages/webrtc-signaling/src/file-sender.ts`
- [X] T011 [US1] Update `SessionWorkspace` to pass file size to `sendFileOverDataChannel` in `apps/monolith-drop/app/session/session-workspace.tsx`
- [X] T012 [US1] Verify large file upload throughput meets the 20% improvement goal.

**Checkpoint**: Large file transfers are optimized and verifiable.

---

## Phase 4: User Story 2 - Concurrent Upload Management (Priority: P1)

**Goal**: Support multiple simultaneous transfers in the UI without overwriting state.

**Independent Test**: Start three concurrent uploads and verify all three appear as separate entries.

### Tests for User Story 2
- [X] T013 [P] [US2] Create Playwright E2E test for concurrent transfers in `apps/monolith-drop/e2e/concurrent-transfers.spec.ts`

### Implementation for User Story 2
- [X] T014 [US2] Refactor `outgoing` and `incoming` state to use `TransferMap` in `apps/monolith-drop/app/session/session-workspace.tsx`
- [X] T015 [US2] Update `handleFiles` to add multiple entries to the `outgoing` map in `apps/monolith-drop/app/session/session-workspace.tsx`
- [X] T016 [US2] Update `attachFileReceiver` to manage multiple incoming transfers in `apps/monolith-drop/app/session/session-workspace.tsx`
- [X] T017 [US2] Render a list of `TransferCard` components for all active/completed transfers.

**Checkpoint**: Multiple transfers can be tracked simultaneously.

---

## Phase 5: User Story 3 - Advanced Transfer Telemetry (Priority: P2)

**Goal**: Display current speed, average speed, and smoothed ETA in the UI.

**Independent Test**: Verify stable (non-flickering) speed and ETA values during an active transfer.

### Implementation for User Story 3
- [X] T018 [US3] Integrate telemetry utilities into the `onProgress` callbacks in `apps/monolith-drop/app/session/session-workspace.tsx`
- [X] T019 [P] [US3] Update `TransferCard` to display Current Speed, Average Speed, and ETA.
- [X] T020 [US3] Apply smoothing to UI updates to ensure progress bars and labels update smoothly.

**Checkpoint**: Advanced telemetry is visible and smoothed.

---

## Phase 6: User Story 4 - Clean Up Upload Queue (Priority: P3)

**Goal**: Allow users to dismiss completed or failed transfers using an "X" button.

**Independent Test**: Click "X" on a completed transfer and verify it is removed from the list.

### Implementation for User Story 4
- [X] T021 [P] [US4] Add dismissal ("X") button to `TransferCard` in `apps/monolith-drop/app/session/transfer-card.tsx`
- [X] T022 [US4] Implement `removeTransfer` action in `apps/monolith-drop/app/session/session-workspace.tsx`
- [X] T023 [US4] Wire the "X" button to the `removeTransfer` action.

**Checkpoint**: Workspace can be cleaned up by the user.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final refinements and validation.

- [X] T024 [P] Ensure UI responsiveness under high transfer concurrency (50+ items).
- [X] T025 [P] Update `README.md` with performance benchmarks.
- [X] T026 Final code cleanup and refactoring of `session-workspace.tsx`.
- [X] T027 Run full `quickstart.md` validation.

---

## Dependencies & Execution Order

### Phase Dependencies
- **Phase 1 & 2**: Prerequisites for all user stories.
- **Phase 3 & 4**: Can run in parallel, but Phase 3 is the performance MVP.
- **Phase 5**: Depends on Phase 4 (UI structure for multiple cards).
- **Phase 6**: Depends on Phase 4 (UI structure for multiple cards).

### Parallel Opportunities
- T001, T002, T003 can be done in parallel.
- T005, T007 can be done in parallel.
- Once Foundation is ready, US1 (T010) and US2 (T014) can start in parallel.
- T008, T013 are independent test tasks.

---

## Implementation Strategy

### MVP First (User Story 1 & 2)
1. Complete Setup and Foundational phases.
2. Implement Dynamic Chunking (US1) for immediate performance gains.
3. Implement Multi-file state (US2) to fix the UI overwriting bug.
4. Validate with E2E tests.

### Incremental Delivery
1. Foundation -> Optimized Single Transfer (US1) -> Multi-transfer Support (US2) -> Advanced Telemetry (US3) -> Cleanup (US4).
