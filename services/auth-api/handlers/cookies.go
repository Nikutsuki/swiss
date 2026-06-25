package handlers

import (
	"net/http"
	"os"
	"strings"

	"github.com/Nikutsuki/swiss/services/internal/authn"
)

const (
	webauthnSessionCookie   = "webauthn_session"
	webauthnSessionMaxAge   = 300 // seconds
)

func cookieSecure() bool {
	return strings.TrimSpace(os.Getenv("COOKIE_SECURE")) == "true"
}

func cookieRootDomain() string {
	d := strings.TrimSpace(os.Getenv("NEXT_PUBLIC_ROOT_DOMAIN"))
	return strings.Trim(d, "\"")
}

func cookieSameSite() http.SameSite {
	if strings.EqualFold(strings.TrimSpace(os.Getenv("COOKIE_SAMESITE")), "strict") {
		return http.SameSiteStrictMode
	}
	return http.SameSiteLaxMode
}

func (h *Handler) setSSOCookie(w http.ResponseWriter, token string) {
	c := &http.Cookie{
		Name:     authn.SSOCookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   3600*3,
		HttpOnly: true,
		Secure:   cookieSecure(),
		SameSite: cookieSameSite(),
	}
	if d := cookieRootDomain(); d != "" {
		c.Domain = d
	}
	http.SetCookie(w, c)
}

func (h *Handler) setWebAuthnSessionCookie(w http.ResponseWriter, sessionID string) {
	c := &http.Cookie{
		Name:     webauthnSessionCookie,
		Value:    sessionID,
		Path:     "/",
		MaxAge:   webauthnSessionMaxAge,
		HttpOnly: true,
		Secure:   cookieSecure(),
		SameSite: cookieSameSite(),
	}
	if d := cookieRootDomain(); d != "" {
		c.Domain = d
	}
	http.SetCookie(w, c)
}

func (h *Handler) clearWebAuthnSessionCookie(w http.ResponseWriter) {
	c := &http.Cookie{
		Name:     webauthnSessionCookie,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   cookieSecure(),
		SameSite: cookieSameSite(),
	}
	if d := cookieRootDomain(); d != "" {
		c.Domain = d
	}
	http.SetCookie(w, c)
}

func webAuthnSessionFromRequest(r *http.Request) string {
	c, err := r.Cookie(webauthnSessionCookie)
	if err != nil || c.Value == "" {
		return ""
	}
	return c.Value
}
