package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"github.com/Nikutsuki/swiss/services/fiszki-api/handlers"
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

	addr := os.Getenv("FISZKI_HTTP_ADDR")
	if addr == "" {
		addr = ":8085"
	}

	h := handlers.New(pool)
	mux := http.NewServeMux()
	mux.HandleFunc("POST /sets", h.CreateStudySet)
	mux.HandleFunc("GET /sets", h.ListStudySets)
	mux.HandleFunc("GET /sets/{id}", h.GetStudySet)
	mux.HandleFunc("DELETE /sets/{id}", h.DeleteStudySet)
	mux.HandleFunc("DELETE /sets/{id}/progress", h.ResetStudySetProgress)
	mux.HandleFunc("POST /sessions", h.CreateSession)
	mux.HandleFunc("GET /sessions/{id}", h.GetSession)
	mux.HandleFunc("GET /stats", h.GetStats)

	log.Printf("fiszki-api listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}
