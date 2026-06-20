package handlers

import (
	"encoding/json"
	"io"
	"net/http"
)

type emailJSON struct {
	Email string `json:"email"`
}

type wrappedRegistration struct {
	Email      string          `json:"email"`
	Credential json.RawMessage `json:"credential"`
}

type wrappedAssertion struct {
	Email      string          `json:"email"`
	ReturnTo   string          `json:"returnTo"`
	Credential json.RawMessage `json:"credential"`
}

func readEmailPOST(w http.ResponseWriter, r *http.Request) (string, bool) {
	var body emailJSON
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON body", http.StatusBadRequest)
		return "", false
	}
	if body.Email == "" {
		http.Error(w, "email is required", http.StatusBadRequest)
		return "", false
	}
	return body.Email, true
}

// unwrapRegistrationBody returns JSON bytes suitable for protocol.ParseCredentialCreationResponseBody.
func unwrapRegistrationBody(r *http.Request) ([]byte, error) {
	raw, err := io.ReadAll(r.Body)
	if err != nil {
		return nil, err
	}
	var wrap wrappedRegistration
	if err := json.Unmarshal(raw, &wrap); err == nil && len(wrap.Credential) > 0 {
		return wrap.Credential, nil
	}
	return raw, nil
}

// unwrapAssertionBody returns credential JSON, email, returnTo.
func unwrapAssertionBody(r *http.Request) (credJSON []byte, email string, returnTo string, err error) {
	raw, err := io.ReadAll(r.Body)
	if err != nil {
		return nil, "", "", err
	}
	var wrap wrappedAssertion
	if json.Unmarshal(raw, &wrap) == nil && len(wrap.Credential) > 0 {
		email = wrap.Email
		returnTo = wrap.ReturnTo
		if email == "" {
			email = r.URL.Query().Get("email")
		}
		if returnTo == "" {
			returnTo = r.URL.Query().Get("returnTo")
		}
		return wrap.Credential, email, returnTo, nil
	}
	return raw, r.URL.Query().Get("email"), r.URL.Query().Get("returnTo"), nil
}

