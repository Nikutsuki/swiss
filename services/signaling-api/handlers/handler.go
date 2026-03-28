package handlers

import (
	"net/http"
	"strings"

	"github.com/gorilla/websocket"
)

// Handler wires the WebSocket signaling routes.
type Handler struct {
	reg      *registry
	upgrader websocket.Upgrader
}

// New constructs the handler. If allowedOrigins is empty, any Origin is accepted (log in main).
func New(allowedOrigins []string) *Handler {
	h := &Handler{
		reg: newRegistry(),
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
		},
	}
	if len(allowedOrigins) == 0 {
		h.upgrader.CheckOrigin = func(r *http.Request) bool { return true }
	} else {
		set := make(map[string]struct{}, len(allowedOrigins))
		for _, o := range allowedOrigins {
			set[o] = struct{}{}
		}
		h.upgrader.CheckOrigin = func(r *http.Request) bool {
			origin := r.Header.Get("Origin")
			if origin == "" {
				return false
			}
			_, ok := set[origin]
			return ok
		}
	}
	return h
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /health", h.serveHealth)
	mux.HandleFunc("GET /ws", h.serveWS)
}

// ParseAllowedOrigins splits SIGNALING_ALLOWED_ORIGINS (comma-separated).
func ParseAllowedOrigins(env string) []string {
	raw := strings.TrimSpace(env)
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}
