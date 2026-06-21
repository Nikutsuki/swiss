package handlers

import (
	"github.com/Nikutsuki/swiss/services/internal/database"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Handler struct {
	pool       *pgxpool.Pool
	db         *database.Queries
	uploadsDir string
}

func New(pool *pgxpool.Pool, uploadsDir string) *Handler {
	return &Handler{
		pool:       pool,
		db:         database.New(pool),
		uploadsDir: uploadsDir,
	}
}
