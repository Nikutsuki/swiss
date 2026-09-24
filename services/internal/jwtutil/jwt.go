package jwtutil

import (
	"errors"
	"log"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type Claims struct {
	UserID string `json:"userID"`
	Email  string `json:"email"`
}

func GenerateJWT(userID pgtype.UUID, email string) (string, error) {
	secret := strings.TrimSpace(os.Getenv("JWT_SECRET"))
	if secret == "" {
		return "", errors.New("JWT_SECRET is not set")
	}
	secretKey := []byte(secret)

	log.Printf("Generating JWT for userID: %s, email: %s", userID.String(), email)

	claims := jwt.MapClaims{
		"sub":   userID.String(),
		"email": email,
		"iat":   time.Now().Unix(),
		"exp":   time.Now().Add(1 * time.Hour).Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signedString, err := token.SignedString(secretKey)
	if err != nil {
		return "", err
	}

	return signedString, nil
}

func ValidateJWT(tokenString string) (*Claims, error) {
	secret := strings.TrimSpace(os.Getenv("JWT_SECRET"))
	if secret == "" {
		return nil, errors.New("JWT_SECRET is not set")
	}

	parsed, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(secret), nil
	})
	if err != nil {
		return nil, err
	}
	if !parsed.Valid {
		return nil, errors.New("invalid token")
	}

	mapClaims, ok := parsed.Claims.(jwt.MapClaims)
	if !ok {
		return nil, errors.New("invalid token claims")
	}

	sub, ok := mapClaims["sub"].(string)
	if !ok || sub == "" {
		return nil, errors.New("missing subject claim")
	}

	email, _ := mapClaims["email"].(string)

	return &Claims{UserID: sub, Email: email}, nil
}
