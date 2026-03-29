# Quickstart: P2P WebRTC H.264 Optimization

## Prerequisites

- Node.js 20+ (pnpm)
- Go 1.22+
- Two browser instances (Chromium-based preferred)

## Running the Backend

```bash
cd services/monolith-stream-api
go run main.go
```

The signaling server will start on the address in `MONOLITH_STREAM_HTTP_ADDR` (default `localhost:8084`).

## Running the Frontend

```bash
cd apps/monolith-stream
pnpm dev
```

The frontend will start on port `3003` by default (see `package.json`; use `pnpm dev:http` for plain HTTP on the same port).

## Testing a Streaming Session

1.  **Host**: Open the app (e.g. `https://localhost:3003` with the default dev script, or your configured URL), ensure `NEXT_PUBLIC_MONOLITH_STREAM_WS_URL` points at `ws://…/v1/stream/ws`, and click **Start stream**.
2.  **Capture**: Select the window or screen you want to share.
3.  **Invite**: Copy the join URL or show the QR code.
4.  **Guest**: Open the join URL in a second browser window.
5.  **Verify**: Confirm the video is visible and check `chrome://webrtc-internals` for H.264 usage.
