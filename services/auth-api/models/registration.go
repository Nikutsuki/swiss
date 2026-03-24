package models

import "encoding/json"

type RegistrationFinishRequest struct {
	Attestation json.RawMessage `json:"attestation"`
	CredentialLabel string `json:"credentialLabel,omitempty"`
}