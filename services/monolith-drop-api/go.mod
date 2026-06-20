module github.com/Nikutsuki/swiss/services/monolith-drop-api

go 1.26.1

replace github.com/Nikutsuki/swiss/services/internal/database => ../internal/database

require (
	github.com/Nikutsuki/swiss/services/internal/authn v0.0.0-00010101000000-000000000000
	github.com/Nikutsuki/swiss/services/internal/database v0.0.0-00010101000000-000000000000
	github.com/google/uuid v1.6.0
	github.com/jackc/pgx/v5 v5.9.1
	github.com/joho/godotenv v1.5.1
)

replace github.com/Nikutsuki/swiss/services/internal/authn => ../internal/authn

require (
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/puddle/v2 v2.2.2 // indirect
	golang.org/x/sync v0.20.0 // indirect
	golang.org/x/text v0.35.0 // indirect
)
