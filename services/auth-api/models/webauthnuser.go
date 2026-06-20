package models

import (
	"github.com/Nikutsuki/swiss/services/internal/database"
	"github.com/go-webauthn/webauthn/webauthn"
)

type WebAuthnUser struct {
	AuthUser    database.AuthUser
	Credentials []webauthn.Credential
}

func (u *WebAuthnUser) WebAuthnID() []byte {
	if !u.AuthUser.ID.Valid {
		return nil
	}
	return u.AuthUser.ID.Bytes[:]
}

func (u *WebAuthnUser) WebAuthnName() string {
	return u.AuthUser.Email
}

func (u *WebAuthnUser) WebAuthnDisplayName() string {
	return u.AuthUser.Email
}

func (u *WebAuthnUser) WebAuthnCredentials() []webauthn.Credential {
	return u.Credentials
}
