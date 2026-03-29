package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/nikut/swiss/services/monolith-stream-api/models"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 512 * 1024 // 512KB for SDPs
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for development
	},
}

type Hub struct {
	lobbies map[string]*models.Lobby
	mu      sync.RWMutex
}

func NewHub() *Hub {
	return &Hub{
		lobbies: make(map[string]*models.Lobby),
	}
}

func (h *Hub) Run() {
	// Periodic cleanup of empty lobbies could go here
}

func ServeWs(hub *Hub, w http.ResponseWriter, r *http.Request) {
	// Extract lobby ID from URL: /stream/v1/lobby/{lobby_id}
	pathParts := strings.Split(r.URL.Path, "/")
	if len(pathParts) < 5 {
		http.Error(w, "Invalid lobby ID", http.StatusBadRequest)
		return
	}
	lobbyID := pathParts[4]

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("upgrade error:", err)
		return
	}

	client := &models.Participant{
		LobbyID:       lobbyID,
		WebSocketConn: conn,
		JoinedAt:      time.Now(),
		Send:          make(chan []byte, 256),
	}

	go writePump(client)
	go readPump(hub, client)
}

func readPump(hub *Hub, client *models.Participant) {
	defer func() {
		hub.removeParticipant(client)
		client.WebSocketConn.Close()
	}()

	client.WebSocketConn.SetReadLimit(maxMessageSize)
	client.WebSocketConn.SetReadDeadline(time.Now().Add(pongWait))
	client.WebSocketConn.SetPongHandler(func(string) error { client.WebSocketConn.SetReadDeadline(time.Now().Add(pongWait)); return nil })

	for {
		_, message, err := client.WebSocketConn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("error: %v", err)
			}
			break
		}

		var msg models.Message
		if err := json.Unmarshal(message, &msg); err != nil {
			log.Println("unmarshal error:", err)
			continue
		}

		handleMessage(hub, client, msg)
	}
}

func writePump(client *models.Participant) {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		client.WebSocketConn.Close()
	}()
	for {
		select {
		case message, ok := <-client.Send:
			client.WebSocketConn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// The hub closed the channel.
				client.WebSocketConn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := client.WebSocketConn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			// Add queued chat messages to the current websocket message.
			n := len(client.Send)
			for i := 0; i < n; i++ {
				w.Write(<-client.Send)
			}

			if err := w.Close(); err != nil {
				return
			}
		case <-ticker.C:
			client.WebSocketConn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := client.WebSocketConn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func handleMessage(hub *Hub, client *models.Participant, msg models.Message) {
	switch msg.Type {
	case "join":
		client.ID = msg.Payload.PeerID
		hub.addParticipant(client)
		// Notify others
		broadcastToLobby(hub, client.LobbyID, client.ID, models.Message{
			Type: "peer_joined",
			Payload: models.MessagePayload{
				PeerID: client.ID,
			},
		})
	case "offer", "answer", "ice_candidate":
		// Route to specific peer
		hub.mu.RLock()
		if lobby, ok := hub.lobbies[client.LobbyID]; ok {
			if target, ok := lobby.Participants[msg.TargetPeerID]; ok {
				// Forward the message, adding the sender's ID
				forwardMsg := msg
				forwardMsg.Payload.PeerID = client.ID
				b, _ := json.Marshal(forwardMsg)
				target.Send <- b
			}
		}
		hub.mu.RUnlock()
	}
}

func (h *Hub) addParticipant(p *models.Participant) {
	h.mu.Lock()
	defer h.mu.Unlock()

	lobby, ok := h.lobbies[p.LobbyID]
	if !ok {
		lobby = &models.Lobby{
			ID:           p.LobbyID,
			HostID:       p.ID,
			Participants: make(map[string]*models.Participant),
			CreatedAt:    time.Now(),
		}
		h.lobbies[p.LobbyID] = lobby
	}
	lobby.Participants[p.ID] = p
}

func (h *Hub) removeParticipant(p *models.Participant) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if lobby, ok := h.lobbies[p.LobbyID]; ok {
		if _, ok := lobby.Participants[p.ID]; ok {
			delete(lobby.Participants, p.ID)
			close(p.Send)

			// Broadcast peer left
			if len(lobby.Participants) > 0 {
				// Unlock so broadcast can acquire RLock
				h.mu.Unlock()
				broadcastToLobby(h, p.LobbyID, p.ID, models.Message{
					Type: "peer_left",
					Payload: models.MessagePayload{
						PeerID: p.ID,
					},
				})
				h.mu.Lock()
			} else {
				delete(h.lobbies, p.LobbyID) // Cleanup empty lobby
			}
		}
	}
}

func broadcastToLobby(h *Hub, lobbyID string, excludePeerID string, msg models.Message) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	if lobby, ok := h.lobbies[lobbyID]; ok {
		b, _ := json.Marshal(msg)
		for id, p := range lobby.Participants {
			if id != excludePeerID {
				select {
				case p.Send <- b:
				default:
					// Cannot send, maybe channel full
				}
			}
		}
	}
}