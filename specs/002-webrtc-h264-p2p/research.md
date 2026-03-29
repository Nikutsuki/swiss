# Research: P2P WebRTC H.264 Optimization

## Research Tasks

1.  **Codec Prioritization**: Investigate `RTCRtpTransceiver.setCodecPreferences` for H.264/NVENC.
2.  **Screen Capture**: Best practices for `getDisplayMedia` and track management.
3.  **Signaling Patterns**: Review `monolith-drop` signaling API for room/session management.

## Findings

### 1. Codec Prioritization (H.264/NVENC)

- **Decision**: Use `RTCRtpTransceiver.setCodecPreferences` after creating the transceiver.
- **Rationale**: This is the modern, standards-compliant way to suggest codec preferences to the media engine before creating an SDP offer.
- **Alternatives**: Manipulating SDP strings manually (regex). Rejected as brittle and error-prone.
- **Implementation Note**: Filter `RTCRtpReceiver.getCapabilities('video').codecs` for `video/H264` and move them to the front of the array.

### 2. Screen Capture (DisplayMedia)

- **Decision**: Use `navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })`.
- **Rationale**: Provides system-level dialog for window/screen selection.
- **Integration**: Add the resulting video track to the `RTCPeerConnection` via `addTransceiver` or `addTrack`.
- **Constraint**: Must handle `NotAllowedError` if the user cancels the selection.

### 3. Signaling Integration

- **Decision**: Reuse the room-based session model from `monolith-drop`.
- **Rationale**: Consistency across the Swiss ecosystem. Leverages existing patterns for `joinSecret` and `sessionId`.
- **Backend**: Go signaling server should act as a transparent relay for JSON messages containing a `targetId`.
- **Frontend**: Use the `@swiss/webrtc-signaling` package for core WebSocket and ICE candidate management.

## NEEDS CLARIFICATION Resolved

- **Fallback**: Graceful fallback to VP8/VP9 is confirmed by moving H.264 to the front rather than excluding other codecs.
- **Discovery**: Shareable URLs and QR codes will use the existing session API structure.
- **UI Scope**: Barebones UI confirmed, focusing on functional video display and room joining.
