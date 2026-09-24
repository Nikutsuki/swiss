package handlers

import (
	"crypto/rand"
	"encoding/base64"
	"sync"
	"time"

	"github.com/Nikutsuki/swiss/services/internal/database"
	"github.com/go-webauthn/webauthn/webauthn"
)

const webauthnSessionTTL = 5 * time.Minute

type sessionEntry struct {
	data              *webauthn.SessionData
	expires           time.Time
	loginScopeUserWID []byte // non-nil for email-scoped discoverable login (16-byte WebAuthn user id)
}

type Handler struct {
	db       *database.Queries
	webAuthn *webauthn.WebAuthn

	sessionStore struct {
		sync.RWMutex
		byKey map[string]sessionEntry
	}

	totpLimiter *slidingWindowLimiter
}

func New(db *database.Queries, wa *webauthn.WebAuthn) *Handler {
	h := &Handler{db: db, webAuthn: wa}
	h.sessionStore.byKey = make(map[string]sessionEntry)
	h.totpLimiter = newSlidingWindowLimiter(60*time.Second, 20)
	return h
}

func newWebAuthnSessionID() (string, error) {
	var b [32]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b[:]), nil
}

func clone16(src []byte) []byte {
	if len(src) != 16 {
		return nil
	}
	out := make([]byte, 16)
	copy(out, src)
	return out
}

// putSession stores ceremony state. loginScopeUserWID must be exactly 16 bytes when using email-scoped discoverable login.
func (h *Handler) putSession(key string, data *webauthn.SessionData, loginScopeUserWID []byte) {
	h.sessionStore.Lock()
	defer h.sessionStore.Unlock()
	h.sessionStore.byKey[key] = sessionEntry{
		data:              data,
		expires:           time.Now().Add(webauthnSessionTTL),
		loginScopeUserWID: clone16(loginScopeUserWID),
	}
}

// getAndDeleteSession removes and returns ceremony state. loginScopeUserWID is set for discoverable login started via beginLogin.
func (h *Handler) getAndDeleteSession(sessionKey string) (data *webauthn.SessionData, loginScopeUserWID []byte) {
	h.sessionStore.Lock()
	defer h.sessionStore.Unlock()
	ent, ok := h.sessionStore.byKey[sessionKey]
	if !ok {
		return nil, nil
	}
	delete(h.sessionStore.byKey, sessionKey)
	if time.Now().After(ent.expires) {
		return nil, nil
	}
	scope := clone16(ent.loginScopeUserWID)
	return ent.data, scope
}

func (h *Handler) saveSessionKeyed(sessionKey string, data *webauthn.SessionData, loginScopeUserWID []byte) {
	h.putSession(sessionKey, data, loginScopeUserWID)
}

// pruneExpiredSessions removes stale entries occasionally (best-effort).
func (h *Handler) pruneExpiredSessions() {
	h.sessionStore.Lock()
	defer h.sessionStore.Unlock()
	now := time.Now()
	for k, v := range h.sessionStore.byKey {
		if now.After(v.expires) {
			delete(h.sessionStore.byKey, k)
		}
	}
}
