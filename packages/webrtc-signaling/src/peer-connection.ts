import { DEFAULT_STUN_ONLY_RTC_CONFIG } from "./config";

export function createPeerConnection(
  config: RTCConfiguration = DEFAULT_STUN_ONLY_RTC_CONFIG,
): RTCPeerConnection {
  return new RTCPeerConnection(config);
}
