package models

import (
	"time"

	"github.com/gorilla/websocket"
)

type Lobby struct {
	ID           string
	HostID       string
	Participants map[string]*Participant
	CreatedAt    time.Time
}

type Participant struct {
	ID            string
	LobbyID       string
	WebSocketConn *websocket.Conn
	JoinedAt      time.Time
	Send          chan []byte
}

type Message struct {
	Type         string          `json:"type"`
	TargetPeerID string          `json:"target_peer_id,omitempty"`
	Payload      MessagePayload  `json:"payload"`
}

type MessagePayload struct {
	PeerID    string `json:"peer_id,omitempty"`
	SDP       string `json:"sdp,omitempty"`
	Candidate string `json:"candidate,omitempty"`
}