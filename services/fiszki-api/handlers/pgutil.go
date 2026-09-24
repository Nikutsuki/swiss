package handlers

import (
	"net/http"

	"github.com/Nikutsuki/swiss/services/internal/authn"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

func pgUUIDFromString(s string) (pgtype.UUID, error) {
	var z pgtype.UUID
	u, err := uuid.Parse(s)
	if err != nil {
		return z, err
	}
	copy(z.Bytes[:], u[:])
	z.Valid = true
	return z, nil
}

func mustClaimsUserID(r *http.Request) (pgtype.UUID, bool) {
	claims, err := authn.ClaimsFromRequest(r)
	if err != nil {
		return pgtype.UUID{}, false
	}
	userID, err := pgUUIDFromString(claims.UserID)
	if err != nil {
		return pgtype.UUID{}, false
	}
	return userID, true
}

func uuidString(u pgtype.UUID) string {
	if !u.Valid {
		return ""
	}
	return uuid.UUID(u.Bytes).String()
}
