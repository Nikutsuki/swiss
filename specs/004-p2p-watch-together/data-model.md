# Phase 1: Data Model

## Backend Entities (In-Memory)

### Lobby
- `ID`: string (UUID or short alphanumeric)
- `HostID`: string (Peer ID of the creator)
- `Participants`: Map<string, Participant>
- `CreatedAt`: timestamp

### Participant
- `ID`: string (UUID)
- `WebSocketConn`: reference to active connection
- `JoinedAt`: timestamp

## Frontend Entities (Client-Side State)

### PeerConnection
- `PeerID`: string
- `Connection`: RTCPeerConnection
- `DataChannel`: RTCDataChannel
- `Stream`: MediaStream (optional)

### ChatMessage
- `SenderID`: string
- `Text`: string
- `Timestamp`: number

### PlaybackState
- `IsPlaying`: boolean
- `CurrentTime`: number
- `LastUpdated`: number
- `UpdatedBy`: string (PeerID)