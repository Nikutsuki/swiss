package handlers

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/Nikutsuki/swiss/services/monolith-stream-api/models"
	"github.com/gorilla/websocket"
)

const (
	signalingSender       = "signaling"
	roomTTL               = 45 * time.Minute
	readDeadline          = 90 * time.Second
	writeDeadline         = 10 * time.Second
	pingInterval          = 30 * time.Second
	defaultMaxPeersPerSession = 16
	messageReadLimitBytes     = 512 * 1024
)

// ErrRoomFull is returned when the session has reached max peers.
var ErrRoomFull = errors.New("session room is full")

type streamPeer struct {
	conn    *websocket.Conn
	peerID  string
	session string
	writeMu sync.Mutex
}

// StreamSignalingHub relays WebSocket signaling messages within a session room.
type StreamSignalingHub struct {
	upgrader  websocket.Upgrader
	maxPeers  int

	mu    sync.Mutex
	rooms map[string]*streamRoom // sessionID -> room
}

type streamRoom struct {
	sessionID string
	peers     map[string]*streamPeer
	createdAt time.Time
	mu        sync.Mutex
}

// NewStreamSignalingHub creates a hub that validates Origin using allowedOrigins (nil/empty = allow all).
func NewStreamSignalingHub(allowedOrigins []string, maxPeersPerSession int) *StreamSignalingHub {
	if maxPeersPerSession < 2 {
		maxPeersPerSession = defaultMaxPeersPerSession
	}
	originSet := make(map[string]struct{}, len(allowedOrigins))
	for _, o := range allowedOrigins {
		o = strings.TrimSpace(o)
		if o != "" {
			originSet[o] = struct{}{}
		}
	}
	return &StreamSignalingHub{
		maxPeers: maxPeersPerSession,
		upgrader: websocket.Upgrader{
			ReadBufferSize:  4096,
			WriteBufferSize: 4096,
			CheckOrigin: func(r *http.Request) bool {
				if len(originSet) == 0 {
					return true
				}
				o := r.Header.Get("Origin")
				if o == "" {
					return false
				}
				_, ok := originSet[o]
				return ok
			},
		},
		rooms: make(map[string]*streamRoom),
	}
}

// ServeWS handles GET /v1/stream/ws?peer_id=...&session_id=...
func (h *StreamSignalingHub) ServeWS(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	peerID := strings.TrimSpace(r.URL.Query().Get("peer_id"))
	sessionID := strings.TrimSpace(r.URL.Query().Get("session_id"))
	if peerID == "" || sessionID == "" {
		http.Error(w, "peer_id and session_id query parameters are required", http.StatusBadRequest)
		return
	}

	if !h.sessionHasCapacity(sessionID) {
		http.Error(w, "session room is full", http.StatusForbidden)
		return
	}

	c, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("stream signaling websocket upgrade: %v", err)
		return
	}

	room, err := h.registerPeer(sessionID, peerID, c)
	if err != nil {
		log.Printf("stream signaling register peer %s session %s: %v", peerID, sessionID, err)
		if errors.Is(err, ErrRoomFull) {
			_ = c.WriteMessage(websocket.CloseMessage,
				websocket.FormatCloseMessage(websocket.ClosePolicyViolation, "session room is full"))
		}
		_ = c.Close()
		return
	}

	log.Printf("stream signaling peer connected peer=%s session=%s (room peers=%d)", peerID, sessionID, room.peerCount())

	go h.pumpPeer(room, peerID)
}

func (h *StreamSignalingHub) sessionHasCapacity(sessionID string) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	room := h.rooms[sessionID]
	if room == nil {
		return true
	}
	return room.peerCount() < h.maxPeers
}

