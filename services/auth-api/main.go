package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"github.com/Nikutsuki/swiss/services/auth-api/handlers"
	"github.com/Nikutsuki/swiss/services/internal/database"
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

	db := database.New(pool)
	webAuthn := initWebAuthn()
	authHandlers := handlers.New(db, webAuthn)

	mux := http.NewServeMux()

	// Spec routes (POST + JSON + session cookie)
	mux.HandleFunc("POST /register/options", authHandlers.RegisterOptions)
	mux.HandleFunc("POST /register/verify", authHandlers.RegisterVerify)
	mux.HandleFunc("POST /login/options", authHandlers.LoginOptions)
	mux.HandleFunc("POST /login/verify", authHandlers.LoginVerify)

	// Legacy routes
	mux.HandleFunc("GET /register/begin", authHandlers.BeginRegistration)
	mux.HandleFunc("POST /register/finish", authHandlers.FinishRegistration)
	mux.HandleFunc("GET /login/begin", authHandlers.BeginLogin)
	mux.HandleFunc("POST /login/finish", authHandlers.FinishLogin)

	mux.HandleFunc("GET /credentials", authHandlers.ListCredentials)
	mux.HandleFunc("PATCH /credentials/{id}", authHandlers.PatchCredential)
	mux.HandleFunc("DELETE /credentials/{id}", authHandlers.DeleteCredential)

	mux.HandleFunc("POST /totp/generate", authHandlers.TOTPGenerate)
	mux.HandleFunc("POST /totp/verify", authHandlers.TOTPVerify)

	log.Println("auth-api running on :8080")
	log.Fatal(http.ListenAndServe(":8080", mux))
}
