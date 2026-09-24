package handlers

import (
	"net/http"

	"github.com/Nikutsuki/swiss/services/internal/authn"
	"github.com/Nikutsuki/swiss/services/internal/jwtutil"
)

func (h *Handler) optionalClaims(r *http.Request) (*jwtutil.Claims, bool) {
	claims, err := authn.ClaimsFromRequest(r)
	if err != nil {
		return nil, false
	}
	return claims, true
}
