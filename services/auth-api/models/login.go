package models

type LoginFinishResponse struct {
	CredentialID                  string `json:"credentialId"`
	RedirectTo                    string `json:"redirectTo"`
	RequireLocalPasskeyEnrollment bool   `json:"requireLocalPasskeyEnrollment"`
}
