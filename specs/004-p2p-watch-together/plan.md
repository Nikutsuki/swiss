# Implementation Plan: P2P Watch Together Streaming

**Branch**: `004-p2p-watch-together` | **Date**: 2026-03-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-p2p-watch-together/spec.md`

## Summary

Implement a peer-to-peer media streaming application allowing users to share their screen/window or local video files with synchronized playback controls and text chat within a lobby. Frontend will be built in Next.js at `apps/monolith-stream/` and the signaling backend in Golang at `services/monolith-stream-api/`, using WebRTC for data transmission.

## Technical Context

**Language/Version**: TypeScript (Frontend), Golang (Backend)
**Primary Dependencies**: Next.js, React, WebRTC API, standard Go library, gorilla/websocket (for signaling)
**Storage**: In-memory for active lobbies (Backend)
**Testing**: Jest/React Testing Library (Frontend), Go testing package (Backend)
**Target Platform**: Web browsers (Desktop/Mobile)
**Project Type**: Web Application + API Service
**Performance Goals**: <500ms latency for streaming, <200ms latency for playback sync events, <100ms for chat messages, zero unnecessary React re-renders.
**Constraints**: WebRTC support required on clients, peer-to-peer network reachability (may need STUN/TURN for NAT traversal).
**Scale/Scope**: ~5 concurrent participants per lobby without degradation.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Security and Privacy by Default**: WebRTC encrypts data in transit by default. Signaling server will not log chat messages or stream data. PASS
- **II. Contract-First Interfaces**: WebSocket signaling protocol contract defined before implementation. PASS
- **III. Testable Delivery Gates**: INTENTIONAL VIOLATION. User requested omitting automated tests to prioritize rapid feature delivery. See Complexity Tracking table.
- **IV. Observability and Operability**: Signaling server will include basic metrics/logging for lobby counts and connection failures. PASS
- **V. Keep It Small and Reversible**: Incrementally deploy signaling backend, then basic WebRTC text chat, then video streaming, and finally sync controls. PASS

## Project Structure

### Documentation (this feature)

```text
specs/004-p2p-watch-together/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── signaling.md
└── tasks.md
```

### Source Code (repository root)

```text
apps/monolith-stream/
├── src/
│   ├── app/
│   ├── components/
│   ├── hooks/
│   │   └── useWebRTC.ts
│   └── lib/

services/monolith-stream-api/
├── main.go
├── handlers/
│   └── websocket.go
└── models/
    └── lobby.go

packages/
└── ui/
    └── src/
```

**Structure Decision**: Using Next.js frontend in `apps/monolith-stream/` and Golang backend in `services/monolith-stream-api/` with shared components from `packages/ui/`.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Principle III (Testable Delivery Gates) - No automated tests | User explicitly requested omitting automated tests to focus on rapid prototyping. | Writing comprehensive WebRTC E2E tests is time-consuming and was rejected to meet delivery speed requirements. |
