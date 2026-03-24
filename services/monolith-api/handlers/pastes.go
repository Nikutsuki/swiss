package handlers

import (
	"crypto/rand"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/Nikutsuki/swiss/services/internal/authn"
	"github.com/Nikutsuki/swiss/services/internal/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

const maxPasteExpiresInSeconds = 365 * 24 * 3600

type wrappedDEKIn struct {
	DeviceKeyID string `json:"device_key_id"`
	WrappedDek  string `json:"wrapped_dek"`
}

type createPasteReq struct {
	EncryptedTitle   string         `json:"encrypted_title"`
	EncryptedContent string         `json:"encrypted_content"`
	WrappedDEKs      []wrappedDEKIn `json:"wrapped_deks"`
	ExpiresInSeconds *int           `json:"expires_in_seconds,omitempty"`
}

type createPasteResp struct {
	ID string `json:"id"`
}

type pasteContentResp struct {
	ID               string `json:"id"`
	EncryptedTitle   string `json:"encrypted_title"`
	EncryptedContent string `json:"encrypted_content"`
	WrappedDek       string `json:"wrapped_dek"`
}

type pasteMetaResp struct {
	PasteID        string  `json:"paste_id"`
	EncryptedTitle string  `json:"encrypted_title"`
	CreatedAt      string  `json:"created_at"`
	WrappedDek     string  `json:"wrapped_dek"`
	ExpiresAt      *string `json:"expires_at,omitempty"`
	PayloadWiped   bool    `json:"payload_wiped"`
}

type pasteShareKdfIn struct {
	Salt             string `json:"salt"`
	MemoryKib        int    `json:"memory_kib"`
	Iterations       int    `json:"iterations"`
	Parallelism      int    `json:"parallelism"`
	DerivedKeyLength int    `json:"derived_key_length"`
}

type upsertPasteShareReq struct {
	VisibilityMode   string           `json:"visibility_mode"`
	ShareWrapNonce   string           `json:"share_wrap_nonce,omitempty"`
	ShareWrapBlob    string           `json:"share_wrap_blob,omitempty"`
	PasswordKdf      *pasteShareKdfIn `json:"password_kdf,omitempty"`
	ExpiresInSeconds *int             `json:"expires_in_seconds,omitempty"`
}

type upsertPasteShareResp struct {
	Token string `json:"token"`
	URL   string `json:"url"`
}

type sharedPasteResp struct {
	Token            string           `json:"token"`
	VisibilityMode   string           `json:"visibility_mode"`
	EncryptedTitle   string           `json:"encrypted_title"`
	EncryptedContent string           `json:"encrypted_content"`
	ShareWrapNonce   string           `json:"share_wrap_nonce,omitempty"`
	ShareWrapBlob    string           `json:"share_wrap_blob,omitempty"`
	PasswordKdf      *pasteShareKdfIn `json:"password_kdf,omitempty"`
	ExpiresAt        *string          `json:"expires_at,omitempty"`
}

type recentSharedPasteResp struct {
	PasteID        string  `json:"paste_id"`
	PublicToken    string  `json:"public_token"`
	VisibilityMode string  `json:"visibility_mode"`
	EncryptedTitle string  `json:"encrypted_title"`
	CreatedAt      string  `json:"created_at"`
	ExpiresAt      *string `json:"expires_at,omitempty"`
}

func mustClaimsUserID(r *http.Request) (pgtype.UUID, bool) {
	claims, err := authn.ClaimsFromRequest(r)
	if err != nil {
		return pgtype.UUID{}, false
	}
	userID, err := uuid.Parse(claims.UserID)
	if err != nil {
		return pgtype.UUID{}, false
	}
	return pgUUIDFromGoogle(userID), true
}

func newShareToken() (string, error) {
	var raw [24]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", err
	}
	return encodeBase64URL(raw[:]), nil
}

func pastePastExpiry(exp pgtype.Timestamptz, now time.Time) bool {
	return exp.Valid && !exp.Time.After(now)
}

