"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_STUN_ONLY_RTC_CONFIG } from "./config";
import { createPeerConnection } from "./peer-connection";
import { buildSignalingWebSocketUrl } from "./signaling-url";
import type { P2PRole, ServerErrorPayload, SignalingMessage } from "./types";

export type P2PSignalingStatus =
  | "idle"
  | "connecting"
  | "signaling_open"
  | "negotiating"
  | "connected"
  | "failed"
  | "closed";

export type UseP2PSignalingOptions = {
  /** Base WebSocket URL without query, e.g. `wss://host/ws` */
  signalingBaseUrl: string;
  peerId: string;
  remotePeerId: string;
  role: P2PRole;
  rtcConfig?: RTCConfiguration;
  channelLabel?: string;
  /** When false, closes WebSocket and peer connection */
  enabled?: boolean;
  onDataChannelMessage?: (ev: MessageEvent) => void;
};

function isSessionDescriptionInit(
  v: unknown,
): v is RTCSessionDescriptionInit {
  if (v === null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.sdp === "string" && typeof o.type === "string";
}

function signalingSend(ws: WebSocket, msg: SignalingMessage) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(msg));
}

function parseSignalingMessage(raw: string): SignalingMessage | null {
  try {
    const v = JSON.parse(raw) as unknown;
    if (
      v === null ||
      typeof v !== "object" ||
      typeof (v as SignalingMessage).type !== "string" ||
      typeof (v as SignalingMessage).target !== "string" ||
      typeof (v as SignalingMessage).sender !== "string" ||
      !("payload" in (v as object))
    ) {
      return null;
    }
    return v as SignalingMessage;
  } catch {
    return null;
  }
}

