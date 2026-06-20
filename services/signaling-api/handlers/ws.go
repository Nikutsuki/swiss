package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/Nikutsuki/swiss/services/signaling-api/models"
	"github.com/gorilla/websocket"
)

func peerWriteJSON(pc *peerConn, v any) error {
	data, err := json.Marshal(v)
	if err != nil {
		return err
	}
	pc.writeMu.Lock()
	defer pc.writeMu.Unlock()
	_ = pc.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
	return pc.conn.WriteMessage(websocket.TextMessage, data)
}

func sendError(pc *peerConn, detail string) {
	pbytes, _ := json.Marshal(models.SignalingErrorPayload{Message: detail})
	msg := models.SignalingMessage{
		Type:    "error",
		Target:  "",
		Sender:  "signaling",
		Payload: pbytes,
	}
	_ = peerWriteJSON(pc, msg)
}

func (h *Handler) handlePeer(pc *peerConn) {
	defer func() {
		h.reg.unregister(pc.peerID, pc)
		_ = pc.conn.Close()
	}()

	pc.conn.SetReadLimit(512 * 1024)
	_ = pc.conn.SetReadDeadline(time.Now().Add(90 * time.Second))
	pc.conn.SetPongHandler(func(string) error {
		_ = pc.conn.SetReadDeadline(time.Now().Add(90 * time.Second))
		return nil
	})

	done := make(chan struct{})
	go func() {
		t := time.NewTicker(30 * time.Second)
		defer t.Stop()
		for {
			select {
			case <-done:
				return
			case <-t.C:
				pc.writeMu.Lock()
				_ = pc.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
				err := pc.conn.WriteMessage(websocket.PingMessage, nil)
				pc.writeMu.Unlock()
				if err != nil {
					return
				}
			}
		}
	}()
	defer close(done)

	for {
		_, data, err := pc.conn.ReadMessage()
		if err != nil {
			return
		}
		var msg models.SignalingMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			sendError(pc, "invalid JSON envelope")
			continue
		}
		if strings.TrimSpace(msg.Target) == "" {
			sendError(pc, "target required")
			continue
		}
		target := h.reg.lookup(msg.Target)
		if target == nil {
			sendError(pc, "target peer not connected")
			continue
		}

		target.writeMu.Lock()
		_ = target.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
		err = target.conn.WriteMessage(websocket.TextMessage, data)
		target.writeMu.Unlock()
		if err != nil {
			log.Printf("forward to %s: %v", msg.Target, err)
		}
	}
}

func (h *Handler) serveWS(w http.ResponseWriter, r *http.Request) {
	peerID := strings.TrimSpace(r.URL.Query().Get("peer_id"))
	if peerID == "" {
		http.Error(w, "peer_id query required", http.StatusBadRequest)
		return
	}

	c, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("websocket upgrade: %v", err)
		return
	}

	pConn := &peerConn{conn: c, peerID: peerID}
	if old := h.reg.register(pConn); old != nil {
		_ = old.conn.Close()
	}

	go h.handlePeer(pConn)
}
