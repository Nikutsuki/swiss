package handlers

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type chatTokenPayload struct {
	SessionID string `json:"session_id"`
	PeerID    string `json:"peer_id"`
	Sub       string `json:"sub"`
	Email     string `json:"email"`
	Exp       int64  `json:"exp"`
}

type chatPeer struct {
	conn    *websocket.Conn
	peerID  string
	session string
	email   string
	sub     string
	writeMu sync.Mutex
}

// ChatHub broadcasts chat messages within a session (authenticated via HMAC token from Next).
type ChatHub struct {
	upgrader websocket.Upgrader
	secrets  []string

	mu    sync.Mutex
	rooms map[string]*chatRoom
}

type chatRoom struct {
	sessionID string
	peers     map[string]*chatPeer
	mu        sync.Mutex
}

// NewChatHub creates a chat WebSocket hub.
func NewChatHub(allowedOrigins []string) *ChatHub {
	originSet := make(map[string]struct{}, len(allowedOrigins))
	for _, o := range allowedOrigins {
		o = strings.TrimSpace(o)
		if o != "" {
			originSet[o] = struct{}{}
		}
	}
	secChat := strings.TrimSpace(os.Getenv("MONOLITH_STREAM_CHAT_HMAC_SECRET"))
	secJWT := strings.TrimSpace(os.Getenv("JWT_SECRET"))
	var secrets []string
	if secChat != "" {
		secrets = append(secrets, secChat)
	}
	if secJWT != "" && secJWT != secChat {
		secrets = append(secrets, secJWT)
	}
	return &ChatHub{
		secrets: secrets,
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
		rooms: make(map[string]*chatRoom),
	}
}

func verifyChatToken(token string, secrets []string) (*chatTokenPayload, error) {
	if len(secrets) == 0 {
		return nil, errors.New("no chat token secret configured")
	}
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return nil, errors.New("invalid token")
	}
	payloadB64, sigB64 := parts[0], parts[1]
	var lastErr error
	for _, sec := range secrets {
		mac := hmac.New(sha256.New, []byte(sec))
		mac.Write([]byte(payloadB64))
		expected := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
		if subtle.ConstantTimeCompare([]byte(expected), []byte(sigB64)) != 1 {
			lastErr = errors.New("bad signature")
			continue
		}
		raw, err := base64.RawURLEncoding.DecodeString(payloadB64)
		if err != nil {
			return nil, err
		}
		var p chatTokenPayload
		if err := json.Unmarshal(raw, &p); err != nil {
			return nil, err
		}
		if time.Now().Unix() > p.Exp {
			return nil, errors.New("token expired")
		}
		if strings.TrimSpace(p.SessionID) == "" || strings.TrimSpace(p.PeerID) == "" {
			return nil, errors.New("invalid claims")
		}
		return &p, nil
	}
	return nil, lastErr
}

// ServeChatWS handles GET /v1/stream/chat/ws?session_id=&peer_id=&token=
func (h *ChatHub) ServeChatWS(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	sessionID := strings.TrimSpace(r.URL.Query().Get("session_id"))
	peerID := strings.TrimSpace(r.URL.Query().Get("peer_id"))
	token := strings.TrimSpace(r.URL.Query().Get("token"))
	if sessionID == "" || peerID == "" || token == "" {
		http.Error(w, "session_id, peer_id, and token required", http.StatusBadRequest)
		return
	}

	claims, err := verifyChatToken(token, h.secrets)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if claims.SessionID != sessionID || claims.PeerID != peerID {
		http.Error(w, "token mismatch", http.StatusUnauthorized)
		return
	}

	c, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("chat websocket upgrade: %v", err)
		return
	}

	h.registerChatPeer(sessionID, peerID, claims.Email, claims.Sub, c)
	go h.pumpChatPeer(sessionID, peerID, claims.Email, c)
}

func (h *ChatHub) registerChatPeer(sessionID, peerID, email, sub string, conn *websocket.Conn) {
	h.mu.Lock()
	room := h.rooms[sessionID]
	if room == nil {
		room = &chatRoom{sessionID: sessionID, peers: make(map[string]*chatPeer)}
		h.rooms[sessionID] = room
	}
	h.mu.Unlock()

	room.mu.Lock()
	if old, ok := room.peers[peerID]; ok {
		_ = old.conn.Close()
		delete(room.peers, peerID)
	}
	room.peers[peerID] = &chatPeer{
		conn:    conn,
		peerID:  peerID,
		session: sessionID,
		email:   email,
		sub:     sub,
	}
	room.mu.Unlock()
	log.Printf("chat peer joined peer=%s session=%s", peerID, sessionID)
}

func (h *ChatHub) unregisterChatPeer(sessionID, peerID string) {
	h.mu.Lock()
	room := h.rooms[sessionID]
	h.mu.Unlock()
	if room == nil {
		return
	}
	room.mu.Lock()
	delete(room.peers, peerID)
	empty := len(room.peers) == 0
	room.mu.Unlock()
	log.Printf("chat peer left peer=%s session=%s", peerID, sessionID)
	if empty {
		h.mu.Lock()
		delete(h.rooms, sessionID)
		h.mu.Unlock()
	}
}

func (h *ChatHub) broadcastChat(sessionID, fromPeerID, fromEmail, text string) {
	h.mu.Lock()
	room := h.rooms[sessionID]
	h.mu.Unlock()
	if room == nil {
		return
	}
	ts := time.Now().Unix()
	payload, _ := json.Marshal(map[string]any{
		"type":     "chat",
		"senderId": fromPeerID,
		"email":    fromEmail,
		"text":     text,
		"ts":       ts,
	})
	room.mu.Lock()
	defer room.mu.Unlock()
	for _, p := range room.peers {
		p.writeMu.Lock()
		_ = p.conn.SetWriteDeadline(time.Now().Add(writeDeadline))
		_ = p.conn.WriteMessage(websocket.TextMessage, payload)
		p.writeMu.Unlock()
	}
}

func (h *ChatHub) pumpChatPeer(sessionID, peerID, email string, c *websocket.Conn) {
	defer func() {
		h.unregisterChatPeer(sessionID, peerID)
		_ = c.Close()
	}()

	c.SetReadLimit(64 * 1024)
	_ = c.SetReadDeadline(time.Now().Add(readDeadline))
	c.SetPongHandler(func(string) error {
		_ = c.SetReadDeadline(time.Now().Add(readDeadline))
		return nil
	})

	for {
		_, data, err := c.ReadMessage()
		if err != nil {
			return
		}
		var msg struct {
			Type string `json:"type"`
			Text string `json:"text"`
		}
		if err := json.Unmarshal(data, &msg); err != nil {
			continue
		}
		if msg.Type != "chat" || strings.TrimSpace(msg.Text) == "" {
			continue
		}
		t := strings.TrimSpace(msg.Text)
		if len(t) > 4000 {
			t = t[:4000]
		}
		h.broadcastChat(sessionID, peerID, email, t)
	}
}
