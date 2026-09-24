package handlers

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/x509"
	"fmt"
)

// assertECP384SPKI ensures SPKI bytes decode to an ECDSA P-384 public key.
func assertECP384SPKI(spki []byte) error {
	if len(spki) == 0 {
		return fmt.Errorf("empty public key")
	}
	pubAny, err := x509.ParsePKIXPublicKey(spki)
	if err != nil {
		return fmt.Errorf("invalid SPKI: %w", err)
	}
	ecPub, ok := pubAny.(*ecdsa.PublicKey)
	if !ok {
		return fmt.Errorf("public key must be ECDSA")
	}
	if ecPub.Curve != elliptic.P384() {
		return fmt.Errorf("curve must be P-384")
	}
	return nil
}
