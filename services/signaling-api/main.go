package main

import (
	"log"
	"net/http"
	"os"

	"github.com/Nikutsuki/swiss/services/signaling-api/handlers"
	"github.com/joho/godotenv"
)

func main() {
	if err := godotenv.Load(".env"); err != nil {
		log.Printf("No .env file loaded (%v); relying on process environment", err)
	}

	addr := os.Getenv("SIGNALING_HTTP_ADDR")
	if addr == "" {
		addr = ":8083"
	}
	tlsCert := os.Getenv("SIGNALING_TLS_CERT_FILE")
	tlsKey := os.Getenv("SIGNALING_TLS_KEY_FILE")

	allowed := handlers.ParseAllowedOrigins(os.Getenv("SIGNALING_ALLOWED_ORIGINS"))
	if len(allowed) == 0 {
		log.Printf("SIGNALING_ALLOWED_ORIGINS is empty: accepting WebSocket connections from any Origin (set for production)")
	} else {
		log.Printf("SIGNALING_ALLOWED_ORIGINS: %v", allowed)
	}

	h := handlers.New(allowed)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	srv := &http.Server{
		Addr:    addr,
		Handler: mux,
	}

	if tlsCert != "" || tlsKey != "" {
		if tlsCert == "" || tlsKey == "" {
			log.Fatal("SIGNALING_TLS_CERT_FILE and SIGNALING_TLS_KEY_FILE must both be set (or both unset)")
		}
		log.Printf("signaling-api listening on https://%s (wss enabled)", addr)
		log.Fatal(srv.ListenAndServeTLS(tlsCert, tlsKey))
	}

	log.Printf("signaling-api listening on http://%s", addr)
	log.Fatal(srv.ListenAndServe())
}
