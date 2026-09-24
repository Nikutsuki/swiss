package handlers

import (
	"github.com/Nikutsuki/swiss/services/internal/database"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Handler struct {
	pool *pgxpool.Pool
	db   *database.Queries
}

func New(pool *pgxpool.Pool) *Handler {
	return &Handler{
		pool: pool,
		db:   database.New(pool),
	}
}
