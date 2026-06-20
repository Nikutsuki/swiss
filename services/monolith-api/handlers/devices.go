package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/Nikutsuki/swiss/services/internal/authn"
	"github.com/Nikutsuki/swiss/services/internal/database"
	"github.com/google/uuid"
)

type registerDeviceReq struct {
	PublicKey string `json:"public_key"`
}

type registerDeviceResp struct {
	DeviceKeyID string `json:"device_key_id"`
}

type deviceKeyRow struct {
	DeviceKeyID string `json:"device_key_id"`
	PublicKey   string `json:"public_key"`
}

func (h *Handler) RegisterDevice(w http.ResponseWriter, r *http.Request) {
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
	var body registerDeviceReq
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	spki, err := decodeBase64(body.PublicKey)
	if err != nil {
		http.Error(w, "Invalid public_key encoding", http.StatusBadRequest)
		return
	}
	if err := assertECP384SPKI(spki); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	id, err := h.db.RegisterDevice(ctx, database.RegisterDeviceParams{
		UserID:    pgUUIDFromGoogle(userID),
		PublicKey: spki,
	})
	if err != nil {
		http.Error(w, "Failed to register device", http.StatusInternalServerError)
		return
	}
	uid, _ := uuid.FromBytes(id.Bytes[:])
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(registerDeviceResp{DeviceKeyID: uid.String()})
}

func (h *Handler) ListDeviceKeys(w http.ResponseWriter, r *http.Request) {
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
	ctx := r.Context()
	rows, err := h.db.FetchPublicKeysByUserID(ctx, pgUUIDFromGoogle(userID))
	if err != nil {
		http.Error(w, "Failed to list keys", http.StatusInternalServerError)
		return
	}
	out := make([]deviceKeyRow, 0, len(rows))
	for _, row := range rows {
		dk, _ := uuid.FromBytes(row.DeviceKeyID.Bytes[:])
		out = append(out, deviceKeyRow{
			DeviceKeyID: dk.String(),
			PublicKey:   encodeBase64URL(row.PublicKey),
		})
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

func (h *Handler) RevokeDevice(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
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
		http.Error(w, "missing device id", http.StatusBadRequest)
		return
	}
	devID, err := pgUUIDFromString(idStr)
	if err != nil {
		http.Error(w, "invalid device id", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	err = h.db.RevokeDevice(ctx, database.RevokeDeviceParams{
		ID:     devID,
		UserID: pgUUIDFromGoogle(userID),
	})
	if err != nil {
		http.Error(w, "Failed to revoke device", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