func (h *StreamSignalingHub) registerPeer(sessionID, peerID string, c *websocket.Conn) (*streamRoom, error) {
	h.mu.Lock()
	defer h.mu.Unlock()

	room := h.rooms[sessionID]
	if room == nil {
		room = &streamRoom{
			sessionID: sessionID,
			peers:     make(map[string]*streamPeer),
			createdAt: time.Now(),
		}
		h.rooms[sessionID] = room
	}

	room.mu.Lock()
	defer room.mu.Unlock()

	if len(room.peers) >= h.maxPeers {
		return nil, ErrRoomFull
	}

	if _, exists := room.peers[peerID]; exists {
		old := room.peers[peerID]
		_ = old.conn.Close()
		delete(room.peers, peerID)
	}

	p := &streamPeer{conn: c, peerID: peerID, session: sessionID}
	room.peers[peerID] = p

	var others []string
	for id := range room.peers {
		if id != peerID {
			others = append(others, id)
		}
	}
	for _, otherID := range others {
		h.notifyPeerJoined(room, peerID, otherID)
		h.notifyPeerJoined(room, otherID, peerID)
	}

	return room, nil
}

func (h *StreamSignalingHub) notifyPeerJoined(room *streamRoom, targetPeer, remotePeer string) {
	p := room.peers[targetPeer]
	if p == nil {
		return
	}
	payload, _ := json.Marshal(struct {
		PeerID string `json:"peerId"`
	}{PeerID: remotePeer})
	msg := models.SignalingMessage{
		Type:    "peer-joined",
		Target:  targetPeer,
		Sender:  signalingSender,
		Payload: payload,
	}
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	p.writeMu.Lock()
	_ = p.conn.SetWriteDeadline(time.Now().Add(writeDeadline))
	err = p.conn.WriteMessage(websocket.TextMessage, data)
	p.writeMu.Unlock()
	if err != nil {
		log.Printf("stream signaling peer-joined to %s: %v", targetPeer, err)
	}
}

func (h *StreamSignalingHub) notifyPeerLeft(room *streamRoom, targetPeer, leftPeer string) {
	p := room.peers[targetPeer]
	if p == nil {
		return
	}
	payload, _ := json.Marshal(struct {
		PeerID string `json:"peerId"`
	}{PeerID: leftPeer})
	msg := models.SignalingMessage{
		Type:    "peer-left",
		Target:  targetPeer,
		Sender:  signalingSender,
		Payload: payload,
	}
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	p.writeMu.Lock()
	_ = p.conn.SetWriteDeadline(time.Now().Add(writeDeadline))
	err = p.conn.WriteMessage(websocket.TextMessage, data)
	p.writeMu.Unlock()
	if err != nil {
		log.Printf("stream signaling peer-left to %s: %v", targetPeer, err)
	}
}

func (h *StreamSignalingHub) unregisterPeer(sessionID, peerID string) {
	h.mu.Lock()
	room := h.rooms[sessionID]
	h.mu.Unlock()
	if room == nil {
		return
	}

	room.mu.Lock()
	delete(room.peers, peerID)
	remaining := make([]string, 0, len(room.peers))
	for id := range room.peers {
		remaining = append(remaining, id)
	}
	empty := len(room.peers) == 0
	room.mu.Unlock()

	log.Printf("stream signaling peer disconnected peer=%s session=%s", peerID, sessionID)

	for _, id := range remaining {
		h.notifyPeerLeft(room, id, peerID)
	}

	if empty {
		h.mu.Lock()
		if r := h.rooms[sessionID]; r != nil && r.peerCountLocked() == 0 {
			delete(h.rooms, sessionID)
		}
		h.mu.Unlock()
	}
}

func (r *streamRoom) peerCount() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.peers)
}

func (r *streamRoom) peerCountLocked() int {
	return len(r.peers)
}

func (h *StreamSignalingHub) lookupPeer(sessionID, targetPeerID string) *streamPeer {
	h.mu.Lock()
	room := h.rooms[sessionID]
	h.mu.Unlock()
	if room == nil {
		return nil
	}
	room.mu.Lock()
	defer room.mu.Unlock()
	return room.peers[targetPeerID]
}

