package handlers

import (
	"bytes"
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"github.com/Nikutsuki/swiss/services/auth-api/models"
	"github.com/Nikutsuki/swiss/services/internal/database"
	"github.com/Nikutsuki/swiss/services/internal/jwtutil"
	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// RegisterOptions is POST /register/options — JSON { "email" }, WebAuthn session cookie.
func (h *Handler) RegisterOptions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	email, ok := readEmailPOST(w, r)
	if !ok {
		return
	}
	h.registerOptions(w, r, email, true)
}

// BeginRegistration is legacy GET /register/begin?email=
func (h *Handler) BeginRegistration(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	email := r.URL.Query().Get("email")
	if email == "" {
		http.Error(w, "email is required", http.StatusBadRequest)
		return
	}
	h.registerOptions(w, r, email, false)
}

func (h *Handler) registerOptions(w http.ResponseWriter, r *http.Request, email string, useCookieSession bool) {
	ctx := r.Context()
	h.pruneExpiredSessions()

	row, err := h.db.GetUserByEmail(ctx, email)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, "Service unavailable", http.StatusInternalServerError)
		log.Printf("Database error: %v", err)
		return
	}

	var authUser database.AuthUser
	if errors.Is(err, pgx.ErrNoRows) {
		authUser, err = h.db.CreateUser(ctx, email)
		if err != nil {
			http.Error(w, "Failed to create user identity", http.StatusInternalServerError)
			return
		}
	} else {
		authUser = database.AuthUser{
			ID:        row.ID,
			Email:     row.Email,
			CreatedAt: pgtype.Timestamptz{},
		}
	}

	activeCreds, credErr := h.db.GetActiveCredentialsByUserID(ctx, authUser.ID)
	if credErr != nil {
		http.Error(w, "Failed to retrieve credentials", http.StatusInternalServerError)
		log.Printf("Database error: %v", credErr)
		return
	}

	claims, authed := h.optionalClaims(r)
	if len(activeCreds) > 0 {
		if !authed {
			http.Error(w, "User already registered on a device. Please sign in.", http.StatusConflict)
			return
		}
		if err := claimsMatchUser(claims, authUser); err != nil {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
	}

	webCreds := dbCredentialsToWebauthn(activeCreds)
	user := &models.WebAuthnUser{AuthUser: authUser, Credentials: webCreds}

	options, sessionData, err := h.webAuthn.BeginRegistration(user)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if useCookieSession {
		sid, err := newWebAuthnSessionID()
		if err != nil {
			http.Error(w, "session error", http.StatusInternalServerError)
			return
		}
		h.saveSessionKeyed(sid, sessionData, nil)
		h.setWebAuthnSessionCookie(w, sid)
	} else {
		h.saveSessionKeyed(email, sessionData, nil)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(options)
}

// RegisterVerify is POST /register/verify — WebAuthn attestation JSON (optionally wrapped with { "email", "credential" }).
func (h *Handler) RegisterVerify(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	h.finishRegistration(w, r, true)
}

// FinishRegistration is legacy POST /register/finish?email=
func (h *Handler) FinishRegistration(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	h.finishRegistration(w, r, false)
}

func (h *Handler) finishRegistration(w http.ResponseWriter, r *http.Request, preferCookieSession bool) {
	ctx := r.Context()

	rawBody, err := unwrapRegistrationBody(r)
	if err != nil {
		http.Error(w, "Failed to read body", http.StatusBadRequest)
		return
	}

	var sessionData *webauthn.SessionData
	if preferCookieSession {
		sid := webAuthnSessionFromRequest(r)
		if sid != "" {
			sessionData, _ = h.getAndDeleteSession(sid)
			h.clearWebAuthnSessionCookie(w)
		}
	}
	if sessionData == nil {
		email := r.URL.Query().Get("email")
		if email == "" {
			http.Error(w, "Cryptographic session expired", http.StatusBadRequest)
			return
		}
		sessionData, _ = h.getAndDeleteSession(email)
	}
	if sessionData == nil {
		http.Error(w, "Cryptographic session expired", http.StatusBadRequest)
		return
	}

	userID, ok := sessionUserIDToPgUUID(sessionData.UserID)
	if !ok {
		http.Error(w, "Invalid session", http.StatusBadRequest)
		return
	}

	userRecord, err := h.db.GetUserByID(ctx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "User identity not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Service unavailable", http.StatusInternalServerError)
		return
	}

	activeCreds, err := h.db.GetActiveCredentialsByUserID(ctx, userRecord.ID)
	if err != nil {
		http.Error(w, "Failed to retrieve credentials", http.StatusInternalServerError)
		return
	}

	claims, authed := h.optionalClaims(r)
	if len(activeCreds) > 0 {
		if !authed {
			http.Error(w, "User already registered on a device. Please sign in.", http.StatusConflict)
			return
		}
		if err := claimsMatchUser(claims, userRecord); err != nil {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
	}

	user := &models.WebAuthnUser{AuthUser: userRecord, Credentials: []webauthn.Credential{}}

	parsedResponse, err := protocol.ParseCredentialCreationResponseBody(bytes.NewReader(rawBody))
	if err != nil {
		http.Error(w, "Failed to parse attestation", http.StatusBadRequest)
		return
	}

	credential, err := h.webAuthn.CreateCredential(user, *sessionData, parsedResponse)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	_, err = h.db.CreateCredential(ctx, database.CreateCredentialParams{
		UserID:          userRecord.ID,
		CredentialID:    credential.ID,
		PublicKey:       credential.PublicKey,
		SignCount:       pgtype.Int8{Int64: int64(credential.Authenticator.SignCount), Valid: true},
		Aaguid:          credential.Authenticator.AAGUID,
		BackupEligible:  credential.Flags.BackupEligible,
		BackupState:     credential.Flags.BackupState,
		CredentialLabel: pgtype.Text{},
	})
	if err != nil {
		http.Error(w, "Failed to persist credential", http.StatusInternalServerError)
		return
	}

	jwtToken, err := jwtutil.GenerateJWT(userRecord.ID, userRecord.Email)
	if err != nil {
		http.Error(w, "Failed to generate authentication token", http.StatusInternalServerError)
		return
	}
	h.setSSOCookie(w, jwtToken)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"status":  "success",
		"message": "Credential registered successfully",
	})
}

