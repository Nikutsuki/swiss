package main

import (
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/Nikutsuki/swiss/services/monolith-stream-api/handlers"
)

func main() {
	addr := os.Getenv("MONOLITH_STREAM_HTTP_ADDR")
	if addr == "" {
		addr = ":8084"
	}

	tlsCert := os.Getenv("MONOLITH_STREAM_TLS_CERT_FILE")
	tlsKey := os.Getenv("MONOLITH_STREAM_TLS_KEY_FILE")

	corsOrigins := handlers.ParseCORSOrigins(os.Getenv("MONOLITH_STREAM_CORS_ORIGINS"))

	maxPeers := 16
	if v := os.Getenv("MONOLITH_STREAM_MAX_PEERS_PER_SESSION"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 2 {
			maxPeers = n
		}
	}
	streamHub := handlers.NewStreamSignalingHub(corsOrigins, maxPeers)
	chatHub := handlers.NewChatHub(corsOrigins)
	go func() {
		t := time.NewTicker(time.Minute)
		defer t.Stop()
		for range t.C {
			streamHub.ExpireStaleRooms(time.Now())
		}
	}()

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	})
	mux.HandleFunc("GET /v1/stream/ping", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true,"service":"monolith-stream-api"}`))
	})
	mux.HandleFunc("GET /v1/stream/ws", streamHub.ServeWS)
	mux.HandleFunc("GET /v1/stream/chat/ws", chatHub.ServeChatWS)

	root := handlers.WithCORS(corsOrigins, mux)

	srv := &http.Server{
		Addr:    addr,
		Handler: root,
	}

	if tlsCert != "" || tlsKey != "" {
		if tlsCert == "" || tlsKey == "" {
			log.Fatal("MONOLITH_STREAM_TLS_CERT_FILE and MONOLITH_STREAM_TLS_KEY_FILE must both be set (or both unset)")
		}
		log.Printf("monolith-stream-api listening on https://%s (wss for /v1/stream/ws)", addr)
		log.Fatal(srv.ListenAndServeTLS(tlsCert, tlsKey))
	}

	log.Printf("monolith-stream-api listening on http://%s (use dev:http + ws:// from the browser, or set TLS env for wss)", addr)
	log.Fatal(srv.ListenAndServe())
}
