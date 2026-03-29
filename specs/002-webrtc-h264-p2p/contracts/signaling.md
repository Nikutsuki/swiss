# Signaling Contract: P2P WebRTC H.264 Optimization

## WebSocket Communication

All messages MUST be valid JSON. The Go backend MUST relay these messages without inspection except for the `targetId` field used for routing.

### 1. Peer Identity (Client to Server)

Sent by a peer upon initial connection to register its ID with the signaling server.

```json
{
  "type": "identity",
  "senderId": "peer-uuid-123"
}
```

### 2. SDP Offer (Client A to Client B)

Relayed by the server to the `targetId`.

```json
{
  "type": "offer",
  "senderId": "host-id",
  "targetId": "guest-id",
  "payload": {
    "type": "offer",
    "sdp": "v=0\r\no=- 1234567890 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\n..."
  }
}
```

### 3. SDP Answer (Client B to Client A)

Relayed by the server to the `targetId`.

```json
{
  "type": "answer",
  "senderId": "guest-id",
  "targetId": "host-id",
  "payload": {
    "type": "answer",
    "sdp": "v=0\r\no=- 0987654321 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\n..."
  }
}
```

### 4. ICE Candidate

Used for NAT traversal. Relayed to the `targetId`.

```json
{
  "type": "ice-candidate",
  "senderId": "peer-id",
  "targetId": "other-id",
  "payload": {
    "candidate": "candidate:123456789 1 udp 2122260223 192.168.1.100 56789 typ host ...",
    "sdpMid": "0",
    "sdpMLineIndex": 0
  }
}
```
