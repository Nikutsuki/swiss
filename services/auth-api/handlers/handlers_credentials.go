package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/Nikutsuki/swiss/services/internal/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

type credentialJSON struct {
	ID              string  `json:"id"`
	CredentialLabel *string `json:"credential_label"`
	CreatedAt       string  `json:"created_at"`
	LastUsedAt      *string `json:"last_used_at"`
	RevokedAt       *string `json:"revoked_at"`
}

func (h *Handler) ListCredentials(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	claims, ok := h.optionalClaims(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	uid, err := uuid.Parse(claims.UserID)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	var userID pgtype.UUID
	copy(userID.Bytes[:], uid[:])
	userID.Valid = true

	ctx := r.Context()
	rows, err := h.db.GetCredentialsByUserID(ctx, userID)
	if err != nil {
		http.Error(w, "Failed to list credentials", http.StatusInternalServerError)
		return
	}

	out := make([]credentialJSON, 0, len(rows))
	for _, c := range rows {
		out = append(out, authCredentialToJSON(c))
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

func (h *Handler) PatchCredential(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	claims, ok := h.optionalClaims(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	credIDStr := r.PathValue("id")
	if credIDStr == "" {
		http.Error(w, "missing credential id", http.StatusBadRequest)
		return
	}
	credUUID, err := uuid.Parse(credIDStr)
	if err != nil {
		http.Error(w, "invalid credential id", http.StatusBadRequest)
		return
	}
	var credPg pgtype.UUID
	copy(credPg.Bytes[:], credUUID[:])
	credPg.Valid = true

	var userID pgtype.UUID
	uid, err := uuid.Parse(claims.UserID)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	copy(userID.Bytes[:], uid[:])
	userID.Valid = true

	var body struct {
		Label string `json:"label"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	ctx := r.Context()
	err = h.db.UpdateCredentialLabel(ctx, database.UpdateCredentialLabelParams{
		ID:              credPg,
		UserID:          userID,
		CredentialLabel: pgtype.Text{String: body.Label, Valid: true},
	})
	if err != nil {
		http.Error(w, "Update failed", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) DeleteCredential(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	claims, ok := h.optionalClaims(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	credIDStr := r.PathValue("id")
	if credIDStr == "" {
		http.Error(w, "missing credential id", http.StatusBadRequest)
		return
	}
	credUUID, err := uuid.Parse(credIDStr)
	if err != nil {
		http.Error(w, "invalid credential id", http.StatusBadRequest)
		return
	}
	var credPg pgtype.UUID
	copy(credPg.Bytes[:], credUUID[:])
	credPg.Valid = true

	uid, err := uuid.Parse(claims.UserID)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	var userID pgtype.UUID
	copy(userID.Bytes[:], uid[:])
	userID.Valid = true

	ctx := r.Context()
	err = h.db.RevokeCredential(ctx, database.RevokeCredentialParams{
		ID:     credPg,
		UserID: userID,
	})
	if err != nil {
		http.Error(w, "Revoke failed", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func authCredentialToJSON(c database.AuthCredential) credentialJSON {
	j := credentialJSON{
		ID: uuid.UUID(c.ID.Bytes).String(),
	}
	if c.CreatedAt.Valid {
		j.CreatedAt = c.CreatedAt.Time.UTC().Format(time.RFC3339Nano)
	}
	if c.CredentialLabel.Valid {
		s := c.CredentialLabel.String
		j.CredentialLabel = &s
	}
	if c.LastUsedAt.Valid {
		s := c.LastUsedAt.Time.UTC().Format(time.RFC3339Nano)
		j.LastUsedAt = &s
	}
	if c.RevokedAt.Valid {
		s := c.RevokedAt.Time.UTC().Format(time.RFC3339Nano)
		j.RevokedAt = &s
	}
	return j
}

