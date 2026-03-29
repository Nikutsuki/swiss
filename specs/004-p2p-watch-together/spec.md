# Feature Specification: P2P Watch Together Streaming

**Feature Branch**: `004-p2p-watch-together`  
**Created**: 2026-03-29  
**Status**: Draft  
**Input**: User description: "i wanna make an application that will let the user stream their screen/window with sound from their browser OR a video file from their disk, also with sound, to other peer to peer connected users. one person would create a lobby, others would join through a link or qr code, anyone in the lobby can start a stream and others can watch. people would also be able to chat using a built in chat. the website should kinda act like watch together, if the user is streaming a video file from disk, a shared progress bar and stop/play button should be available, so anyone watching can rewind or go forward, and stop or start the playback."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create and Join a Lobby (Priority: P1)

A user needs to be able to create a lobby and invite others via a link or QR code so that multiple users can connect directly to each other to share streams.

**Why this priority**: Without a lobby and peer-to-peer connection mechanism, no streaming or chatting can occur. This is the foundational feature.

**Independent Test**: Can be fully tested by one user creating a lobby and another user joining via the provided link or scanning the QR code, successfully establishing a connection without any media streaming active.

**Acceptance Scenarios**:

1. **Given** a user is on the application home page, **When** they click "Create Lobby", **Then** a new lobby is generated and a unique join link and QR code are displayed.
2. **Given** a user has a valid join link, **When** they navigate to that link, **Then** they successfully join the lobby and can see other connected participants.
3. **Given** a user has a QR code, **When** they scan it with a compatible device, **Then** they are redirected to the lobby and join successfully.

---

### User Story 2 - Share Screen/Window or Local Video (Priority: P1)

Any user in a lobby needs to be able to select a local video file or choose to share their screen/window (including audio) so that other participants in the lobby can watch the stream.

**Why this priority**: Streaming media is the core value proposition of the application.

**Independent Test**: Can be tested by having a user in a lobby start a stream (either screen share or local file) and verifying that the media (video and audio) is transmitted to other users in the same lobby.

**Acceptance Scenarios**:

1. **Given** a user is in a lobby, **When** they choose to share their screen/window, **Then** their screen/window and system audio are streamed to all other participants.
2. **Given** a user is in a lobby, **When** they select a local video file from their disk, **Then** the video file and its audio are streamed to all other participants.
3. **Given** a user is actively streaming, **When** they choose to stop streaming, **Then** the stream terminates for all viewers.

---

### User Story 3 - Synchronized Playback Controls for Video Files (Priority: P2)

When a user is streaming a local video file, all participants need access to synchronized playback controls (play/pause, seek) so that the viewing experience is perfectly aligned for everyone in the lobby, similar to Watch Together.

**Why this priority**: Enhances the collaborative viewing experience significantly, but is secondary to the basic streaming capability itself.

**Independent Test**: Can be tested by one user streaming a local video file and any participant attempting to pause or seek the video, verifying that the playback state updates simultaneously for all viewers.

**Acceptance Scenarios**:

1. **Given** a local video file is being streamed in the lobby, **When** any participant clicks pause, **Then** the video pauses for everyone in the lobby at the same timestamp.
2. **Given** a local video file is being streamed and is paused, **When** any participant clicks play, **Then** the video resumes playing for everyone.
3. **Given** a local video file is being streamed, **When** any participant seeks to a specific point on the progress bar, **Then** the video jumps to that exact point for everyone in the lobby.

---

### User Story 4 - Built-in Text Chat (Priority: P3)

Users in a lobby need to be able to communicate via text chat so they can discuss the stream or coordinate playback without relying on external tools.

**Why this priority**: Chat is a standard feature for collaborative spaces but is not strictly required for the core streaming or synchronization to function.

**Independent Test**: Can be tested by users sending text messages in the lobby chat and verifying that the messages appear in real-time for all other participants.

**Acceptance Scenarios**:

1. **Given** a user is in a lobby, **When** they type and send a message in the chat area, **Then** the message appears in the chat history for all participants.
2. **Given** a user has just joined an active lobby, **When** they view the chat, **Then** they can see the recent chat history.

