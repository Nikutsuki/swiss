/**
 * Parse optional `NEXT_PUBLIC_WEBRTC_ICE_SERVERS` JSON for TURN/STUN.
 * Example env value: `[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:...","username":"u","credential":"p"}]`
 */
export function parseIceServersFromJson(raw: string | undefined): RTCIceServer[] | undefined {
  if (raw == null || !String(raw).trim()) {
    return undefined;
  }
  try {
    const v = JSON.parse(String(raw)) as unknown;
    if (!Array.isArray(v)) {
      return undefined;
    }
    return v as RTCIceServer[];
  } catch {
    return undefined;
  }
}

/**
 * Merge optional ICE servers with a base config (e.g. STUN defaults).
 */
export function mergeRtcConfig(
  base: RTCConfiguration,
  extraServers: RTCIceServer[] | undefined,
): RTCConfiguration {
  if (!extraServers?.length) {
    return base;
  }
  const merged = [...(base.iceServers ?? []), ...extraServers];
  return { ...base, iceServers: merged };
}
