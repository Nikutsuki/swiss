# Tasks: P2P WebRTC H.264 Optimization

**Input**: Design documents from `specs/002-webrtc-h264-p2p/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/signaling.md

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure for both frontend and backend

- [X] T001 Create project structure for `apps/monolith-stream/` and `services/monolith-stream-api/`
- [X] T002 Initialize Next.js project in `apps/monolith-stream/` with `qrcode.react` and `@swiss/webrtc-signaling`
- [X] T003 Initialize Go module in `services/monolith-stream-api/` with `gorilla/websocket`
- [X] T004 [P] Configure shared linting and formatting for the new directories

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

- [X] T005 [P] Define signaling message structures in `services/monolith-stream-api/models/messages.go`
- [X] T006 Implement basic WebSocket server setup in `services/monolith-stream-api/main.go`
- [X] T007 [P] Create base layout and page structure in `apps/monolith-stream/app/layout.tsx`
- [X] T008 [P] Setup environment variables for signaling server URL in `apps/monolith-stream/.env.local`

**Checkpoint**: Foundation ready - signaling backend and frontend shell are in place.

---

## Phase 3: User Story 1 - High-Performance P2P Video Streaming (Priority: P1) 🎯 MVP

**Goal**: Establish a direct video connection between two peers with screen/window capture.

**Independent Test**: Open the host page, select a screen to capture, then open the guest page in another window and verify the video stream is visible.

### Implementation for User Story 1

- [X] T009 [US1] Implement screen capture logic using `getDisplayMedia` in `apps/monolith-stream/src/hooks/use-webrtc-stream.ts`
- [X] T010 [US1] Implement WebSocket signaling client in `apps/monolith-stream/src/hooks/use-webrtc-stream.ts`
- [X] T011 [US1] Create `StreamView` component for video display in `apps/monolith-stream/components/webrtc/stream-view.tsx`
- [X] T012 [US1] Create host page with "Start Stream" button and QR code in `apps/monolith-stream/app/(stream)/[sessionId]/page.tsx`
- [X] T013 [US1] Implement peer-to-peer connection logic (Offer/Answer/ICE) in `apps/monolith-stream/src/hooks/use-webrtc-stream.ts`
- [X] T014 [US1] Implement guest join logic via URL/SessionID in `apps/monolith-stream/app/(stream)/[sessionId]/page.tsx`
- [X] T015 [US1] Create QR code component in `apps/monolith-stream/components/webrtc/qr-code.tsx`

**Checkpoint**: At this point, basic P2P screen streaming should be fully functional.

---

## Phase 4: User Story 2 - Hardware-Accelerated Encoding (Priority: P2)

**Goal**: Prioritize H.264/NVENC for streaming and implement graceful fallback.

**Independent Test**: Use `chrome://webrtc-internals` on the host side to verify `encoderImplementation` uses H.264 when available.

### Implementation for User Story 2

- [X] T016 [US2] Implement `setCodecPreferences` logic to prioritize H.264 in `apps/monolith-stream/src/hooks/use-webrtc-stream.ts`
- [X] T017 [US2] Add logic to move H.264 to the front of the preferred codecs array in `apps/monolith-stream/src/hooks/use-webrtc-stream.ts`
- [X] T018 [US2] Verify graceful fallback to VP8/VP9 if H.264 negotiation fails in `apps/monolith-stream/src/hooks/use-webrtc-stream.ts`
- [X] T019 [US2] Add telemetry logging to track which codec is actively being used during a session.

**Checkpoint**: Hardware acceleration is prioritized, and connection reliability is maintained via fallback.

---

## Phase 5: User Story 3 - Agnostic Signaling Relay (Priority: P3)

**Goal**: Ensure the Go backend relays messages without inspection and handles multiple sessions.

**Independent Test**: Verify that the backend can handle two separate concurrent streaming sessions without cross-talk.

### Implementation for User Story 3

- [X] T020 [US3] Implement session/room mapping in `services/monolith-stream-api/handlers/signaling.go`
- [X] T021 [US3] Implement message relay logic (Offer/Answer/ICE) in `services/monolith-stream-api/handlers/signaling.go`
- [X] T022 [US3] Ensure backend treats the `payload` as opaque JSON in `services/monolith-stream-api/handlers/signaling.go`
- [X] T023 [US3] Add logging for connection/disconnection events in the signaling server.

**Checkpoint**: Backend is a clean, scalable, and agnostic relay for signaling messages.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: UI refinements, error handling, and documentation.

- [X] T024 [P] Add user-friendly error messages for "Camera Access Denied" and "Connection Failed" in `apps/monolith-stream/app/(stream)/[sessionId]/page.tsx`
- [X] T025 [P] Implement session expiration/cleanup logic on both frontend and backend.
- [X] T026 Update `apps/monolith-stream/README.md` with usage instructions.
- [X] T027 [P] Run `npm run lint` and `npm run test` (if applicable) across both projects.
- [X] T028 Validate all steps in `specs/002-webrtc-h264-p2p/quickstart.md` work as expected.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories.
- **User Stories (Phase 3+)**: Depend on Foundational phase. US1 and US3 have some interplay; US1 implementation will drive US3's core relay logic. US2 depends on US1 being functional.
- **Polish (Final Phase)**: Depends on all user stories being complete.

### Parallel Opportunities

- T005, T007, T008 (Foundational) can run in parallel.
- T011 and T015 (US1 components) can be built in parallel.
- Once the basic relay (T021) is done, US1 and US2 work is mostly independent of backend changes.

---

## Implementation Strategy

### MVP First (User Story 1 & Core Relay)

1. Complete Setup & Foundation.
2. Implement enough of the Go relay to support a single session.
3. Complete User Story 1 (Streaming + Receiver).
4. **VALIDATE**: Ensure a basic stream can be established between two windows.

### Incremental Optimization

1. Layer on User Story 2 (H.264 prioritization).
2. Refine the backend (User Story 3) for scalability and session management.
3. Apply final UI polish and error handling.
