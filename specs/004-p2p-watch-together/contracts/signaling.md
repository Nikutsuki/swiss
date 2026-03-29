# Signaling Server WebSocket Contract

**Path**: `wss://api.domain/stream/v1/lobby/{lobby_id}`

## Client-to-Server Messages

### Join Lobby
```json
{
  "type": "join",
  "payload": {
    "peer_id": "uuid-string"
  }
}
```

### WebRTC Offer
```json
{
  "type": "offer",
  "target_peer_id": "uuid-string",
  "payload": {
    "sdp": "..."
  }
}
```

### WebRTC Answer
```json
{
  "type": "answer",
  "target_peer_id": "uuid-string",
  "payload": {
    "sdp": "..."
  }
}
```

### ICE Candidate
```json
{
  "type": "ice_candidate",
  "target_peer_id": "uuid-string",
  "payload": {
    "candidate": "..."
  }
}
```

## Server-to-Client Messages

### Peer Joined
```json
{
  "type": "peer_joined",
  "payload": {
    "peer_id": "uuid-string"
  }
}
```

### Peer Left
```json
{
  "type": "peer_left",
  "payload": {
    "peer_id": "uuid-string"
  }
}
```
*(Plus forwarding of offer, answer, and ice_candidate messages)*

---

# WebRTC Data Channel Contract (P2P)

**Channel Name**: `watch-together-data`

## Chat Message
```json
{
  "type": "chat",
  "payload": {
    "text": "Hello world",
    "timestamp": 1678888888
  }
}
```

## Playback Sync Event
```json
{
  "type": "sync",
  "payload": {
    "action": "play" | "pause" | "seek",
    "time": 12.5,
    "timestamp": 1678888888
  }
}
```