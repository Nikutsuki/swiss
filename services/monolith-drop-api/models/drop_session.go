package models

// CreateDropSessionRequest is optional body for POST /v1/drop/sessions.
type CreateDropSessionRequest struct {
	ExpiresInSeconds *int64 `json:"expires_in_seconds"`
}

// CreateDropSessionResponse is returned when a host creates a session.
type CreateDropSessionResponse struct {
	SessionID     string  `json:"session_id"`
	PeerID        string  `json:"peer_id"`
	RemotePeerID  *string `json:"remote_peer_id"`
	Role          string  `json:"role"`
	JoinSecret    string  `json:"join_secret"`
	ExpiresAt     string  `json:"expires_at"`
	PeerHost      string  `json:"peer_host"`
	PeerGuest     *string `json:"peer_guest"`
}

// GetDropSessionResponse is returned from GET /v1/drop/sessions/{id} (join_secret omitted).
type GetDropSessionResponse struct {
	SessionID string  `json:"session_id"`
	PeerHost  string  `json:"peer_host"`
	PeerGuest *string `json:"peer_guest"`
	ExpiresAt string  `json:"expires_at"`
	CreatedAt string  `json:"created_at"`
	ClosedAt  *string `json:"closed_at"`
}

// JoinDropSessionRequest is the body for POST /v1/drop/sessions/join.
type JoinDropSessionRequest struct {
	JoinSecret string `json:"join_secret"`
}

// JoinDropSessionResponse is returned after a guest joins.
type JoinDropSessionResponse struct {
	SessionID    string `json:"session_id"`
	PeerID       string `json:"peer_id"`
	RemotePeerID string `json:"remote_peer_id"`
	Role         string `json:"role"`
	ExpiresAt    string `json:"expires_at"`
}

// CloseDropSessionResponse confirms close.
type CloseDropSessionResponse struct {
	SessionID string `json:"session_id"`
	Closed    bool   `json:"closed"`
}
