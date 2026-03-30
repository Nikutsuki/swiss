package main

import (
	"log"
	"net/http"
	"os"

	"github.com/Nikutsuki/swiss/services/monolith-stream-api/handlers"
)

func main() {
	hub := handlers.NewHub()
	go hub.Run()

	http.HandleFunc("/v1/stream/ws/", func(w http.ResponseWriter, r *http.Request) {
		handlers.ServeWs(hub, w, r)
	})

	certFile := os.Getenv("MONOLITH_STREAM_TLS_CERT_FILE")
	keyFile := os.Getenv("MONOLITH_STREAM_TLS_KEY_FILE")
	addr := os.Getenv("MONOLITH_STREAM_HTTP_ADDR")
	if addr == "" {
		addr = ":8084"
	}

	if certFile != "" && keyFile != "" {
		log.Printf("Monolith Stream API listening on %s (TLS)\n", addr)
		if err := http.ListenAndServeTLS(addr, certFile, keyFile, nil); err != nil {
			log.Fatal("ListenAndServeTLS: ", err)
		}
	} else {
		log.Printf("Monolith Stream API listening on %s\n", addr)
		if err := http.ListenAndServe(addr, nil); err != nil {
			log.Fatal("ListenAndServe: ", err)
		}
	}
}