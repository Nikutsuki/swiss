module github.com/Nikutsuki/swiss/services/internal/authn

go 1.26.1

require github.com/Nikutsuki/swiss/services/internal/jwtutil v0.0.0-00010101000000-000000000000

require (
	github.com/golang-jwt/jwt/v5 v5.3.1 // indirect
	github.com/jackc/pgx/v5 v5.9.1 // indirect
	golang.org/x/sync v0.20.0 // indirect
)

replace github.com/Nikutsuki/swiss/services/internal/jwtutil => ../jwtutil
