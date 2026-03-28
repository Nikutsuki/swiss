package models

// HealthResponse is a minimal JSON shape for future drop API health checks.
// Tygo emits apps/monolith-drop/src/types/backend.d.ts from this package.
type HealthResponse struct {
	OK bool `json:"ok"`
}
