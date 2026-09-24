package handlers

import (
	"encoding/base64"
	"fmt"
)

func decodeBase64(s string) ([]byte, error) {
	if s == "" {
		return nil, fmt.Errorf("empty payload")
	}
	// Prefer standard base64; accept URL-safe variants.
	b, err := base64.StdEncoding.DecodeString(s)
	if err == nil {
		return b, nil
	}
	b, err = base64.RawStdEncoding.DecodeString(s)
	if err == nil {
		return b, nil
	}
	b, err = base64.URLEncoding.DecodeString(s)
	if err == nil {
		return b, nil
	}
	return base64.RawURLEncoding.DecodeString(s)
}

func encodeBase64URL(b []byte) string {
	return base64.RawURLEncoding.EncodeToString(b)
}
