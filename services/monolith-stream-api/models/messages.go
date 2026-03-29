package models

import "encoding/json"

// SignalingMessage is the wire envelope forwarded by the relay. Payload is opaque (SDP, ICE JSON, etc.).
// Field names match @swiss/webrtc-signaling and services/signaling-api.
type SignalingMessage struct {
	Type    string          `json:"type"`
	Target  string          `json:"target"`
	Sender  string          `json:"sender"`
	Payload json.RawMessage `json:"payload"`
}

// SignalingErrorPayload is embedded in SignalingMessage.Payload when type is "error".
type SignalingErrorPayload struct {
	Message string `json:"message"`
}
