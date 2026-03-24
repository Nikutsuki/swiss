package models

// EncryptedPasteCreateRequest is the JSON body for POST /pastes (base64 fields).
type EncryptedPasteCreateRequest struct {
	EncryptedTitle   string            `json:"encrypted_title"`
	EncryptedContent string            `json:"encrypted_content"`
	WrappedDEKs      []WrappedDEKEntry `json:"wrapped_deks"`
	ExpiresInSeconds *int              `json:"expires_in_seconds,omitempty"`
}

// WrappedDEKEntry maps a device key to its wrapped DEK blob (base64).
type WrappedDEKEntry struct {
	DeviceKeyID string `json:"device_key_id"`
	WrappedDek  string `json:"wrapped_dek"`
}

// PasteContentResponse is returned by GET /pastes/{id}.
type PasteContentResponse struct {
	ID               string `json:"id"`
	EncryptedTitle   string `json:"encrypted_title"`
	EncryptedContent string `json:"encrypted_content"`
	WrappedDek       string `json:"wrapped_dek"`
}

// PasteMetadataResponse is one row from GET /pastes.
type PasteMetadataResponse struct {
	PasteID        string  `json:"paste_id"`
	EncryptedTitle string  `json:"encrypted_title"`
	CreatedAt      string  `json:"created_at"`
	WrappedDek     string  `json:"wrapped_dek"`
	ExpiresAt      *string `json:"expires_at,omitempty"`
	PayloadWiped   bool    `json:"payload_wiped"`
}

// DekCoveragePasteRow is one paste entry in DekCoverageResponse.
type DekCoveragePasteRow struct {
	PasteID             string   `json:"paste_id"`
	CreatedAt           string   `json:"created_at"`
	ExpiresAt           *string  `json:"expires_at,omitempty"`
	PayloadWiped        bool     `json:"payload_wiped"`
	DeviceKeyIDsWithDek []string `json:"device_key_ids_with_dek"`
}

// DekCoverageResponse is returned by GET /pastes/dek-coverage.
type DekCoverageResponse struct {
	Devices []DeviceKeyResponse   `json:"devices"`
	Pastes  []DekCoveragePasteRow `json:"pastes"`
}

// BurnedPasteRow is one paste entry in BurnedPastesResponse.
type BurnedPasteRow struct {
	PasteID             string   `json:"paste_id"`
	CreatedAt           string   `json:"created_at"`
	ExpiresAt           *string  `json:"expires_at,omitempty"`
	BurnedAt            *string  `json:"burned_at,omitempty"`
	Reason              string   `json:"reason"`
	DeviceKeyIDsWithDek []string `json:"device_key_ids_with_dek"`
}

// BurnedPastesResponse is returned by GET /pastes/burned.
type BurnedPastesResponse struct {
	Devices []DeviceKeyResponse `json:"devices"`
	Pastes  []BurnedPasteRow    `json:"pastes"`
}

type ShareVisibilityMode string

const (
	ShareVisibilityPublic   ShareVisibilityMode = "public"
	ShareVisibilityPassword ShareVisibilityMode = "password"
)

// SharePasswordKDF contains Argon2id parameters and salt used for deriving key material.
type SharePasswordKDF struct {
	Salt             string `json:"salt"`
	MemoryKib        int    `json:"memory_kib"`
	Iterations       int    `json:"iterations"`
	Parallelism      int    `json:"parallelism"`
	DerivedKeyLength int    `json:"derived_key_length"`
}

// UpsertPasteShareRequest is the JSON body for POST /pastes/{id}/share.
type UpsertPasteShareRequest struct {
	VisibilityMode   ShareVisibilityMode `json:"visibility_mode"`
	ShareWrapNonce   string              `json:"share_wrap_nonce,omitempty"`
	ShareWrapBlob    string              `json:"share_wrap_blob,omitempty"`
	PasswordKDF      *SharePasswordKDF   `json:"password_kdf,omitempty"`
	ExpiresInSeconds *int                `json:"expires_in_seconds,omitempty"`
}

// UpsertPasteShareResponse returns the opaque share token and URL.
type UpsertPasteShareResponse struct {
	Token string `json:"token"`
	URL   string `json:"url"`
}

// SharedPasteResponse is returned by GET /shared-pastes/{token}.
type SharedPasteResponse struct {
	Token            string              `json:"token"`
	VisibilityMode   ShareVisibilityMode `json:"visibility_mode"`
	EncryptedTitle   string              `json:"encrypted_title"`
	EncryptedContent string              `json:"encrypted_content"`
	ShareWrapNonce   string              `json:"share_wrap_nonce,omitempty"`
	ShareWrapBlob    string              `json:"share_wrap_blob,omitempty"`
	PasswordKDF      *SharePasswordKDF   `json:"password_kdf,omitempty"`
	ExpiresAt        *string             `json:"expires_at,omitempty"`
}

// SharedPasteMetadataResponse is one row from GET /pastes/shared/recent.
type SharedPasteMetadataResponse struct {
	PasteID        string              `json:"paste_id"`
	PublicToken    string              `json:"public_token"`
	VisibilityMode ShareVisibilityMode `json:"visibility_mode"`
	EncryptedTitle string              `json:"encrypted_title"`
	CreatedAt      string              `json:"created_at"`
	ExpiresAt      *string             `json:"expires_at,omitempty"`
}

// RegisterDeviceRequest is the JSON body for POST /devices.
type RegisterDeviceRequest struct {
	PublicKey string `json:"public_key"`
}

// RegisterDeviceResponse is returned after POST /devices.
type RegisterDeviceResponse struct {
	DeviceKeyID string `json:"device_key_id"`
}

// DeviceKeyResponse is one row from GET /devices/keys.
type DeviceKeyResponse struct {
	DeviceKeyID string `json:"device_key_id"`
	PublicKey   string `json:"public_key"`
}