func formatExpiresAtJSON(exp pgtype.Timestamptz) *string {
	if !exp.Valid {
		return nil
	}
	s := exp.Time.UTC().Format(time.RFC3339)
	return &s
}

func (h *Handler) CreatePaste(w http.ResponseWriter, r *http.Request) {
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
	var body createPasteReq
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	title, err := decodeBase64(body.EncryptedTitle)
	if err != nil {
		http.Error(w, "invalid encrypted_title", http.StatusBadRequest)
		return
	}
	content, err := decodeBase64(body.EncryptedContent)
	if err != nil {
		http.Error(w, "invalid encrypted_content", http.StatusBadRequest)
		return
	}
	var expiresAt pgtype.Timestamptz
	if body.ExpiresInSeconds != nil {
		sec := *body.ExpiresInSeconds
		if sec <= 0 || sec > maxPasteExpiresInSeconds {
			http.Error(w, "invalid expires_in_seconds", http.StatusBadRequest)
			return
		}
		expiresAt = pgtype.Timestamptz{
			Time:  time.Now().UTC().Add(time.Duration(sec) * time.Second),
			Valid: true,
		}
	}

	deviceIDs := make([]pgtype.UUID, 0, len(body.WrappedDEKs))
	wrapped := make([][]byte, 0, len(body.WrappedDEKs))
	isPasswordBaseds := make([]bool, 0, len(body.WrappedDEKs))
	for _, item := range body.WrappedDEKs {
		did, err := pgUUIDFromString(item.DeviceKeyID)
		if err != nil {
			http.Error(w, "invalid device_key_id", http.StatusBadRequest)
			return
		}
		wb, err := decodeBase64(item.WrappedDek)
		if err != nil {
			http.Error(w, "invalid wrapped_dek", http.StatusBadRequest)
			return
		}
		deviceIDs = append(deviceIDs, did)
		wrapped = append(wrapped, wb)
		isPasswordBaseds = append(isPasswordBaseds, false)
	}

	ctx := r.Context()
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		http.Error(w, "Transaction failed", http.StatusInternalServerError)
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	qtx := database.New(tx)
	pasteID, err := qtx.InsertEncryptedPayload(ctx, database.InsertEncryptedPayloadParams{
		UserID:    pgUUIDFromGoogle(userID),
		Title:     title,
		Content:   content,
		ExpiresAt: expiresAt,
	})
	if err != nil {
		http.Error(w, "Failed to save paste", http.StatusInternalServerError)
		return
	}
	if len(deviceIDs) > 0 {
		if err := qtx.InsertWrappedDEKs(ctx, database.InsertWrappedDEKsParams{
			PasteID:          pasteID,
			DeviceKeyIds:     deviceIDs,
			WrappedDeks:      wrapped,
			IsPasswordBaseds: isPasswordBaseds,
		}); err != nil {
			http.Error(w, "Failed to save wrapped keys", http.StatusInternalServerError)
			return
		}
	}
	if err := tx.Commit(ctx); err != nil {
		http.Error(w, "Commit failed", http.StatusInternalServerError)
		return
	}

	outID, _ := uuid.FromBytes(pasteID.Bytes[:])
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(createPasteResp{ID: outID.String()})
}

