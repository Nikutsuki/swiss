"use client";

import {
  DEFAULT_STUN_ONLY_RTC_CONFIG,
  buildSignalingWebSocketUrl,
  createPeerConnection,
  mergeRtcConfig,
  parseIceServersFromJson,
} from "@swiss/webrtc-signaling";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type WebRTCStreamStatus =
  | "idle"
  | "signaling_connecting"
  | "waiting_peer"
  | "negotiating"
  | "connected"
  | "failed";

function parseEnvelope(raw: string): {
  type: string;
  target: string;
  sender: string;
  payload: unknown;
} | null {
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof v.type !== "string" ||
      typeof v.target !== "string" ||
      typeof v.sender !== "string"
    ) {
      return null;
    }
    return {
      type: v.type,
      target: v.target,
      sender: v.sender,
      payload: v.payload,
    };
  } catch {
    return null;
  }
}

function signalingSend(
  ws: WebSocket,
  msg: { type: string; target: string; sender: string; payload: unknown },
) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(msg));
}

function isSessionDescriptionInit(v: unknown): v is RTCSessionDescriptionInit {
  if (v === null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.sdp === "string" && typeof o.type === "string";
}

/** SDP + per-leg id so ICE/candidates route to the correct PC when both peers publish. */
function parseMediaSessionPayload(v: unknown): {
  sdp: RTCSessionDescriptionInit;
  connId: string;
} | null {
  if (v === null || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.sdp !== "string" || typeof o.type !== "string") return null;
  const connIdRaw = o.connId;
  if (typeof connIdRaw !== "string" || !connIdRaw.trim()) return null;
  return {
    sdp: { sdp: o.sdp, type: o.type as RTCSdpType },
    connId: connIdRaw.trim(),
  };
}

function parseAnswerPayload(v: unknown): RTCSessionDescriptionInit | null {
  const m = parseMediaSessionPayload(v);
  if (m) return m.sdp;
  if (isSessionDescriptionInit(v)) return v;
  return null;
}

function parseCandidateEnvelope(v: unknown): {
  connId: string | null;
  candidate: RTCIceCandidateInit | null;
} {
  if (v === null) return { connId: null, candidate: null };
  if (typeof v === "object" && v !== null && "connId" in v) {
    const o = v as Record<string, unknown>;
    const connId =
      typeof o.connId === "string" && o.connId.trim() !== ""
        ? o.connId.trim()
        : null;
    const cand = o.candidate;
    if (
      cand === null ||
      cand === undefined ||
      (typeof cand === "object" &&
        cand !== null &&
        Object.keys(cand as object).length === 0)
    ) {
      return { connId, candidate: null };
    }
    return { connId, candidate: cand as RTCIceCandidateInit };
  }
  if (typeof v === "object" && v !== null) {
    return { connId: null, candidate: v as RTCIceCandidateInit };
  }
  return { connId: null, candidate: null };
}

function unregisterConnIdsForPc(
  connIdToPC: Map<string, RTCPeerConnection>,
  iceQueues: Map<string, RTCIceCandidateInit[]>,
  pc: RTCPeerConnection,
) {
  for (const [cid, p] of connIdToPC) {
    if (p === pc) {
      connIdToPC.delete(cid);
      iceQueues.delete(cid);
    }
  }
}

function prioritizeH264Video(pc: RTCPeerConnection): void {
  const caps =
    typeof RTCRtpReceiver !== "undefined" && RTCRtpReceiver.getCapabilities
      ? RTCRtpReceiver.getCapabilities("video")
      : null;
  if (!caps?.codecs?.length) return;
  const h264 = caps.codecs.filter(
    (c) => c.mimeType.toLowerCase() === "video/h264",
  );
  const rest = caps.codecs.filter(
    (c) => c.mimeType.toLowerCase() !== "video/h264",
  );
  const ordered = [...h264, ...rest];
  for (const t of pc.getTransceivers()) {
    const kind = t.sender?.track?.kind ?? t.receiver?.track?.kind;
    if (kind !== "video") continue;
    try {
      t.setCodecPreferences(ordered);
    } catch (e) {
      console.warn("[webrtc-stream] setCodecPreferences", e);
    }
  }
}

async function logVideoCodecTelemetry(
  pc: RTCPeerConnection,
  onCodecTelemetry?: (info: { mimeType: string } | null) => void,
): Promise<void> {
  try {
    const report = await pc.getStats();
    let found: string | null = null;
    report.forEach((s) => {
      if (s.kind !== "video") return;
      if (s.type !== "outbound-rtp" && s.type !== "inbound-rtp") return;
      const rid = (s as { codecId?: string }).codecId;
      if (!rid) return;
      const c = report.get(rid);
      if (c?.type === "codec" && "mimeType" in c) {
        found = String((c as { mimeType?: string }).mimeType ?? "");
      }
    });
    if (found) {
      console.info("[webrtc-stream] active video codec", found);
      onCodecTelemetry?.({ mimeType: found });
    }
  } catch {
    onCodecTelemetry?.(null);
  }
}

export type UseWebRTCStreamOptions = {
  sessionId: string;
  signalingWsBase: string;
  preferH264?: boolean;
  onCodecTelemetry?: (info: { mimeType: string } | null) => void;
};

export function useWebRTCStream(options: UseWebRTCStreamOptions) {
  const { sessionId, signalingWsBase, preferH264 = true, onCodecTelemetry } =
    options;

  const [peerId, setPeerId] = useState("");
  useEffect(() => {
    queueMicrotask(() => {
      setPeerId(crypto.randomUUID());
    });
  }, []);

  const [roster, setRoster] = useState<string[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<
    Record<string, MediaStream>
  >({});
  const [status, setStatus] = useState<WebRTCStreamStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [signalingReady, setSignalingReady] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  /** Latest signaling handler; attached on the socket immediately to avoid missing server `peer-joined` bursts. */
  const signalingMessageHandlerRef = useRef<(ev: MessageEvent) => void>(
    () => {},
  );
  const publisherPCsRef = useRef(new Map<string, RTCPeerConnection>());
  const subscriberPCsRef = useRef(new Map<string, RTCPeerConnection>());
  /** Maps negotiation leg id → PC (publisher and subscriber legs each have their own id). */
  const connIdToPCRef = useRef(new Map<string, RTCPeerConnection>());
  const subscriberConnIdByPeerRef = useRef(new Map<string, string>());
  const publisherConnIdByPeerRef = useRef(new Map<string, string>());
  const iceQueuesRef = useRef(new Map<string, RTCIceCandidateInit[]>());
  const hadLocalStreamForNotifyRef = useRef(false);
  const telemetryTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const telemetryPCRef = useRef<RTCPeerConnection | null>(null);

  const rtcConfig = useMemo(() => {
    const extra = parseIceServersFromJson(
      typeof process !== "undefined"
        ? process.env.NEXT_PUBLIC_WEBRTC_ICE_SERVERS
        : undefined,
    );
    return mergeRtcConfig(DEFAULT_STUN_ONLY_RTC_CONFIG, extra);
  }, []);

  const validationError = useMemo(() => {
    if (!signalingWsBase?.trim()) {
      return "Set NEXT_PUBLIC_MONOLITH_STREAM_WS_URL (e.g. ws://127.0.0.1:8084/v1/stream/ws).";
    }
    if (!sessionId?.trim()) {
      return "Missing session id.";
    }
    return null;
  }, [signalingWsBase, sessionId]);

  const setFailed = useCallback((msg: string) => {
    setError(msg);
    setStatus("failed");
  }, []);

  const stopTelemetry = useCallback(() => {
    if (telemetryTimerRef.current) {
      clearInterval(telemetryTimerRef.current);
      telemetryTimerRef.current = null;
    }
    telemetryPCRef.current = null;
  }, []);

  const iceKeyForPair = useCallback((local: string, remote: string) => {
    return `${local}<->${remote}`;
  }, []);

  const getOrCreateIceQueue = useCallback((key: string) => {
    let q = iceQueuesRef.current.get(key);
    if (!q) {
      q = [];
      iceQueuesRef.current.set(key, q);
    }
    return q;
  }, []);

  const flushIce = useCallback(async (pc: RTCPeerConnection, key: string) => {
    const q = getOrCreateIceQueue(key);
    const copy = [...q];
    q.length = 0;
    for (const c of copy) {
      if (c != null && typeof c === "object" && Object.keys(c).length > 0) {
        try {
          await pc.addIceCandidate(c);
        } catch (e) {
          console.warn("[webrtc-stream] addIceCandidate", e);
        }
      }
    }
  }, [getOrCreateIceQueue]);

  const queueOrAddIce = useCallback(
    async (pc: RTCPeerConnection, key: string, init: RTCIceCandidateInit | null) => {
      if (init == null) {
        if (pc.remoteDescription) {
          try {
            await pc.addIceCandidate();
          } catch (e) {
            console.warn("[webrtc-stream] addIceCandidate (end)", e);
          }
        }
        return;
      }
      if (typeof init !== "object" || Object.keys(init).length === 0) {
        return;
      }
      if (!pc.remoteDescription) {
        getOrCreateIceQueue(key).push(init);
        return;
      }
      try {
        await pc.addIceCandidate(init);
      } catch (e) {
        console.warn("[webrtc-stream] addIceCandidate", e);
      }
    },
    [getOrCreateIceQueue],
  );

  const cleanupSubscriberFor = useCallback((remotePublisherId: string) => {
    const sub = subscriberPCsRef.current.get(remotePublisherId);
    if (sub) {
      unregisterConnIdsForPc(
        connIdToPCRef.current,
        iceQueuesRef.current,
        sub,
      );
      try {
        sub.onicecandidate = null;
        sub.ontrack = null;
        sub.onconnectionstatechange = null;
        sub.close();
      } catch {
        /* ignore */
      }
      subscriberPCsRef.current.delete(remotePublisherId);
    }
    subscriberConnIdByPeerRef.current.delete(remotePublisherId);

    setRemoteStreams((prev) => {
      if (!prev[remotePublisherId]) return prev;
      const next = { ...prev };
      delete next[remotePublisherId];
      return next;
    });
  }, []);

  const cleanupPeerMedia = useCallback(
    (remoteId: string) => {
      const ik = iceKeyForPair(peerId, remoteId);
      iceQueuesRef.current.delete(ik);

      const pub = publisherPCsRef.current.get(remoteId);
      if (pub) {
        unregisterConnIdsForPc(
          connIdToPCRef.current,
          iceQueuesRef.current,
          pub,
        );
        try {
          pub.onicecandidate = null;
          pub.ontrack = null;
          pub.onconnectionstatechange = null;
          pub.close();
        } catch {
          /* ignore */
        }
        publisherPCsRef.current.delete(remoteId);
        publisherConnIdByPeerRef.current.delete(remoteId);
      }

      const sub = subscriberPCsRef.current.get(remoteId);
      if (sub) {
        unregisterConnIdsForPc(
          connIdToPCRef.current,
          iceQueuesRef.current,
          sub,
        );
        try {
          sub.onicecandidate = null;
          sub.ontrack = null;
          sub.onconnectionstatechange = null;
          sub.close();
        } catch {
          /* ignore */
        }
        subscriberPCsRef.current.delete(remoteId);
      }
      subscriberConnIdByPeerRef.current.delete(remoteId);

      setRemoteStreams((prev) => {
        if (!prev[remoteId]) return prev;
        const next = { ...prev };
        delete next[remoteId];
        return next;
      });
    },
    [peerId, iceKeyForPair],
  );

  const addToRoster = useCallback((id: string) => {
    if (!id || id === peerId) return;
    setRoster((r) => (r.includes(id) ? r : [...r, id]));
  }, [peerId]);

  const removeFromRoster = useCallback((id: string) => {
    setRoster((r) => r.filter((x) => x !== id));
  }, []);

  const startScreenShare = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      stream.getVideoTracks().forEach((t) => {
        t.onended = () => {
          setLocalStream(null);
        };
      });
      stream.getAudioTracks().forEach((t) => {
        t.onended = () => {
          /* video track end clears; audio optional */
        };
      });
      setLocalStream(stream);
    } catch (e) {
      if (e instanceof DOMException && e.name === "NotAllowedError") {
        setError(
          "Screen share was cancelled or permission was denied. Allow capture to stream.",
        );
        return;
      }
      setError(
        e instanceof Error ? e.message : "Could not start screen capture.",
      );
    }
  }, []);

  const stopScreenShare = useCallback(() => {
    setLocalStream((cur) => {
      cur?.getTracks().forEach((t) => t.stop());
      return null;
    });
  }, []);

  const signalingSendOpen = useCallback(
    (msg: {
      type: string;
      target: string;
      sender: string;
      payload: unknown;
    }) => {
      const w = wsRef.current;
      if (!w) return;
      signalingSend(w, msg);
    },
    [],
  );

  const onSignalingMessage = useCallback(
    (ev: MessageEvent) => {
      const iceK = (remoteId: string) => iceKeyForPair(peerId, remoteId);

      const env = parseEnvelope(String(ev.data));
      if (!env) return;

      if (env.type === "error" && env.sender === "signaling") {
        const payload = env.payload as { message?: string } | null;
        setFailed(payload?.message ?? "Signaling error");
        return;
      }

      if (env.type === "peer-joined" && env.sender === "signaling") {
        const payload = env.payload as { peerId?: string } | null;
        const rid = payload?.peerId?.trim();
        if (rid) addToRoster(rid);
        return;
      }

      if (env.type === "peer-left" && env.sender === "signaling") {
        const payload = env.payload as { peerId?: string } | null;
        const rid = payload?.peerId?.trim();
        if (rid) {
          removeFromRoster(rid);
          cleanupPeerMedia(rid);
        }
        return;
      }

      const sender = env.sender;
      if (sender === peerId || sender === "signaling") return;

      if (env.type === "stream-end") {
        cleanupSubscriberFor(sender);
        return;
      }

      if (env.type === "candidate") {
        const { connId, candidate } = parseCandidateEnvelope(env.payload);
        let pc: RTCPeerConnection | null = null;
        let iceKey: string;
        if (connId && connIdToPCRef.current.has(connId)) {
          pc = connIdToPCRef.current.get(connId) ?? null;
          iceKey = connId;
        } else {
          const pub = publisherPCsRef.current.get(sender);
          const sub = subscriberPCsRef.current.get(sender);
          pc = pub ?? sub ?? null;
          iceKey = iceK(sender);
        }
        if (pc) void queueOrAddIce(pc, iceKey, candidate);
        return;
      }

      if (env.type === "offer") {
        const parsed = parseMediaSessionPayload(env.payload);
        if (!parsed) return;
        const { sdp: offerInit, connId } = parsed;
        void (async () => {
          try {
            setStatus("negotiating");
            let pc = subscriberPCsRef.current.get(sender);
            const prevConn = subscriberConnIdByPeerRef.current.get(sender);
            if (pc && prevConn && prevConn !== connId) {
              cleanupSubscriberFor(sender);
              pc = undefined;
            }
            if (!pc) {
              pc = createPeerConnection(rtcConfig);
              subscriberPCsRef.current.set(sender, pc);
              connIdToPCRef.current.set(connId, pc);
              subscriberConnIdByPeerRef.current.set(sender, connId);
              pc.addTransceiver("video", { direction: "recvonly" });
              pc.addTransceiver("audio", { direction: "recvonly" });
              if (preferH264) prioritizeH264Video(pc);

              pc.ontrack = (ev) => {
                const ms = ev.streams[0];
                if (!ms) return;
                const track = ev.track;
                track.onended = () => {
                  if (ms.getTracks().some((x) => x.readyState === "live")) {
                    return;
                  }
                  cleanupSubscriberFor(sender);
                };
                setRemoteStreams((prev) => ({
                  ...prev,
                  [sender]: ms,
                }));
              };
              pc.onconnectionstatechange = () => {
                if (pc && pc.connectionState === "failed") {
                  setFailed(
                    "Peer connection failed. Try again or check your network.",
                  );
                }
              };
              pc.onicecandidate = (ev) => {
                const c = ev.candidate;
                signalingSendOpen({
                  type: "candidate",
                  target: sender,
                  sender: peerId,
                  payload: { connId, candidate: c ? c.toJSON() : null },
                });
              };
            }

            if (preferH264) prioritizeH264Video(pc);
            await pc.setRemoteDescription(new RTCSessionDescription(offerInit));
            await flushIce(pc, connId);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            signalingSendOpen({
              type: "answer",
              target: sender,
              sender: peerId,
              payload: {
                type: pc.localDescription?.type,
                sdp: pc.localDescription?.sdp,
                connId,
              },
            });
            setStatus("connected");
          } catch (e) {
            setFailed(
              e instanceof Error ? e.message : "Could not handle remote offer.",
            );
          }
        })();
        return;
      }

      if (env.type === "answer") {
        const answerInit = parseAnswerPayload(env.payload);
        if (!answerInit) return;
        const pc = publisherPCsRef.current.get(sender);
        if (!pc) return;
        const pubConnId =
          publisherConnIdByPeerRef.current.get(sender) ?? iceK(sender);
        void (async () => {
          try {
            await pc.setRemoteDescription(
              new RTCSessionDescription(answerInit),
            );
            await flushIce(pc, pubConnId);
            setStatus("connected");
          } catch (e) {
            setFailed(
              e instanceof Error ? e.message : "Could not complete connection.",
            );
          }
        })();
      }
    },
    [
      peerId,
      preferH264,
      rtcConfig,
      flushIce,
      queueOrAddIce,
      setFailed,
      addToRoster,
      removeFromRoster,
      cleanupPeerMedia,
      cleanupSubscriberFor,
      iceKeyForPair,
      signalingSendOpen,
    ],
  );

  useEffect(() => {
    signalingMessageHandlerRef.current = onSignalingMessage;
  }, [onSignalingMessage]);

  useEffect(() => {
    if (validationError || !peerId) return;

    let cancelled = false;
    startTransition(() => {
      setError(null);
      setStatus("signaling_connecting");
      setSignalingReady(false);
    });

    const u = new URL(
      buildSignalingWebSocketUrl(signalingWsBase.trim(), peerId),
    );
    u.searchParams.set("session_id", sessionId.trim());
    const ws = new WebSocket(u.toString());
    wsRef.current = ws;

    ws.onmessage = (ev) => {
      signalingMessageHandlerRef.current(ev);
    };

    ws.onopen = () => {
      if (!cancelled) {
        setSignalingReady(true);
        setStatus("waiting_peer");
      }
    };

    ws.onerror = () => {
      if (!cancelled) {
        setFailed("Signaling connection failed. Check the server and URL.");
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      if (!cancelled) {
        setSignalingReady(false);
        setStatus("idle");
      }
    };

    return () => {
      cancelled = true;
      stopTelemetry();
      setSignalingReady(false);
      ws.onopen = null;
      ws.onerror = null;
      ws.onclose = null;
      ws.onmessage = null;
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      wsRef.current = null;

      const pubs = [...publisherPCsRef.current.values()];
      for (const pc of pubs) {
        try {
          pc.close();
        } catch {
          /* ignore */
        }
      }
      publisherPCsRef.current.clear();
      const subs = [...subscriberPCsRef.current.values()];
      for (const pc of subs) {
        try {
          pc.close();
        } catch {
          /* ignore */
        }
      }
      subscriberPCsRef.current.clear();
      connIdToPCRef.current.clear();
      subscriberConnIdByPeerRef.current.clear();
      publisherConnIdByPeerRef.current.clear();
      iceQueuesRef.current.clear();
    };
  }, [validationError, signalingWsBase, sessionId, peerId, setFailed, stopTelemetry]);

  useEffect(() => {
    if (!signalingReady || !localStream) {
      publisherPCsRef.current.forEach((pc) => {
        unregisterConnIdsForPc(
          connIdToPCRef.current,
          iceQueuesRef.current,
          pc,
        );
        try {
          pc.close();
        } catch {
          /* ignore */
        }
      });
      publisherPCsRef.current.clear();
      publisherConnIdByPeerRef.current.clear();
      return;
    }

    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }

    for (const rid of roster) {
      if (rid === peerId) continue;
      if (publisherPCsRef.current.has(rid)) continue;

      const remoteId = rid;
      const connId = crypto.randomUUID();
      const pc = createPeerConnection(rtcConfig);
      publisherPCsRef.current.set(remoteId, pc);
      connIdToPCRef.current.set(connId, pc);
      publisherConnIdByPeerRef.current.set(remoteId, connId);

      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });
      if (preferH264) prioritizeH264Video(pc);

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") {
          setFailed(
            "Peer connection failed. Try again or check your network.",
          );
        }
      };
      pc.onicecandidate = (ev) => {
        const c = ev.candidate;
        signalingSend(ws, {
          type: "candidate",
          target: remoteId,
          sender: peerId,
          payload: { connId, candidate: c ? c.toJSON() : null },
        });
      };

      void (async () => {
        try {
          setStatus("negotiating");
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          signalingSend(ws, {
            type: "offer",
            target: remoteId,
            sender: peerId,
            payload: {
              type: pc.localDescription?.type,
              sdp: pc.localDescription?.sdp,
              connId,
            },
          });
        } catch (e) {
          setFailed(
            e instanceof Error ? e.message : "Could not start streaming.",
          );
        }
      })();
    }

  }, [
    signalingReady,
    localStream,
    roster,
    peerId,
    rtcConfig,
    preferH264,
    setFailed,
  ]);

  useEffect(() => {
    if (localStream) {
      hadLocalStreamForNotifyRef.current = true;
      return;
    }
    if (!hadLocalStreamForNotifyRef.current) return;
    hadLocalStreamForNotifyRef.current = false;

    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !peerId) return;
    for (const rid of roster) {
      if (rid === peerId) continue;
      signalingSend(ws, {
        type: "stream-end",
        target: rid,
        sender: peerId,
        payload: {},
      });
    }
  }, [localStream, roster, peerId]);

  useEffect(() => {
    const firstSub = subscriberPCsRef.current.values().next().value as
      | RTCPeerConnection
      | undefined;
    const firstPub = publisherPCsRef.current.values().next().value as
      | RTCPeerConnection
      | undefined;
    const pc = firstSub ?? firstPub ?? null;
    if (!pc || status !== "connected") {
      stopTelemetry();
      return;
    }
    telemetryPCRef.current = pc;
    void logVideoCodecTelemetry(pc, onCodecTelemetry);
    telemetryTimerRef.current = setInterval(() => {
      const p = telemetryPCRef.current;
      if (p) void logVideoCodecTelemetry(p, onCodecTelemetry);
    }, 12_000);
    return stopTelemetry;
  }, [status, remoteStreams, onCodecTelemetry, stopTelemetry]);

  return {
    peerId,
    roster,
    localStream,
    remoteStreams,
    status: validationError ? "failed" : status,
    error: validationError ?? error,
    startScreenShare,
    stopScreenShare,
    /** @deprecated use startScreenShare */
    startHostCapture: startScreenShare,
  };
}
