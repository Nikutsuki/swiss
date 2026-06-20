package models

// HealthResponse is the JSON shape for monolith-stream-api health checks.
// Tygo emits apps/monolith-stream/src/types/backend.d.ts from this package.
type HealthResponse struct {
	OK bool `json:"ok"`
}
