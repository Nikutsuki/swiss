# Quickstart: P2P Watch Together Streaming

## Prerequisites
- Node.js (v24+)
- pnpm
- Golang (1.23+)

## Local Setup

1. **Start the Signaling Backend**:
   ```bash
   cd services/monolith-stream-api
   go mod tidy
   go run main.go
   ```
   *The server runs on port 8080 by default.*

2. **Start the Frontend**:
   ```bash
   pnpm install
   pnpm --filter monolith-stream dev
   ```
   *The application will be available at http://localhost:3000.*

## Testing WebRTC
To test peer-to-peer connectivity locally, open two separate browser windows (or incognito) to http://localhost:3000. Create a lobby in one window and join it from the other using the generated link.