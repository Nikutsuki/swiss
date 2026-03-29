package main

import (
	"log"
	"net/http"

	"github.com/nikut/swiss/services/monolith-stream-api/handlers"
)

func main() {
	hub := handlers.NewHub()
	go hub.Run()

	http.HandleFunc("/stream/v1/lobby/", func(w http.ResponseWriter, r *http.Request) {
		handlers.ServeWs(hub, w, r)
	})

	log.Println("Signaling server starting on :8080")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatal("ListenAndServe: ", err)
	}
}