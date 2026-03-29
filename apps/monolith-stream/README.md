# Monolith Stream

P2P screen sharing with multiparty signaling, optional concurrent publishers, and a session chat sidebar. Pages require SSO (`sso_token` JWT from the auth portal), same as monolith-drop.

## Setup

From the repository root, copy env values (see root `.env.example`):

- `JWT_SECRET`, `NEXT_PUBLIC_AUTH_URL` — must match `auth-api` / auth portal (middleware verifies `sso_token`).
- `NEXT_PUBLIC_MONOLITH_STREAM_WS_URL` — e.g. `wss://localhost:8084/v1/stream/ws` when using HTTPS dev.
- `MONOLITH_STREAM_TLS_CERT_FILE` / `MONOLITH_STREAM_TLS_KEY_FILE` — for `wss://` on the API when the Next app is HTTPS.
- `MONOLITH_STREAM_CORS_ORIGINS` — exact origins allowed for signaling + chat WebSockets.
- `MONOLITH_STREAM_MAX_PEERS_PER_SESSION` — room size cap (default 16).
- `MONOLITH_STREAM_CHAT_HMAC_SECRET` — optional; chat token HMAC defaults to `JWT_SECRET` if unset.
- **API process** also needs `JWT_SECRET` so chat WebSocket tokens can be verified.

Optional TURN/STUN: `NEXT_PUBLIC_WEBRTC_ICE_SERVERS`.

## Run

```bash
task monolith-stream-api:dev
cd apps/monolith-stream && pnpm dev
```

## Use

1. Sign in via the auth portal if redirected.
2. Open a session (home → random room or shared link `/[sessionId]`).
3. **Share screen** to publish; others see tiles under **Remote streams**. Multiple people can share; quality depends on group size.
4. **Chat** on the right uses a separate WebSocket (`/v1/stream/chat/ws`) after a short-lived token from `POST /api/mstream/chat-token`.

## Project layout

- `proxy.ts` — auth gate for pages.
- `app/api/me/route.ts` — JSON `{ sub, email }` from cookie.
- `app/api/mstream/chat-token/route.ts` — HMAC token for Go chat WS.
- `src/hooks/use-webrtc-stream.ts` — roster, per-remote publisher/subscriber PCs, H.264 preference, audio recv.
- `src/hooks/use-stream-chat.ts` — chat WebSocket client.
- `components/webrtc/` — video grid, QR, chat panel.