func peerSendError(c *websocket.Conn, detail string) {
	pbytes, _ := json.Marshal(models.SignalingErrorPayload{Message: detail})
	msg := models.SignalingMessage{
		Type:    "error",
		Target:  "",
		Sender:  signalingSender,
		Payload: pbytes,
	}
	data, _ := json.Marshal(msg)
	_ = c.SetWriteDeadline(time.Now().Add(writeDeadline))
	_ = c.WriteMessage(websocket.TextMessage, data)
}

func (h *StreamSignalingHub) forwardRaw(sessionID, fromPeerID string, data []byte) error {
	var env models.SignalingMessage
	if err := json.Unmarshal(data, &env); err != nil {
		return errInvalidEnvelope{}
	}
	target := strings.TrimSpace(env.Target)
	if target == "" {
		return errTargetRequired{}
	}

	dst := h.lookupPeer(sessionID, target)
	if dst == nil {
		return errTargetGone{}
	}

	dst.writeMu.Lock()
	defer dst.writeMu.Unlock()
	_ = dst.conn.SetWriteDeadline(time.Now().Add(writeDeadline))
	return dst.conn.WriteMessage(websocket.TextMessage, data)
}

type errInvalidEnvelope struct{}

func (errInvalidEnvelope) Error() string { return "invalid JSON envelope" }

type errTargetRequired struct{}

func (errTargetRequired) Error() string { return "target required" }

type errTargetGone struct{}

func (errTargetGone) Error() string { return "target peer not connected" }

func (h *StreamSignalingHub) pumpPeer(room *streamRoom, peerID string) {
	sessionID := room.sessionID
	room.mu.Lock()
	p := room.peers[peerID]
	room.mu.Unlock()
	if p == nil {
		return
	}
	c := p.conn

	defer func() {
		h.unregisterPeer(sessionID, peerID)
		_ = c.Close()
	}()

	c.SetReadLimit(messageReadLimitBytes)
	_ = c.SetReadDeadline(time.Now().Add(readDeadline))
	c.SetPongHandler(func(string) error {
		_ = c.SetReadDeadline(time.Now().Add(readDeadline))
		return nil
	})

	done := make(chan struct{})
	go func() {
		t := time.NewTicker(pingInterval)
		defer t.Stop()
		for {
			select {
			case <-done:
				return
			case <-t.C:
				p.writeMu.Lock()
				_ = c.SetWriteDeadline(time.Now().Add(writeDeadline))
				err := c.WriteMessage(websocket.PingMessage, nil)
				p.writeMu.Unlock()
				if err != nil {
					return
				}
			}
		}
	}()
	defer close(done)

	for {
		_, data, err := c.ReadMessage()
		if err != nil {
			return
		}
		if err := h.forwardRaw(sessionID, peerID, data); err != nil {
			switch err.(type) {
			case errInvalidEnvelope:
				peerSendError(c, err.Error())
			case errTargetRequired:
				peerSendError(c, err.Error())
			case errTargetGone:
				peerSendError(c, err.Error())
			default:
				peerSendError(c, "relay failed")
				log.Printf("stream signaling relay peer=%s: %v", peerID, err)
			}
		}
	}
}

// ExpireStaleRooms closes peers in sessions older than roomTTL (session lifetime cap).
func (h *StreamSignalingHub) ExpireStaleRooms(now time.Time) {
	h.mu.Lock()
	var toClose []*streamPeer
	for _, room := range h.rooms {
		room.mu.Lock()
		if now.Sub(room.createdAt) > roomTTL {
			for _, p := range room.peers {
				toClose = append(toClose, p)
			}
		}
		room.mu.Unlock()
	}
	h.mu.Unlock()
	for _, p := range toClose {
		log.Printf("stream signaling session TTL closing peer=%s session=%s", p.peerID, p.session)
		_ = p.conn.Close()
	}
}
