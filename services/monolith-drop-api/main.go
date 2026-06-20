package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"github.com/Nikutsuki/swiss/services/monolith-drop-api/handlers"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

func main() {
	ctx := context.Background()

	if err := godotenv.Load(".env"); err != nil {
		log.Printf("No .env file loaded (%v); relying on process environment", err)
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		panic("DATABASE_URL environment variable is required")
	}

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		panic("Failed to connect to database: " + err.Error())
	}
	defer pool.Close()

	addr := os.Getenv("MONOLITH_DROP_HTTP_ADDR")
	if addr == "" {
		addr = ":8082"
	}

	h := handlers.New(pool)
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	})
	mux.HandleFunc("POST /v1/drop/sessions", h.CreateDropSession)
	mux.HandleFunc("GET /v1/drop/sessions/{id}", h.GetDropSession)
	mux.HandleFunc("POST /v1/drop/sessions/join", h.JoinDropSession)
	mux.HandleFunc("POST /v1/drop/sessions/{id}/close", h.CloseDropSession)

	corsOrigins := handlers.ParseCORSOrigins(os.Getenv("MONOLITH_DROP_CORS_ORIGINS"))
	root := handlers.WithCORS(corsOrigins, mux)

	log.Printf("monolith-drop-api listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, root))
}