## Clarifications
### Session 2026-03-29
- Q: Conflict resolution for simultaneous sync commands? → A: Last Action Wins
- Q: Behavior when joining an active video stream? → A: Immediate Sync to Host
- Q: Behavior when a peer buffers due to network drop? → A: Continue Playing, peer skips to current timestamp upon reconnect
- Q: Behavior when seeking past video duration? → A: Prevent Seek
- Q: Behavior when WebRTC is unsupported? → A: Fallback to Chat Only

### Edge Cases

- **Abrupt Disconnects**: If a user disconnects abruptly, the system will seamlessly attempt to reconnect them in the background without disrupting already connected users.
- **Buffering/Network Drops**: If a user starts buffering due to a poor network, the stream continues for everyone else. When the struggling peer recovers, they immediately skip to the host's current timestamp.
- **Invalid Seek Limits**: The system prevents users from seeking past the total duration of a local video file. Attempts to do so are ignored or clamped to the maximum duration.
- **Concurrent Streams**: If multiple users start streaming simultaneously, all streams will be supported and displayed concurrently, even if overall media quality degrades.
- **Concurrent Playback Controls**: If multiple users send sync commands simultaneously, the last received action wins and applies to all peers.
- **Late Joiners**: A user joining a lobby where a local video file is already playing halfway through will immediately sync to the host's current timestamp.
- **Unsupported WebRTC**: If a user's browser does not support peer-to-peer WebRTC connections, the system will fallback to a text-only chat mode (via the signaling server if necessary), but disable all media streaming and viewing capabilities.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow users to create a new, unique lobby instance.
- **FR-002**: System MUST generate a shareable URL link for each lobby.
- **FR-003**: System MUST generate a scannable QR code representing the lobby's shareable URL.
- **FR-004**: System MUST allow multiple users to join the same lobby simultaneously.
- **FR-005**: System MUST establish peer-to-peer connections between all users within a given lobby for data transmission.
- **FR-006**: System MUST allow any user in a lobby to initiate a screen/window sharing session, capturing both video and system audio.
- **FR-007**: System MUST allow any user in a lobby to select a local media file (video) and stream it, including its audio track, to other users.
- **FR-008**: System MUST display the active stream to all connected participants in the lobby.
- **FR-009**: System MUST present synchronized playback controls (play, pause, seek/progress bar) ONLY when a local media file is being streamed.
- **FR-010**: System MUST NOT present synchronized playback controls when a user is sharing their live screen/window.
- **FR-011**: System MUST broadcast playback control events (play, pause, seek) initiated by any user to all other users in the lobby to maintain synchronized state.
- **FR-012**: System MUST provide a text chat interface within the lobby.
- **FR-013**: System MUST broadcast text chat messages to all participants currently in the lobby.
- **FR-014**: System MUST gracefully handle participant disconnections, updating the lobby state for remaining users.

### Key Entities *(include if feature involves data)*

- **Lobby**: Represents a collaborative session. Contains participants, an active stream state (none, screen, file), and chat history.
- **Participant**: A user connected to a specific lobby. Has an identifier and connection state.
- **Stream**: The active media being shared. Can be a live screen capture or a specific media file instance with current playback state (timestamp, playing/paused).
- **Message**: A text chat entry containing the sender, content, and timestamp.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can create a lobby and have another user join via link in under 10 seconds.
- **SC-002**: Video and audio streaming (both screen share and local file) maintains high playback quality (no choppy audio, no lagging video) with less than 3 seconds latency between peers under normal network conditions. Low latency is secondary to smooth playback.
- **SC-003**: Playback synchronization events (play/pause/seek) reflect on all peer screens within 200ms of the action being taken.
- **SC-004**: System supports lobbies with at least 5 concurrent participants without significant degradation in stream quality or synchronization.
- **SC-005**: Chat messages are delivered to all connected peers within 100ms.

## Assumptions

- Users have modern web browsers that fully support WebRTC for peer-to-peer data, video, and audio channels.
- Users have adequate internet upload/download bandwidth to support peer-to-peer video streaming.
- For local file streaming, the selected file format is natively supported for playback by modern web browsers (e.g., MP4, WebM).
- "Built-in chat" refers to a simple text chat and does not require rich media, file attachments, or persistent history after the lobby is destroyed.
- A signaling server is available or will be implemented to facilitate the initial WebRTC connection handshake (SDP exchange), though actual streaming is peer-to-peer.ial WebRTC connection handshake (SDP exchange), though actual streaming is peer-to-peer.