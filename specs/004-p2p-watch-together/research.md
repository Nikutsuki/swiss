# Phase 0: Research

## WebRTC Signaling
**Decision**: Use WebSockets in Golang with custom JSON message passing for WebRTC signaling (SDP offers/answers and ICE candidates).
**Rationale**: WebSockets provide low-latency, full-duplex communication ideal for signaling. Golang's concurrency model handles many active WebSocket connections efficiently.
**Alternatives considered**: Server-Sent Events (SSE) with HTTP POST (less efficient for two-way), third-party signaling services (adds external dependency).

## WebRTC Data Channels vs Media Streams
**Decision**: Use `MediaStream` for video/audio and a reliable `RTCDataChannel` for chat messages and synchronized playback events (play, pause, seek).
**Rationale**: `MediaStream` is optimized for real-time media, dropping frames if necessary to maintain latency. `RTCDataChannel` (configured as reliable) ensures chat and control events are delivered guaranteed.
**Alternatives considered**: Using WebSockets for chat and control events. Rejected because peer-to-peer data channels offer lower latency and less server load for intra-lobby communication.

## React Rendering Optimization
**Decision**: Extract WebRTC state (connections, streams, chat history) into a Context or global store (Zustand) and strictly use selective rendering (memoization, `useMemo`, `useCallback`) to prevent video player re-renders when chat updates.
**Rationale**: Unnecessary re-renders of the video component can cause playback stutter. Isolating chat state from media state is crucial.
**Alternatives considered**: Putting all state in a single top-level React component. Rejected due to performance constraints.

## NAT Traversal
**Decision**: Use public STUN servers (e.g., Google's) for initial ICE candidate gathering. For a robust MVP, TURN servers may be required later if strict firewalls block P2P connections, but we will start with STUN.
**Rationale**: STUN covers most typical home network scenarios.
**Alternatives considered**: Deploying a custom TURN server (adds significant operational overhead for MVP).