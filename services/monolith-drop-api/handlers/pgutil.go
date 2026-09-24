package handlers

import (
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

func pgUUIDFromGoogle(u uuid.UUID) pgtype.UUID {
	var z pgtype.UUID
	copy(z.Bytes[:], u[:])
	z.Valid = true
	return z
}

func pgTextToStringPtr(t pgtype.Text) *string {
	if !t.Valid {
		return nil
	}
	s := t.String
	return &s
}

func pgTimestamptzToStringPtr(t pgtype.Timestamptz) *string {
	if !t.Valid {
		return nil
	}
	s := t.Time.UTC().Format("2006-01-02T15:04:05Z07:00")
	return &s
}