func (h *Handler) UpsertPasteShare(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	uid, ok := mustClaimsUserID(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	pasteIDStr := r.PathValue("id")
	pid, err := pgUUIDFromString(pasteIDStr)
	if err != nil {
		http.Error(w, "invalid paste id", http.StatusBadRequest)
		return
	}
	var body upsertPasteShareReq
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	if body.VisibilityMode != "public" && body.VisibilityMode != "password" {
		http.Error(w, "visibility_mode must be public or password", http.StatusBadRequest)
		return
	}
	owned, err := h.db.PasteOwnedByUser(r.Context(), database.PasteOwnedByUserParams{ID: pid, UserID: uid})
	if err != nil {
		http.Error(w, "Failed to verify paste", http.StatusInternalServerError)
		return
	}
	if !owned {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}
	hasCipher, err := h.db.PasteHasCiphertext(r.Context(), database.PasteHasCiphertextParams{ID: pid, UserID: uid})
	if err != nil {
		http.Error(w, "Failed to verify paste", http.StatusInternalServerError)
		return
	}
	if !hasCipher.Valid || !hasCipher.Bool {
		http.Error(w, "paste has no ciphertext", http.StatusGone)
		return
	}

	var expiresAt pgtype.Timestamptz
	if body.ExpiresInSeconds != nil {
		sec := *body.ExpiresInSeconds
		if sec <= 0 || sec > maxPasteExpiresInSeconds {
			http.Error(w, "invalid expires_in_seconds", http.StatusBadRequest)
			return
		}
		expiresAt = pgtype.Timestamptz{Time: time.Now().UTC().Add(time.Duration(sec) * time.Second), Valid: true}
	}

	var nonce, blob, salt []byte
	var mem, iters, parallelism, keyLen pgtype.Int4
	if body.VisibilityMode == "public" {
		blob, err = decodeBase64(body.ShareWrapBlob)
		if err != nil {
			http.Error(w, "invalid share_wrap_blob", http.StatusBadRequest)
			return
		}
	}
	if body.VisibilityMode == "password" {
		if body.PasswordKdf == nil {
			http.Error(w, "password_kdf is required", http.StatusBadRequest)
			return
		}
		if body.PasswordKdf.MemoryKib <= 0 || body.PasswordKdf.Iterations <= 0 || body.PasswordKdf.Parallelism <= 0 || body.PasswordKdf.DerivedKeyLength <= 0 {
			http.Error(w, "invalid password_kdf parameters", http.StatusBadRequest)
			return
		}
		nonce, err = decodeBase64(body.ShareWrapNonce)
		if err != nil {
			http.Error(w, "invalid share_wrap_nonce", http.StatusBadRequest)
			return
		}
		blob, err = decodeBase64(body.ShareWrapBlob)
		if err != nil {
			http.Error(w, "invalid share_wrap_blob", http.StatusBadRequest)
			return
		}
		salt, err = decodeBase64(body.PasswordKdf.Salt)
		if err != nil {
			http.Error(w, "invalid password_kdf.salt", http.StatusBadRequest)
			return
		}
		mem = pgtype.Int4{Int32: int32(body.PasswordKdf.MemoryKib), Valid: true}
		iters = pgtype.Int4{Int32: int32(body.PasswordKdf.Iterations), Valid: true}
		parallelism = pgtype.Int4{Int32: int32(body.PasswordKdf.Parallelism), Valid: true}
		keyLen = pgtype.Int4{Int32: int32(body.PasswordKdf.DerivedKeyLength), Valid: true}
	}
	token, err := newShareToken()
	if err != nil {
		http.Error(w, "Failed to generate share token", http.StatusInternalServerError)
		return
	}
	if err := h.db.UpsertPasteShare(r.Context(), database.UpsertPasteShareParams{
		PasteID:             pid,
		PublicToken:         token,
		VisibilityMode:      body.VisibilityMode,
		ShareWrapNonce:      nonce,
		ShareWrapCiphertext: blob,
		PasswordSalt:        salt,
		PasswordMemoryKib:   mem,
		PasswordIterations:  iters,
		PasswordParallelism: parallelism,
		PasswordKeyLength:   keyLen,
		ExpiresAt:           expiresAt,
		CreatedBy:           uid,
	}); err != nil {
		http.Error(w, "Failed to create share link", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(upsertPasteShareResp{
		Token: token,
		URL:   "/p/" + token,
	})
}

func (h *Handler) RevokePasteShare(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	uid, ok := mustClaimsUserID(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	pasteIDStr := r.PathValue("id")
	pid, err := pgUUIDFromString(pasteIDStr)
	if err != nil {
		http.Error(w, "invalid paste id", http.StatusBadRequest)
		return
	}
	n, err := h.db.RevokePasteShareForOwner(r.Context(), database.RevokePasteShareForOwnerParams{PasteID: pid, UserID: uid})
	if err != nil {
		http.Error(w, "Failed to revoke share link", http.StatusInternalServerError)
		return
	}
	if n == 0 {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) GetSharedPaste(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	token := r.PathValue("token")
	if token == "" {
		http.Error(w, "missing token", http.StatusBadRequest)
		return
	}
	row, err := h.db.GetPasteShareByToken(r.Context(), token)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Failed to load shared paste", http.StatusInternalServerError)
		return
	}
	now := time.Now().UTC()
	if row.RevokedAt.Valid || pastePastExpiry(row.PasteExpiresAt, now) || pastePastExpiry(row.ShareExpiresAt, now) || (len(row.EncryptedTitle) == 0 && len(row.EncryptedContent) == 0) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusGone)
		_, _ = w.Write([]byte(`{"error":"paste unavailable"}`))
		return
	}
	resp := sharedPasteResp{
		Token:            row.PublicToken,
		VisibilityMode:   row.VisibilityMode,
		EncryptedTitle:   encodeBase64URL(row.EncryptedTitle),
		EncryptedContent: encodeBase64URL(row.EncryptedContent),
		ExpiresAt:        formatExpiresAtJSON(row.ShareExpiresAt),
	}
	if row.VisibilityMode == "password" {
		resp.ShareWrapNonce = encodeBase64URL(row.ShareWrapNonce)
		resp.PasswordKdf = &pasteShareKdfIn{
			Salt:             encodeBase64URL(row.PasswordSalt),
			MemoryKib:        int(row.PasswordMemoryKib.Int32),
			Iterations:       int(row.PasswordIterations.Int32),
			Parallelism:      int(row.PasswordParallelism.Int32),
			DerivedKeyLength: int(row.PasswordKeyLength.Int32),
		}
	}
	resp.ShareWrapBlob = encodeBase64URL(row.ShareWrapCiphertext)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

func (h *Handler) ListRecentSharedPastes(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	uid, ok := mustClaimsUserID(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	rows, err := h.db.ListRecentSharedPastesByOwner(r.Context(), uid)
	if err != nil {
		http.Error(w, "Failed to load shared pastes", http.StatusInternalServerError)
		return
	}
	out := make([]recentSharedPasteResp, 0, len(rows))
	for _, row := range rows {
		pid, _ := uuid.FromBytes(row.PasteID.Bytes[:])
		out = append(out, recentSharedPasteResp{
			PasteID:        pid.String(),
			PublicToken:    row.PublicToken,
			VisibilityMode: row.VisibilityMode,
			EncryptedTitle: encodeBase64URL(row.EncryptedTitle),
			CreatedAt:      row.CreatedAt.Time.UTC().Format(time.RFC3339),
			ExpiresAt:      formatExpiresAtJSON(row.ExpiresAt),
		})
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

func (h *Handler) GetPaste(w http.ResponseWriter, r *http.Request) {
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
	pasteIDStr := r.PathValue("id")
	if pasteIDStr == "" {
		http.Error(w, "missing paste id", http.StatusBadRequest)
		return
	}
	deviceKeyStr := r.URL.Query().Get("device_key_id")
	pid, err := pgUUIDFromString(pasteIDStr)
	if err != nil {
		http.Error(w, "invalid paste id", http.StatusBadRequest)
		return
	}
	var dkid pgtype.UUID
	if deviceKeyStr != "" {
		dkid, err = pgUUIDFromString(deviceKeyStr)
		if err != nil {
			http.Error(w, "invalid device_key_id", http.StatusBadRequest)
			return
		}
	} else {
		dkid = pgtype.UUID{Valid: false}
	}
	ctx := r.Context()
	uid := pgUUIDFromGoogle(userID)
	if err := h.db.WipeExpiredPastePayloadsForUser(ctx, uid); err != nil {
		http.Error(w, "Failed to refresh paste", http.StatusInternalServerError)
		return
	}
	row, err := h.db.FetchPasteContentByPasteID(ctx, database.FetchPasteContentByPasteIDParams{
		ID:          pid,
		UserID:      uid,
		DeviceKeyID: dkid,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Failed to load paste", http.StatusInternalServerError)
		return
	}
	now := time.Now().UTC()
	if len(row.EncryptedTitle) == 0 && len(row.EncryptedContent) == 0 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusGone)
		_, _ = w.Write([]byte(`{"error":"paste removed"}`))
		return
	}
	if pastePastExpiry(row.ExpiresAt, now) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusGone)
		_, _ = w.Write([]byte(`{"error":"paste expired"}`))
		return
	}
	outID, _ := uuid.FromBytes(row.ID.Bytes[:])
	resp := pasteContentResp{
		ID:               outID.String(),
		EncryptedTitle:   encodeBase64URL(row.EncryptedTitle),
		EncryptedContent: encodeBase64URL(row.EncryptedContent),
		WrappedDek:       encodeBase64URL(row.WrappedDek),
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

func (h *Handler) ListPastes(w http.ResponseWriter, r *http.Request) {
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
	deviceKeyStr := r.URL.Query().Get("device_key_id")
	var dkid pgtype.UUID
	if deviceKeyStr != "" {
		var err error
		dkid, err = pgUUIDFromString(deviceKeyStr)
		if err != nil {
			http.Error(w, "invalid device_key_id", http.StatusBadRequest)
			return
		}
	} else {
		dkid = pgtype.UUID{Valid: false}
	}
	ctx := r.Context()
	uid := pgUUIDFromGoogle(userID)
	if err := h.db.WipeExpiredPastePayloadsForUser(ctx, uid); err != nil {
		http.Error(w, "Failed to list pastes", http.StatusInternalServerError)
		return
	}
	rows, err := h.db.FetchPasteMetadataByDeviceID(ctx, database.FetchPasteMetadataByDeviceIDParams{
		UserID:      uid,
		DeviceKeyID: dkid,
	})
	if err != nil {
		http.Error(w, "Failed to list pastes", http.StatusInternalServerError)
		return
	}
	out := make([]pasteMetaResp, 0, len(rows))
	for _, row := range rows {
		pid, _ := uuid.FromBytes(row.PasteID.Bytes[:])
		payloadWiped := row.ExpiresAt.Valid && len(row.EncryptedTitle) == 0
		out = append(out, pasteMetaResp{
			PasteID:        pid.String(),
			EncryptedTitle: encodeBase64URL(row.EncryptedTitle),
			CreatedAt:      row.CreatedAt.Time.UTC().Format("2006-01-02T15:04:05Z07:00"),
			WrappedDek:     encodeBase64URL(row.WrappedDek),
			ExpiresAt:      formatExpiresAtJSON(row.ExpiresAt),
			PayloadWiped:   payloadWiped,
		})
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

type dekCoverageDeviceResp struct {
	DeviceKeyID string `json:"device_key_id"`
	PublicKey   string `json:"public_key"`
}

type dekCoveragePasteResp struct {
	PasteID             string   `json:"paste_id"`
	CreatedAt           string   `json:"created_at"`
	ExpiresAt           *string  `json:"expires_at,omitempty"`
	PayloadWiped        bool     `json:"payload_wiped"`
	DeviceKeyIDsWithDek []string `json:"device_key_ids_with_dek"`
}

type dekCoverageResp struct {
	Devices []dekCoverageDeviceResp `json:"devices"`
	Pastes  []dekCoveragePasteResp  `json:"pastes"`
}

func parseDeviceKeyCSV(csv string) []string {
	if csv == "" {
		return nil
	}
	parts := strings.Split(csv, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func (h *Handler) PasteDekCoverage(w http.ResponseWriter, r *http.Request) {
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
	uid := pgUUIDFromGoogle(userID)
	if err := h.db.WipeExpiredPastePayloadsForUser(ctx, uid); err != nil {
		http.Error(w, "Failed to load paste coverage", http.StatusInternalServerError)
		return
	}
	devRows, err := h.db.FetchPublicKeysByUserID(ctx, uid)
	if err != nil {
		http.Error(w, "Failed to list devices", http.StatusInternalServerError)
		return
	}
	pasteRows, err := h.db.FetchPasteDekCoverageActiveForUser(ctx, uid)
	if err != nil {
		http.Error(w, "Failed to list paste coverage", http.StatusInternalServerError)
		return
	}
	devices := make([]dekCoverageDeviceResp, 0, len(devRows))
	for _, row := range devRows {
		dk, _ := uuid.FromBytes(row.DeviceKeyID.Bytes[:])
		devices = append(devices, dekCoverageDeviceResp{
			DeviceKeyID: dk.String(),
			PublicKey:   encodeBase64URL(row.PublicKey),
		})
	}
	pastes := make([]dekCoveragePasteResp, 0, len(pasteRows))
	for _, row := range pasteRows {
		pid, _ := uuid.FromBytes(row.PasteID.Bytes[:])
		pastes = append(pastes, dekCoveragePasteResp{
			PasteID:             pid.String(),
			CreatedAt:           row.CreatedAt.Time.UTC().Format("2006-01-02T15:04:05Z07:00"),
			ExpiresAt:           formatExpiresAtJSON(row.ExpiresAt),
			PayloadWiped:        row.PayloadWiped,
			DeviceKeyIDsWithDek: parseDeviceKeyCSV(row.DeviceKeyIdsCsv),
		})
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(dekCoverageResp{
		Devices: devices,
		Pastes:  pastes,
	})
}

type burnedPasteResp struct {
	PasteID             string   `json:"paste_id"`
	CreatedAt           string   `json:"created_at"`
	ExpiresAt           *string  `json:"expires_at,omitempty"`
	BurnedAt            *string  `json:"burned_at,omitempty"`
	Reason              string   `json:"reason"`
	DeviceKeyIDsWithDek []string `json:"device_key_ids_with_dek"`
}

type burnedListResp struct {
	Devices []dekCoverageDeviceResp `json:"devices"`
	Pastes  []burnedPasteResp       `json:"pastes"`
}

func burnReason(burnedAt, expiresAt pgtype.Timestamptz) string {
	if burnedAt.Valid {
		return "burned"
	}
	if expiresAt.Valid {
		return "expired"
	}
	return "removed"
}

func formatBurnedAtJSON(t pgtype.Timestamptz) *string {
	if !t.Valid {
		return nil
	}
	s := t.Time.UTC().Format(time.RFC3339)
	return &s
}

func (h *Handler) ListBurnedPastes(w http.ResponseWriter, r *http.Request) {
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
	uid := pgUUIDFromGoogle(userID)
	if err := h.db.WipeExpiredPastePayloadsForUser(ctx, uid); err != nil {
		http.Error(w, "Failed to load burned pastes", http.StatusInternalServerError)
		return
	}
	devRows, err := h.db.FetchPublicKeysByUserID(ctx, uid)
	if err != nil {
		http.Error(w, "Failed to list devices", http.StatusInternalServerError)
		return
	}
	pasteRows, err := h.db.FetchPasteDekCoverageBurnedForUser(ctx, uid)
	if err != nil {
		http.Error(w, "Failed to list burned pastes", http.StatusInternalServerError)
		return
	}
	devices := make([]dekCoverageDeviceResp, 0, len(devRows))
	for _, row := range devRows {
		dk, _ := uuid.FromBytes(row.DeviceKeyID.Bytes[:])
		devices = append(devices, dekCoverageDeviceResp{
			DeviceKeyID: dk.String(),
			PublicKey:   encodeBase64URL(row.PublicKey),
		})
	}
	pastes := make([]burnedPasteResp, 0, len(pasteRows))
	for _, row := range pasteRows {
		pid, _ := uuid.FromBytes(row.PasteID.Bytes[:])
		pastes = append(pastes, burnedPasteResp{
			PasteID:             pid.String(),
			CreatedAt:           row.CreatedAt.Time.UTC().Format("2006-01-02T15:04:05Z07:00"),
			ExpiresAt:           formatExpiresAtJSON(row.ExpiresAt),
			BurnedAt:            formatBurnedAtJSON(row.BurnedAt),
			Reason:              burnReason(row.BurnedAt, row.ExpiresAt),
			DeviceKeyIDsWithDek: parseDeviceKeyCSV(row.DeviceKeyIdsCsv),
		})
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(burnedListResp{
		Devices: devices,
		Pastes:  pastes,
	})
}

func (h *Handler) BurnPaste(w http.ResponseWriter, r *http.Request) {
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
	pasteIDStr := r.PathValue("id")
	if pasteIDStr == "" {
		http.Error(w, "missing paste id", http.StatusBadRequest)
		return
	}
	pid, err := pgUUIDFromString(pasteIDStr)
	if err != nil {
		http.Error(w, "invalid paste id", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	uid := pgUUIDFromGoogle(userID)
	n, err := h.db.BurnPasteForUser(ctx, database.BurnPasteForUserParams{
		ID:     pid,
		UserID: uid,
	})
	if err != nil {
		http.Error(w, "Failed to burn paste", http.StatusInternalServerError)
		return
	}
	if n == 0 {
		http.Error(w, "Not found or already burned", http.StatusNotFound)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type rewrapPasteReq struct {
	WrappedDEKs []wrappedDEKIn `json:"wrapped_deks"`
}

func (h *Handler) RewrapPaste(w http.ResponseWriter, r *http.Request) {
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
	pasteIDStr := r.PathValue("id")
	if pasteIDStr == "" {
		http.Error(w, "missing paste id", http.StatusBadRequest)
		return
	}
	pid, err := pgUUIDFromString(pasteIDStr)
	if err != nil {
		http.Error(w, "invalid paste id", http.StatusBadRequest)
		return
	}
	var body rewrapPasteReq
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	if len(body.WrappedDEKs) == 0 {
		http.Error(w, "wrapped_deks must not be empty", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	uid := pgUUIDFromGoogle(userID)
	ok, err := h.db.PasteOwnedByUser(ctx, database.PasteOwnedByUserParams{
		ID:     pid,
		UserID: uid,
	})
	if err != nil {
		http.Error(w, "Failed to verify paste", http.StatusInternalServerError)
		return
	}
	if !ok {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}
	hasCipher, err := h.db.PasteHasCiphertext(ctx, database.PasteHasCiphertextParams{
		ID:     pid,
		UserID: uid,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Failed to verify paste", http.StatusInternalServerError)
		return
	}
	if !hasCipher.Valid || !hasCipher.Bool {
		http.Error(w, "paste has no ciphertext", http.StatusGone)
		return
	}
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		http.Error(w, "Transaction failed", http.StatusInternalServerError)
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()
	qtx := database.New(tx)
	for _, item := range body.WrappedDEKs {
		dkid, err := pgUUIDFromString(item.DeviceKeyID)
		if err != nil {
			http.Error(w, "invalid device_key_id", http.StatusBadRequest)
			return
		}
		owned, err := qtx.DeviceKeyOwnedByUser(ctx, database.DeviceKeyOwnedByUserParams{
			ID:     dkid,
			UserID: uid,
		})
		if err != nil {
			http.Error(w, "Failed to verify device key", http.StatusInternalServerError)
			return
		}
		if !owned {
			http.Error(w, "device_key_id not owned by user", http.StatusBadRequest)
			return
		}
		wb, err := decodeBase64(item.WrappedDek)
		if err != nil {
			http.Error(w, "invalid wrapped_dek", http.StatusBadRequest)
			return
		}
		if err := qtx.UpsertWrappedDEK(ctx, database.UpsertWrappedDEKParams{
			PasteID:     pid,
			DeviceKeyID: dkid,
			WrappedDek:  wb,
		}); err != nil {
			http.Error(w, "Failed to save wrapped key", http.StatusInternalServerError)
			return
		}
	}
	if err := tx.Commit(ctx); err != nil {
		http.Error(w, "Commit failed", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
