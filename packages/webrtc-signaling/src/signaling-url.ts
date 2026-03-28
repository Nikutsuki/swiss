/**
 * Builds `GET /ws?peer_id=...` URL for the signaling service.
 * `baseUrl` should be the WebSocket path only, e.g. `wss://signaling.example/ws` (no query).
 */
export function buildSignalingWebSocketUrl(baseUrl: string, peerId: string): string {
  const u = new URL(baseUrl);
  u.searchParams.set("peer_id", peerId);
  return u.toString();
}
