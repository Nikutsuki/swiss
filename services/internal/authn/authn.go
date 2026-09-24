package authn

import (
	"errors"
	"net/http"

	"github.com/Nikutsuki/swiss/services/internal/jwtutil"
)

// SSOCookieName matches the cookie set by auth-api on successful login.
const SSOCookieName = "sso_token"

// ClaimsFromRequest reads and validates the SSO JWT from the request cookie.
func ClaimsFromRequest(r *http.Request) (*jwtutil.Claims, error) {
	c, err := r.Cookie(SSOCookieName)
	if err != nil || c.Value == "" {
		return nil, errors.New("missing sso token")
	}
	return jwtutil.ValidateJWT(c.Value)
}
