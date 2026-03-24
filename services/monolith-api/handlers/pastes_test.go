package handlers

import (
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
)

func TestPastePastExpiry(t *testing.T) {
	now := time.Now().UTC()
	if !pastePastExpiry(pgtype.Timestamptz{Time: now.Add(-time.Second), Valid: true}, now) {
		t.Fatalf("expected past timestamp to be expired")
	}
	if pastePastExpiry(pgtype.Timestamptz{Time: now.Add(time.Second), Valid: true}, now) {
		t.Fatalf("expected future timestamp to be active")
	}
	if pastePastExpiry(pgtype.Timestamptz{Valid: false}, now) {
		t.Fatalf("expected null timestamp to be active")
	}
}

func TestNewShareToken(t *testing.T) {
	a, err := newShareToken()
	if err != nil {
		t.Fatalf("newShareToken() failed: %v", err)
	}
	b, err := newShareToken()
	if err != nil {
		t.Fatalf("newShareToken() failed: %v", err)
	}
	if len(a) < 16 {
		t.Fatalf("token is unexpectedly short: %q", a)
	}
	if a == b {
		t.Fatalf("tokens should be random and unique")
	}
}