export function useP2PSignaling(options: UseP2PSignalingOptions) {
  const {
    signalingBaseUrl,
    peerId,
    remotePeerId,
    role,
    rtcConfig,
    channelLabel = "data",
    enabled = true,
    onDataChannelMessage,
  } = options;

  const [status, setStatus] = useState<P2PSignalingStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [dataChannel, setDataChannel] = useState<RTCDataChannel | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  const onMessageRef = useRef(onDataChannelMessage);
  onMessageRef.current = onDataChannelMessage;

  const rtcConfigRef = useRef(rtcConfig);
  rtcConfigRef.current = rtcConfig;

  const setFailed = useCallback((msg: string) => {
    setError(msg);
    setStatus("failed");
  }, []);

  useEffect(() => {
    if (!enabled) {
      setStatus("idle");
      setError(null);
      setDataChannel(null);
      return;
    }

    if (!signalingBaseUrl?.trim() || !peerId?.trim() || !remotePeerId?.trim()) {
      setFailed("signalingBaseUrl, peerId, and remotePeerId are required");
      return;
    }

    if (peerId === remotePeerId) {
      setFailed("peerId and remotePeerId must differ");
      return;
    }

    let cancelled = false;
    const iceQueue: RTCIceCandidateInit[] = [];

    setError(null);
    setDataChannel(null);
    setStatus("connecting");

    const cfg = rtcConfigRef.current ?? DEFAULT_STUN_ONLY_RTC_CONFIG;
    const wsUrl = buildSignalingWebSocketUrl(signalingBaseUrl.trim(), peerId.trim());
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    const flushIceCandidates = async (pc: RTCPeerConnection) => {
      while (iceQueue.length > 0) {
        const c = iceQueue.shift()!;
        if (c != null && typeof c === "object" && Object.keys(c).length > 0) {
          try {
            await pc.addIceCandidate(c);
          } catch (e) {
            console.warn("addIceCandidate", e);
          }
        }
      }
    };

    const queueOrAddCandidate = async (
      pc: RTCPeerConnection,
      init: RTCIceCandidateInit | null,
    ) => {
      if (init == null || typeof init !== "object" || Object.keys(init).length === 0) {
        return;
      }
      if (!pc.remoteDescription) {
        iceQueue.push(init);
        return;
      }
      try {
        await pc.addIceCandidate(init);
      } catch (e) {
        console.warn("addIceCandidate", e);
      }
    };

    const bindChannel = (dc: RTCDataChannel) => {
      dc.binaryType = "arraybuffer";
      dc.onmessage = (ev) => {
        onMessageRef.current?.(ev);
      };
      dc.onopen = () => {
        if (!cancelled) {
          setDataChannel(dc);
        }
      };
      dc.onclose = () => {
        if (!cancelled) {
          setStatus("closed");
          setDataChannel(null);
        }
      };
      dc.onerror = () => {
        if (!cancelled) {
          setFailed("data channel error");
        }
      };
    };

    const handleEnvelope = async (pc: RTCPeerConnection, env: SignalingMessage) => {
      if (env.type === "error") {
        const p = env.payload as ServerErrorPayload;
        if (!cancelled) {
          setFailed(p?.message ?? "signaling error");
        }
        return;
      }

      if (env.sender !== remotePeerId) {
        return;
      }

      if (env.type === "candidate") {
        const payload = env.payload;
        if (payload === null) {
          return;
        }
        await queueOrAddCandidate(pc, payload as RTCIceCandidateInit);
        return;
      }

      if (role === "caller" && env.type === "answer") {
        if (!isSessionDescriptionInit(env.payload)) {
          return;
        }
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(env.payload));
          await flushIceCandidates(pc);
          if (!cancelled) {
            setStatus("connected");
          }
        } catch (e) {
          if (!cancelled) {
            setFailed(
              e instanceof Error ? e.message : "setRemoteDescription failed",
            );
          }
        }
        return;
      }

      if (role === "callee" && env.type === "offer") {
        if (!isSessionDescriptionInit(env.payload)) {
          return;
        }
        try {
          if (!cancelled) {
            setStatus("negotiating");
          }
          await pc.setRemoteDescription(new RTCSessionDescription(env.payload));
          await flushIceCandidates(pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          signalingSend(ws, {
            type: "answer",
            target: remotePeerId,
            sender: peerId,
            payload: {
              type: pc.localDescription?.type,
              sdp: pc.localDescription?.sdp,
            },
          });
          if (!cancelled) {
            setStatus("connected");
          }
        } catch (e) {
          if (!cancelled) {
            setFailed(
              e instanceof Error ? e.message : "answer negotiation failed",
            );
          }
        }
      }
    };

    const wireIce = (pc: RTCPeerConnection) => {
      pc.onicecandidate = (ev) => {
        const c = ev.candidate;
        if (!c) {
          signalingSend(ws, {
            type: "candidate",
            target: remotePeerId,
            sender: peerId,
            payload: null,
          });
          return;
        }
        signalingSend(ws, {
          type: "candidate",
          target: remotePeerId,
          sender: peerId,
          payload: c.toJSON(),
        });
      };

      pc.onconnectionstatechange = () => {
        if (cancelled) return;
        const s = pc.connectionState;
        if (s === "failed") {
          setFailed("peer connection failed");
        }
        if (s === "closed") {
          setStatus("closed");
        }
      };
    };

    ws.onopen = () => {
      if (cancelled) return;
      setStatus("signaling_open");

      const pc = createPeerConnection(cfg);
      pcRef.current = pc;
      wireIce(pc);

      if (role === "caller") {
        const dc = pc.createDataChannel(channelLabel);
        bindChannel(dc);

        ws.onmessage = (ev) => {
          void (async () => {
            if (cancelled) return;
            const env = parseSignalingMessage(String(ev.data));
            const p = pcRef.current;
            if (!env || !p) {
              return;
            }
            await handleEnvelope(p, env);
          })();
        };

        void (async () => {
          if (cancelled) return;
          try {
            setStatus("negotiating");
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            signalingSend(ws, {
              type: "offer",
              target: remotePeerId,
              sender: peerId,
              payload: {
                type: pc.localDescription?.type,
                sdp: pc.localDescription?.sdp,
              },
            });
          } catch (e) {
            if (!cancelled) {
              setFailed(
                e instanceof Error ? e.message : "createOffer failed",
              );
            }
          }
        })();
      } else {
        pc.ondatachannel = (ev) => {
          if (cancelled) return;
          bindChannel(ev.channel);
        };

        ws.onmessage = (ev) => {
          void (async () => {
            if (cancelled) return;
            const env = parseSignalingMessage(String(ev.data));
            const p = pcRef.current;
            if (!env || !p) {
              return;
            }
            await handleEnvelope(p, env);
          })();
        };
      }
    };

    ws.onerror = () => {
      if (!cancelled) {
        setFailed("WebSocket error");
      }
    };

    return () => {
      cancelled = true;
      ws.onmessage = null;
      ws.onopen = null;
      ws.onerror = null;
      ws.onclose = null;
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      wsRef.current = null;

      const p = pcRef.current;
      pcRef.current = null;
      if (p) {
        try {
          p.onicecandidate = null;
          p.ondatachannel = null;
          p.onconnectionstatechange = null;
          p.close();
        } catch {
          /* ignore */
        }
      }
      iceQueue.length = 0;
    };
  }, [
    enabled,
    signalingBaseUrl,
    peerId,
    remotePeerId,
    role,
    channelLabel,
    setFailed,
  ]);

  return {
    status,
    error,
    dataChannel,
  };
}

/** Like `useP2PSignaling` but only negotiates once `remotePeerId` is non-empty. */
export function useP2PSignalingWhenReady(
  options: Omit<UseP2PSignalingOptions, "enabled" | "remotePeerId"> & {
    remotePeerId: string | null | undefined;
    enabled?: boolean;
  },
) {
  const { remotePeerId, enabled: enabledOpt, ...rest } = options;
  const ready = Boolean(remotePeerId?.trim());
  return useP2PSignaling({
    ...rest,
    remotePeerId: remotePeerId ?? "",
    enabled: enabledOpt !== false && ready,
  });
}
