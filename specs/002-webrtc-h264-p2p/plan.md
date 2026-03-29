# Implementation Plan: P2P WebRTC H.264 Optimization

**Branch**: `002-webrtc-h264-p2p` | **Date**: 2026-03-29 | **Spec**: [specs/002-webrtc-h264-p2p/spec.md](spec.md)
**Input**: Feature specification from `/specs/002-webrtc-h264-p2p/spec.md`

## Summary

Implement a high-performance P2P video streaming solution using Next.js and Go. The core technical approach involves using WebRTC transceivers to prioritize H.264 codecs, maximizing the use of NVENC hardware acceleration while maintaining graceful fallback to VP8/VP9. Peer discovery will leverage the existing room-based signaling API with shareable URLs and QR codes.

## Technical Context

**Language/Version**: Next.js 15+ (TypeScript), Go 1.22+
**Primary Dependencies**: `gorilla/websocket`, `qrcode.react`, `@swiss/webrtc-signaling`
**Storage**: N/A (Stateless signaling relay)
**Testing**: `vitest` (Frontend unit), `playwright` (E2E), `go test` (Backend)
**Target Platform**: Modern Chromium-based browsers (for NVENC verification)
**Project Type**: Web Application (Frontend + Backend)
**Performance Goals**: <5s connection establishment, <50ms signaling relay latency
**Constraints**: Must prioritize H.264/NVENC; must support graceful fallback
**Scale/Scope**: P2P (2 peers per session)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Security and Privacy by Default**: WebRTC provides E2E encryption for media. Signaling messages must be relayed without inspection. **PASS**
- **II. Contract-First Interfaces**: The WebSocket signaling protocol (Offer/Answer/ICE) will be explicitly defined in `/contracts/`. **PASS**
- **III. Testable Delivery Gates**: Each user story has independent acceptance scenarios (e.g., verifying hardware encoder implementation). **PASS**
- **IV. Observability and Operability**: Signaling relay logs will be implemented to diagnose connection failures. **PASS**
- **V. Keep It Small and Reversible**: Implementation focuses on barebones UI in `@apps/monolith-stream` and core logic in `@services/monolith-stream-api`. **PASS**

## Project Structure

### Documentation (this feature)

```text
specs/002-webrtc-h264-p2p/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (not created by /speckit.plan)
```

### Source Code (repository root)

```text
apps/monolith-stream/
├── app/
│   ├── (stream)/
│   │   ├── [sessionId]/
│   │   │   └── page.tsx      # Barebones streaming/receiver UI
│   └── layout.tsx
├── components/
│   ├── webrtc/
│   │   ├── stream-view.tsx   # Video display component
│   │   └── qr-code.tsx       # QR code generator
│   └── ui/
└── src/
    └── hooks/
        └── use-webrtc-stream.ts # Core WebRTC logic

services/monolith-stream-api/
├── handlers/
│   └── signaling.go          # WebSocket handler
├── models/
│   └── messages.go           # Signaling message structures
└── main.go                   # Entry point
```

**Structure Decision**: Web application structure with frontend in `apps/monolith-stream/` and backend in `services/monolith-stream-api/`.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None      |            |                                     |