// defaultCredentialTransports lists all common WebAuthn transports for allowCredentials / excludeCredentials.
// We do not persist transports in the DB yet; an empty list in assertion options can cause Chromium/Edge to skip
// platform authenticators (Windows Hello) unless hints are set—supplying the full set keeps UX correct.
func defaultCredentialTransports() []protocol.AuthenticatorTransport {
	return []protocol.AuthenticatorTransport{
		protocol.Internal,
		protocol.Hybrid,
		protocol.USB,
		protocol.NFC,
		protocol.BLE,
	}
}

func dbCredentialsToWebauthn(rows []database.AuthCredential) []webauthn.Credential {
	out := make([]webauthn.Credential, 0, len(rows))
	transports := defaultCredentialTransports()
	for _, c := range rows {
		out = append(out, webauthn.Credential{
			ID:        c.CredentialID,
			PublicKey: c.PublicKey,
			Transport: transports,
			Flags: webauthn.CredentialFlags{
				BackupEligible: c.BackupEligible,
				BackupState:    c.BackupState,
			},
			Authenticator: webauthn.Authenticator{
				SignCount: uint32(c.SignCount.Int64),
				AAGUID:    c.Aaguid,
			},
		})
	}
	return out
}

func applyAssertionFlagsForLegacyCredential(credentials []webauthn.Credential, rows []database.AuthCredential, rawID []byte, flags protocol.AuthenticatorFlags) {
	for i := range credentials {
		if i >= len(rows) || rows[i].CredentialFlagsInitialized || !bytes.Equal(credentials[i].ID, rawID) {
			continue
		}
		credentials[i].Flags.BackupEligible = flags.HasBackupEligible()
		credentials[i].Flags.BackupState = flags.HasBackupState()
		return
	}
}

func sessionUserIDToPgUUID(userID []byte) (pgtype.UUID, bool) {
	if len(userID) != 16 {
		return pgtype.UUID{}, false
	}
	var u pgtype.UUID
	copy(u.Bytes[:], userID)
	u.Valid = true
	return u, true
}

func claimsMatchUser(claims *jwtutil.Claims, user database.AuthUser) error {
	if claims == nil {
		return errors.New("no claims")
	}
	uid, err := uuid.Parse(claims.UserID)
	if err != nil {
		return err
	}
	if !user.ID.Valid {
		return errors.New("invalid user")
	}
	stored := uuid.UUID(user.ID.Bytes)
	if uid != stored {
		return errors.New("subject mismatch")
	}
	if claims.Email != "" && claims.Email != user.Email {
		return errors.New("email mismatch")
	}
	return nil
}
