package handlers

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/Nikutsuki/swiss/services/internal/database"
	"github.com/Nikutsuki/swiss/services/internal/jwtutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/pquerna/otp"
	"github.com/pquerna/otp/totp"
)

type totpGenerateResponse struct {
	OtpauthURI string `json:"otpauthUri"`
	Secret     string `json:"secret"`
}

type totpVerifyRequest struct {
	Email string `json:"email"`
	Token string `json:"token"`
}

type totpVerifyResponse struct {
	RequireLocalPasskeyEnrollment bool `json:"requireLocalPasskeyEnrollment"`
}

func totpIssuer() string {
	s := strings.TrimSpace(os.Getenv("TOTP_ISSUER"))
	if s == "" {
		return "Swiss"
	}
	return s
}

// TOTPGenerate is POST /totp/generate (authenticated).
func (h *Handler) TOTPGenerate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	claims, ok := h.optionalClaims(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	uid, err := uuid.Parse(claims.UserID)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	var userID pgtype.UUID
	copy(userID.Bytes[:], uid[:])
	userID.Valid = true

	ctx := r.Context()
	user, err := h.db.GetUserByID(ctx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		http.Error(w, "Service error", http.StatusInternalServerError)
		return
	}

	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      totpIssuer(),
		AccountName: user.Email,
		Period:      30,
		SecretSize:  20,
	})
	if err != nil {
		log.Printf("totp generate: %v", err)
		http.Error(w, "Failed to generate secret", http.StatusInternalServerError)
		return
	}

	secret := key.Secret()
	_, err = h.db.UpsertTOTPSecret(ctx, database.UpsertTOTPSecretParams{
		UserID:     userID,
		SecretSeed: secret,
	})
	if err != nil {
		http.Error(w, "Failed to store secret", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(totpGenerateResponse{
		OtpauthURI: key.URL(),
		Secret:     secret,
	})
}

// TOTPVerify is POST /totp/verify — fallback login.
func (h *Handler) TOTPVerify(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req totpVerifyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	req.Token = strings.TrimSpace(req.Token)
	if req.Email == "" || req.Token == "" {
		http.Error(w, "email and token are required", http.StatusBadRequest)
		return
	}

	rateKey := "totp:" + req.Email
	if !h.totpLimiter.allow(rateKey) {
		http.Error(w, "Too many attempts", http.StatusTooManyRequests)
		return
	}

	ctx := r.Context()
	row, err := h.db.GetTOTPByEmail(ctx, req.Email)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "Invalid credentials", http.StatusUnauthorized)
			return
		}
		http.Error(w, "Service error", http.StatusInternalServerError)
		return
	}

	ok, err := totp.ValidateCustom(req.Token, row.SecretSeed, time.Now(), totp.ValidateOpts{
		Period: 30,
		Skew:   1,
		Digits: otp.DigitsSix,
	})
	if err != nil || !ok {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	if !row.IsActive.Valid || !row.IsActive.Bool {
		if err := h.db.SetTOTPActive(ctx, row.UserID); err != nil {
			log.Printf("set totp active: %v", err)
		}
	}

	user, err := h.db.GetUserByID(ctx, row.UserID)
	if err != nil {
		http.Error(w, "Service error", http.StatusInternalServerError)
		return
	}

	jwtToken, err := jwtutil.GenerateJWT(user.ID, user.Email)
	if err != nil {
		http.Error(w, "Failed to generate authentication token", http.StatusInternalServerError)
		return
	}
	h.setSSOCookie(w, jwtToken)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(totpVerifyResponse{RequireLocalPasskeyEnrollment: false})
}
