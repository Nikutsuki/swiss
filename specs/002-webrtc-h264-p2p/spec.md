# Feature Specification: P2P WebRTC H.264 Optimization

**Feature Branch**: `002-webrtc-h264-p2p`  
**Created**: 2026-03-29  
**Status**: Draft  
**Input**: User description: "Implement a strictly peer-to-peer (P2P) WebRTC implementation with a Next.js frontend and Go backend signaling relay, prioritizing H.264 codec for NVENC hardware acceleration."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - High-Performance P2P Video Streaming (Priority: P1)

As a user, I want to establish a direct video connection with another user that utilizes my hardware's encoding capabilities so that I can have a low-latency, high-quality video call with minimal CPU usage.

**Why this priority**: This is the core functionality of the feature. Without the ability to establish a P2P connection and stream video, the feature has no value.

**Independent Test**: Can be tested by opening two browser instances, connecting them via a session ID, and confirming that video is flowing between them without a media server.

**Acceptance Scenarios**:

1. **Given** two users on the same signaling server, **When** User A initiates a call to User B, **Then** a peer-to-peer connection is established.
2. **Given** an active P2P connection, **When** video is transmitted, **Then** the receiver sees the video stream with minimal latency.

---

### User Story 2 - Hardware-Accelerated Encoding (Priority: P2)

As a user with a dedicated GPU, I want the system to prioritize H.264 encoding so that my hardware (NVENC) is used for video processing, preserving my CPU for other tasks.

**Why this priority**: This is the key optimization requested. It ensures the application performs efficiently on supported hardware.

**Independent Test**: Can be tested by checking `chrome://webrtc-internals` during a call and verifying that the `encoderImplementation` is not a software-only encoder (like libx264).

**Acceptance Scenarios**:

1. **Given** a browser that supports H.264 hardware encoding, **When** a WebRTC connection is initialized, **Then** the SDP offer contains H.264 as the preferred codec.
2. **Given** an active call, **When** inspecting internal stats, **Then** the codec is confirmed as `video/H264`.

---

### User Story 3 - Agnostic Signaling Relay (Priority: P3)

As a developer, I want the signaling backend to relay messages without inspecting their content so that the system remains scalable and private.

**Why this priority**: Ensures the backend architecture is clean and focuses only on its primary responsibility: routing.

**Independent Test**: Can be tested by sending arbitrary JSON payloads through the signaling WebSocket and verifying they are delivered to the target peer unchanged.

**Acceptance Scenarios**:

1. **Given** a WebSocket connection to the Go backend, **When** a message is sent with a `targetId`, **Then** the backend routes that message to the correct user.
2. **Given** a signaling message (Offer/Answer/ICE), **When** relayed by the backend, **Then** the payload remains identical to what was sent.

---

### Edge Cases

- **What happens when H.264 is not supported by the receiver?** The system will automatically fall back to the next best available codec (e.g., VP8 or VP9) to ensure the connection is established, though hardware acceleration may not be utilized.
- **How does the system handle signaling connection drops?** The P2P connection should persist if already established, but new ICE candidates cannot be exchanged. If the connection fails, users may need to re-join the session.
- **What happens if the STUN server is unreachable?** P2P connection will fail unless peers are on the same local network.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Next.js frontend MUST request and obtain user media (camera/mic) before initiating signaling.
- **FR-002**: Next.js frontend MUST implement a transceiver-based approach to set codec preferences.
- **FR-003**: Next.js frontend MUST prioritize H.264 codecs in the `RTCPeerConnection` configuration for NVENC optimization.
- **FR-004**: Next.js frontend MUST implement graceful fallback to other supported codecs (VP8/VP9) if H.264 is rejected or unsupported.
- **FR-005**: Next.js frontend MUST generate a shareable URL and QR code for the session to allow a second peer to join.
- **FR-006**: Next.js frontend MUST integrate with the existing `monolith-drop` signaling API to map room codes to peer IPs/sessions.
- **FR-007**: Go backend MUST provide a WebSocket-based signaling server using `gorilla/websocket`.
- **FR-008**: Go backend MUST maintain a mapping of session IDs to active WebSocket connections.
- **FR-009**: Go backend MUST relay SDP and ICE candidate messages to the specified `targetId`.

### Key Entities *(include if feature involves data)*

- **Signaling Message**: Represents the payload exchanged via WebSockets. Attributes include `type` (offer, answer, ice-candidate), `targetId`, and `payload`.
- **WebRTC Session**: Represents an active or pending P2P connection between two specific peers, managed via the signaling API.
- **Room Code**: A short, human-readable identifier (or UUID) mapped to a specific signaling session.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: P2P video connection is established in under 5 seconds from the moment both peers join a session.
- **SC-002**: 100% of sessions on H.264-capable hardware use H.264 as the primary video codec.
- **SC-003**: Signaling message relay latency in the Go backend is consistently under 50ms (excluding network transport).
- **SC-004**: Users can verify hardware encoding via standard browser diagnostic tools (`chrome://webrtc-internals`).

## Assumptions

- **Target Browsers**: Users are primarily using modern Chromium-based browsers for hardware acceleration verification.
- **Signaling Security**: Existing authentication mechanisms in the Swiss project will be leveraged to secure WebSocket connections.
- **Network Environment**: A public STUN server (e.g., Google's) is sufficient for NAT traversal in most environments.
- **Scope**: TURN (relay) servers are out of scope for this initial P2P-only implementation.
