/**
 * STUN-only ICE servers. Expect ~20–30% connection failure for peers behind symmetric NAT
 * or restrictive firewalls; no TURN relay is configured here.
 */
export const DEFAULT_STUN_ONLY_RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};
