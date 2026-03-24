package handlers

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"

	"github.com/Nikutsuki/swiss/services/auth-api/models"
	"github.com/Nikutsuki/swiss/services/internal/database"
	"github.com/Nikutsuki/swiss/services/internal/jwtutil"
	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// LoginOptions is POST /login/options — JSON { "email" }, sets WebAuthn session cookie.
func (h *Handler) LoginOptions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	email, ok := readEmailPOST(w, r)
	if !ok {
		return
	}
	h.beginLogin(w, r, email, true)
}

// BeginLogin is legacy GET /login/begin?email=
func (h *Handler) BeginLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	email := r.URL.Query().Get("email")
	if email == "" {
		http.Error(w, "email is required", http.StatusBadRequest)
		return
	}
	h.beginLogin(w, r, email, false)
}

func (h *Handler) beginLogin(w http.ResponseWriter, r *http.Request, email string, useCookieSession bool) {
	ctx := r.Context()
	h.pruneExpiredSessions()

	row, err := h.db.GetUserByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "User identity not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Service unavailable", http.StatusInternalServerError)
		return
	}

	if !row.ID.Valid {
		http.Error(w, "Invalid user record", http.StatusInternalServerError)
		return
	}

	dbCreds, err := h.db.GetActiveCredentialsByUserID(ctx, row.ID)
	if err != nil {
		http.Error(w, "Failed to retrieve credentials", http.StatusInternalServerError)
		return
	}
	if len(dbCreds) == 0 {
		http.Error(w, "No credentials for this account", http.StatusBadRequest)
		return
	}

	// Discoverable (resident) login: omit allowCredentials so Chromium/Edge offers Windows Hello / this device.
	// Ceremony is scoped to the typed email via loginScopeUserWID in the session (see finishLogin).
	options, sessionData, err := h.webAuthn.BeginDiscoverableLogin(
		webauthn.WithAssertionPublicKeyCredentialHints([]protocol.PublicKeyCredentialHints{
			protocol.PublicKeyCredentialHintClientDevice,
			protocol.PublicKeyCredentialHintHybrid,
			protocol.PublicKeyCredentialHintSecurityKey,
		}),
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	scope := row.ID.Bytes[:]

	if useCookieSession {
		sid, err := newWebAuthnSessionID()
		if err != nil {
			http.Error(w, "session error", http.StatusInternalServerError)
			return
		}
		h.saveSessionKeyed(sid, sessionData, scope)
		h.setWebAuthnSessionCookie(w, sid)
	} else {
		h.saveSessionKeyed(email, sessionData, scope)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(options)
}

// LoginVerify is POST /login/verify.
func (h *Handler) LoginVerify(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	h.finishLogin(w, r, true)
}

// FinishLogin is legacy POST /login/finish?email=&returnTo=
func (h *Handler) FinishLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	h.finishLogin(w, r, false)
}

