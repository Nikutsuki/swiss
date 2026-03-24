package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"github.com/Nikutsuki/swiss/services/monolith-api/handlers"
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
		dbURL = "postgresql://root:secretpassword@localhost:5432/utils_db?sslmode=disable"
	}

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		log.Fatalf("Unable to connect to database: %v\n", err)
	}
	defer pool.Close()

	addr := os.Getenv("MONOLITH_HTTP_ADDR")
	if addr == "" {
		addr = ":8081"
	}

	h := handlers.New(pool)
	mux := http.NewServeMux()
	mux.HandleFunc("POST /devices", h.RegisterDevice)
	mux.HandleFunc("GET /devices/keys", h.ListDeviceKeys)
	mux.HandleFunc("DELETE /devices/{id}", h.RevokeDevice)
	mux.HandleFunc("GET /pastes/burned", h.ListBurnedPastes)
	mux.HandleFunc("GET /pastes/dek-coverage", h.PasteDekCoverage)
	mux.HandleFunc("GET /pastes/shared/recent", h.ListRecentSharedPastes)
	mux.HandleFunc("POST /pastes/{id}/burn", h.BurnPaste)
	mux.HandleFunc("POST /pastes/{id}/rewrap", h.RewrapPaste)
	mux.HandleFunc("POST /pastes/{id}/share", h.UpsertPasteShare)
	mux.HandleFunc("DELETE /pastes/{id}/share", h.RevokePasteShare)
	mux.HandleFunc("POST /pastes", h.CreatePaste)
	mux.HandleFunc("GET /pastes", h.ListPastes)
	mux.HandleFunc("GET /pastes/{id}", h.GetPaste)
	mux.HandleFunc("GET /shared-pastes/{token}", h.GetSharedPaste)

	log.Printf("monolith-api listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}
