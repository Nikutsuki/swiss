package handlers

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/Nikutsuki/swiss/services/internal/authn"
	"github.com/Nikutsuki/swiss/services/internal/database"
	"github.com/Nikutsuki/swiss/services/monolith-drop-api/models"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

const (
	defaultSessionSeconds = 3600*3
	maxSessionSeconds     = 86400
	peerTokenBytes        = 32
)

func encodeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func randomURLToken() (string, error) {
	b := make([]byte, peerTokenBytes)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func sessionExpiresAt(seconds int64) pgtype.Timestamptz {
	return pgtype.Timestamptz{
		Time:  time.Now().UTC().Add(time.Duration(seconds) * time.Second),
		Valid: true,
	}
}

func writeDropSessionGet(
	w http.ResponseWriter,
	row database.MonolithDropSession,
) {
	sid, _ := uuid.FromBytes(row.ID.Bytes[:])
	out := models.GetDropSessionResponse{
		SessionID: sid.String(),
		PeerHost:  row.PeerHost,
		PeerGuest: pgTextToStringPtr(row.PeerGuest),
		ExpiresAt: row.ExpiresAt.Time.UTC().Format(time.RFC3339),
		CreatedAt: row.CreatedAt.Time.UTC().Format(time.RFC3339),
		ClosedAt:  pgTimestamptzToStringPtr(row.ClosedAt),
	}
	encodeJSON(w, http.StatusOK, out)
}

// CreateDropSession is POST /v1/drop/sessions.
func (h *Handler) CreateDropSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	claims, err := authn.ClaimsFromRequest(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	userID, err := uuid.Parse(claims.UserID)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var body models.CreateDropSessionRequest
	if r.ContentLength > 0 {
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
	}
	sec := defaultSessionSeconds
	if body.ExpiresInSeconds != nil {
		sec = int(*body.ExpiresInSeconds)
		if sec <= 0 || sec > maxSessionSeconds {
			http.Error(w, "invalid expires_in_seconds", http.StatusBadRequest)
			return
		}
	}

	peerHost, err := randomURLToken()
	if err != nil {
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}
	joinSecret, err := randomURLToken()
	if err != nil {
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}

	ctx := r.Context()
	row, err := h.db.CreateDropSession(ctx, database.CreateDropSessionParams{
		HostUserID: pgUUIDFromGoogle(userID),
		PeerHost:   peerHost,
		JoinSecret: joinSecret,
		ExpiresAt:  sessionExpiresAt(int64(sec)),
	})
	if err != nil {
		http.Error(w, "Failed to create session", http.StatusInternalServerError)
		return
	}

	sid, _ := uuid.FromBytes(row.ID.Bytes[:])
	out := models.CreateDropSessionResponse{
		SessionID:    sid.String(),
		PeerID:       row.PeerHost,
		RemotePeerID: nil,
		Role:         "caller",
		JoinSecret:   row.JoinSecret,
		ExpiresAt:    row.ExpiresAt.Time.UTC().Format(time.RFC3339),
		PeerHost:     row.PeerHost,
		PeerGuest:    pgTextToStringPtr(row.PeerGuest),
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(out)
}

// GetDropSession is GET /v1/drop/sessions/{id}.
func (h *Handler) GetDropSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	claims, err := authn.ClaimsFromRequest(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	userID, err := uuid.Parse(claims.UserID)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	idStr := r.PathValue("id")
	if idStr == "" {
		http.Error(w, "missing session id", http.StatusBadRequest)
		return
	}
	sessUUID, err := pgUUIDFromString(idStr)
	if err != nil {
		http.Error(w, "invalid session id", http.StatusBadRequest)
		return
	}

	ctx := r.Context()
	uid := pgUUIDFromGoogle(userID)

	row, err := h.db.GetDropSessionForHost(ctx, database.GetDropSessionForHostParams{
		ID:         sessUUID,
		HostUserID: uid,
	})
	if err == nil {
		writeDropSessionGet(w, row)
		return
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}

	row, err = h.db.GetDropSessionForParticipant(ctx, database.GetDropSessionForParticipantParams{
		SessionID: sessUUID,
		UserID:    uid,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}
	writeDropSessionGet(w, row)
}

// JoinDropSession is POST /v1/drop/sessions/join.
func (h *Handler) JoinDropSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	claims, err := authn.ClaimsFromRequest(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	userID, err := uuid.Parse(claims.UserID)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var body models.JoinDropSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	if body.JoinSecret == "" {
		http.Error(w, "join_secret required", http.StatusBadRequest)
		return
	}

	ctx := r.Context()
	raw, err := h.db.GetDropSessionByJoinSecretRaw(ctx, body.JoinSecret)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}

	now := time.Now().UTC()
	if raw.ExpiresAt.Valid && !raw.ExpiresAt.Time.After(now) {
		http.Error(w, "Session expired", http.StatusGone)
		return
	}
	if raw.PeerGuest.Valid && raw.PeerGuest.String != "" {
		http.Error(w, "Session already joined", http.StatusConflict)
		return
	}

	peerGuest, err := randomURLToken()
	if err != nil {
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}

	row, err := h.db.JoinDropSession(ctx, database.JoinDropSessionParams{
		JoinSecret: body.JoinSecret,
		PeerGuest: pgtype.Text{
			String: peerGuest,
			Valid:  true,
		},
		GuestUserID: pgUUIDFromGoogle(userID),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "Session already joined", http.StatusConflict)
			return
		}
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}

	sid, _ := uuid.FromBytes(row.ID.Bytes[:])
	peerID := peerGuest
	if row.PeerGuest.Valid {
		peerID = row.PeerGuest.String
	}
	out := models.JoinDropSessionResponse{
		SessionID:    sid.String(),
		PeerID:       peerID,
		RemotePeerID: row.PeerHost,
		Role:         "callee",
		ExpiresAt:    row.ExpiresAt.Time.UTC().Format(time.RFC3339),
	}
	encodeJSON(w, http.StatusOK, out)
}

// CloseDropSession is POST /v1/drop/sessions/{id}/close.
func (h *Handler) CloseDropSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	claims, err := authn.ClaimsFromRequest(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	userID, err := uuid.Parse(claims.UserID)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	idStr := r.PathValue("id")
	if idStr == "" {
		http.Error(w, "missing session id", http.StatusBadRequest)
		return
	}
	sessUUID, err := pgUUIDFromString(idStr)
	if err != nil {
		http.Error(w, "invalid session id", http.StatusBadRequest)
		return
	}

	ctx := r.Context()
	row, err := h.db.CloseDropSessionForHost(ctx, database.CloseDropSessionForHostParams{
		ID:         sessUUID,
		HostUserID: pgUUIDFromGoogle(userID),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}

	sid, _ := uuid.FromBytes(row.ID.Bytes[:])
	encodeJSON(w, http.StatusOK, models.CloseDropSessionResponse{
		SessionID: sid.String(),
		Closed:    true,
	})
}