func (h *Handler) finishLogin(w http.ResponseWriter, r *http.Request, preferCookieSession bool) {
	ctx := r.Context()

	credJSON, email, returnTo, err := unwrapAssertionBody(r)
	if err != nil {
		http.Error(w, "Failed to read body", http.StatusBadRequest)
		return
	}

	var sessionData *webauthn.SessionData
	var loginScope []byte

	if preferCookieSession {
		sid := webAuthnSessionFromRequest(r)
		if sid != "" {
			sessionData, loginScope = h.getAndDeleteSession(sid)
			h.clearWebAuthnSessionCookie(w)
		}
	}
	if sessionData == nil && !preferCookieSession && email != "" {
		sessionData, loginScope = h.getAndDeleteSession(email)
	}
	if sessionData == nil {
		http.Error(w, "Cryptographic session expired", http.StatusBadRequest)
		return
	}

	if email == "" {
		http.Error(w, "email is required", http.StatusBadRequest)
		return
	}

	parsed, err := protocol.ParseCredentialRequestResponseBytes(credJSON)
	if err != nil {
		http.Error(w, "Failed to parse assertion", http.StatusBadRequest)
		return
	}

	userRecordRow, err := h.db.GetUserByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "User identity not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Service unavailable", http.StatusInternalServerError)
		return
	}

	authUser := database.AuthUser{
		ID:        userRecordRow.ID,
		Email:     userRecordRow.Email,
		CreatedAt: pgtype.Timestamptz{},
	}

	dbCreds, err := h.db.GetActiveCredentialsByUserID(ctx, authUser.ID)
	if err != nil {
		http.Error(w, "Failed to retrieve credentials", http.StatusInternalServerError)
		return
	}

	webAuthnCreds := dbCredentialsToWebauthn(dbCreds)
	webUser := &models.WebAuthnUser{AuthUser: authUser, Credentials: webAuthnCreds}

	var credential *webauthn.Credential

	switch {
	case len(loginScope) == 16:
		if !userRecordRow.ID.Valid || !bytes.Equal(loginScope, userRecordRow.ID.Bytes[:]) {
			http.Error(w, "Session does not match this email", http.StatusBadRequest)
			return
		}
		handler := func(rawID, userHandle []byte) (webauthn.User, error) {
			if len(userHandle) != 16 || !bytes.Equal(userHandle, loginScope) {
				return nil, fmt.Errorf("passkey is not for this account")
			}
			credMeta, err := h.db.GetCredentialByCredentialID(ctx, rawID)
			if err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					return nil, fmt.Errorf("unknown credential")
				}
				return nil, err
			}
			if credMeta.RevokedAt.Valid {
				return nil, fmt.Errorf("credential revoked")
			}
			if !credMeta.UserID.Valid || !bytes.Equal(credMeta.UserID.Bytes[:], userRecordRow.ID.Bytes[:]) {
				return nil, fmt.Errorf("credential not linked to this user")
			}
			return webUser, nil
		}
		_, credential, err = h.webAuthn.ValidatePasskeyLogin(handler, *sessionData, parsed)
		if err != nil {
			http.Error(w, "Cryptographic signature validation failed", http.StatusUnauthorized)
			return
		}

	case len(sessionData.UserID) > 0:
		// Legacy session: allowCredentials-based login (older deployments).
		credential, err = h.webAuthn.ValidateLogin(webUser, *sessionData, parsed)
		if err != nil {
			http.Error(w, "Cryptographic signature validation failed", http.StatusUnauthorized)
			return
		}

	default:
		http.Error(w, "Invalid authentication session", http.StatusBadRequest)
		return
	}

	var assertedCred database.AuthCredential
	found := false
	for _, c := range dbCreds {
		if string(c.CredentialID) == string(credential.ID) {
			assertedCred = c
			found = true
			break
		}
	}

	if !found {
		http.Error(w, "Asserted credential not found in database", http.StatusInternalServerError)
		return
	}

	err = h.db.UpdateCredentialSignCount(ctx, database.UpdateCredentialSignCountParams{
		SignCount:    pgtype.Int8{Int64: int64(credential.Authenticator.SignCount), Valid: true},
		CredentialID: assertedCred.CredentialID,
	})
	if err != nil {
		log.Printf("Failed to update sign count: %v", err)
	}

	if err = h.db.TouchCredentialLastUsed(ctx, assertedCred.ID); err != nil {
		log.Printf("Failed to update last_used_at: %v", err)
	}

	jwtToken, err := jwtutil.GenerateJWT(authUser.ID, authUser.Email)
	if err != nil {
		http.Error(w, "Failed to generate authentication token", http.StatusInternalServerError)
		return
	}
	h.setSSOCookie(w, jwtToken)

	requireEnroll := parsed.AuthenticatorAttachment == protocol.CrossPlatform

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(models.LoginFinishResponse{
		CredentialID:                  base64.RawURLEncoding.EncodeToString(assertedCred.CredentialID),
		RedirectTo:                    returnTo,
		RequireLocalPasskeyEnrollment: requireEnroll,
	})
}
