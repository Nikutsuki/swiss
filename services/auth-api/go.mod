module github.com/Nikutsuki/swiss/services/auth-api

go 1.26.1

require (
	github.com/Nikutsuki/swiss/services/internal/authn v0.0.0-00010101000000-000000000000
	github.com/Nikutsuki/swiss/services/internal/database v0.0.0-00010101000000-000000000000
	github.com/go-webauthn/webauthn v0.16.1
	github.com/google/uuid v1.6.0
	github.com/jackc/pgx/v5 v5.9.1
	github.com/joho/godotenv v1.5.1
)

require (
	github.com/Nikutsuki/swiss/services/internal/jwtutil v0.0.0-00010101000000-000000000000
	github.com/pquerna/otp v1.5.0
)

require (
	github.com/boombuler/barcode v1.0.1-0.20190219062509-6c824513bacc // indirect
	github.com/fxamacker/cbor/v2 v2.9.0 // indirect
	github.com/go-viper/mapstructure/v2 v2.5.0 // indirect
	github.com/go-webauthn/x v0.2.2 // indirect
	github.com/golang-jwt/jwt/v5 v5.3.1 // indirect
	github.com/google/go-tpm v0.9.8 // indirect
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/puddle/v2 v2.2.2 // indirect
	github.com/x448/float16 v0.8.4 // indirect
	golang.org/x/crypto v0.49.0 // indirect
	golang.org/x/sync v0.20.0 // indirect
	golang.org/x/sys v0.42.0 // indirect
	golang.org/x/text v0.35.0 // indirect
)

replace github.com/Nikutsuki/swiss/services/internal/authn => ../internal/authn

replace github.com/Nikutsuki/swiss/services/internal/database => ../internal/database

replace github.com/Nikutsuki/swiss/services/internal/jwtutil => ../internal/jwtutil
