# Data Model: P2P WebRTC H.264 Optimization

## Entities

### SignalingMessage (WebSocket)

The payload sent between peers through the Go signaling relay.

- **type**: `string` - One of: `offer`, `answer`, `ice-candidate`, `identity`.
- **targetId**: `string` - Peer ID of the recipient.
- **senderId**: `string` - Peer ID of the sender.
- **payload**: `any` - The SDP session description or ICE candidate object.

### StreamSession (API)

Represents a logical room for a P2P streaming connection.

- **sessionId**: `string` - Unique identifier for the room.
- **joinSecret**: `string` - Secret required to join as a guest.
- **hostPeerId**: `string` - Unique ID of the streaming peer.
- **guestPeerId**: `string | null` - Unique ID of the receiving peer (once joined).
- **createdAt**: `datetime` - When the session was initialized.
- **expiresAt**: `datetime` - When the signaling room expires.

## State Transitions

1.  **PENDING**: Session created by host, waiting for guest.
2.  **READY**: Guest joined via secret, signaling starts.
3.  **CONNECTED**: P2P connection established.
4.  **EXPIRED**: Session time limit reached or peer disconnected.
