"use client";

import React, { createContext, useContext, useEffect, useRef, useState, ReactNode, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { create } from "zustand";
import type { StreamQuality } from "@/components/StreamControls";
import {
  detectCodecCapabilities,
  getBestEncodeHardwareAcceleration,
  normalizeCodecList,
  pickMutualCodec,
  VIDEO_CODEC_PRIORITY,
  type CodecCapabilities,
  type SupportedVideoCodec,
} from "@/lib/webcodecs/videoCodecNegotiation";

// --- Zustand Store for UI State ---
interface SyncEvent {
  action: "play" | "pause" | "seek";
  time: number;
  timestamp: number;
  receivedAtMs?: number;
}

type StreamMode = "none" | "screen" | "file";
type TransportMode = "webcodecs" | "webrtc";

export interface SubtitleTrack {
  id: string;
  label: string;
  language: string;
  content: string; // Raw WebVTT text
}

interface SyncRequest {
  action: "play" | "pause" | "seek";
  time: number;
  timestamp: number;
  requestedByPeerId: string;
}

interface ChatMessage {
  text: string;
  timestamp: number;
  senderId: string;
}

interface WebRTCState {
  peerId: string;
  lobbyId: string | null;
  isConnected: boolean;
  error: string | null;
  theaterMode: boolean;
  participants: string[];
  remoteStreams: Record<string, MediaStream>;
  // Stream mode (screen/file/none) keyed by peerId. Used to decide when to show controls.
  streamModesByPeer: Record<string, StreamMode>;
  // Latest sync event for each stream source peerId.
  syncEventsByPeer: Record<string, SyncEvent | undefined>;
  // Source file duration keyed by peerId (for remote scrubbing UI).
  durationsByPeer: Record<string, number | undefined>;
  // Latest sync request received by the local peer (only meaningful if local peer is the streamer).
  incomingSyncRequest: SyncRequest | null;
  chatMessages: ChatMessage[];
  subtitlesByPeer: Record<string, SubtitleTrack[]>;
  negotiatedVideoCodecByPeer: Record<string, SupportedVideoCodec | undefined>;
  activeVideoCodecByPeer: Record<string, SupportedVideoCodec | undefined>;
  // Wall-clock timestamp (ms) when we last received `codec_active` for a given sender peer.
  codecActiveTimestampByPeer: Record<string, number | undefined>;
  // Receiver-side routing for a *specific sender peer* (set via `transport_selected` message).
  inboundTransportModeByPeer: Record<string, TransportMode | undefined>;
  // Sender-side routing: which transport we should use for *outbound streaming* to each peer.
  outboundTransportModeByPeer: Record<string, TransportMode | undefined>;
  // Shared outbound WebCodecs encoder codec chosen for this local streamer.
  outboundWebcodecsVideoCodec: SupportedVideoCodec | null;
  setPeerId: (id: string) => void;
  setLobbyId: (id: string | null) => void;
  setIsConnected: (connected: boolean) => void;
  setError: (err: string | null) => void;
  addParticipant: (id: string) => void;
  removeParticipant: (id: string) => void;
  addRemoteStream: (id: string, stream: MediaStream) => void;
  removeRemoteStream: (id: string) => void;
  setStreamModeByPeer: (peerId: string, mode: StreamMode) => void;
  setSyncEventByPeer: (peerId: string, event: SyncEvent | undefined) => void;
  setDurationByPeer: (peerId: string, duration: number | undefined) => void;
  setIncomingSyncRequest: (req: SyncRequest | null) => void;
  addChatMessage: (msg: ChatMessage) => void;
  toggleTheaterMode: () => void;
  clearParticipants: () => void;
  addSubtitleTrack: (peerId: string, track: SubtitleTrack) => void;
  setSubtitleTracksForPeer: (peerId: string, tracks: SubtitleTrack[]) => void;
  setNegotiatedVideoCodecForPeer: (peerId: string, codec: SupportedVideoCodec) => void;
  setActiveVideoCodecForPeer: (peerId: string, codec: SupportedVideoCodec) => void;
  setCodecActiveTimestampForPeer: (peerId: string, ts: number) => void;
  setInboundTransportModeForPeer: (peerId: string, mode: TransportMode) => void;
  setOutboundTransportModeForPeer: (peerId: string, mode: TransportMode) => void;
  setOutboundWebcodecsVideoCodec: (codec: SupportedVideoCodec | null) => void;
}

export const useWebRTCStore = create<WebRTCState>((set) => ({
  peerId: "",
  lobbyId: null,
  isConnected: false,
  error: null,
  theaterMode: false,
  participants: [],
  remoteStreams: {},
  streamModesByPeer: {},
  syncEventsByPeer: {},
  durationsByPeer: {},
  incomingSyncRequest: null,
  chatMessages: [],
  subtitlesByPeer: {},
  negotiatedVideoCodecByPeer: {},
  activeVideoCodecByPeer: {},
  codecActiveTimestampByPeer: {},
  inboundTransportModeByPeer: {},
  outboundTransportModeByPeer: {},
  outboundWebcodecsVideoCodec: null,
  setPeerId: (id) => set({ peerId: id }),
  setLobbyId: (id) => set({ lobbyId: id }),
  setIsConnected: (connected) => set({ isConnected: connected }),
  setError: (error) => set({ error }),
  addParticipant: (id) => set((state) => ({
    participants: state.participants.includes(id) ? state.participants : [...state.participants, id]
  })),
  removeParticipant: (id) => set((state) => {
    const { [id]: _, ...rest } = state.remoteStreams;
    const { [id]: _streamMode, ...restStreamModesByPeer } = state.streamModesByPeer;
    const { [id]: _syncEvent, ...restSyncEventsByPeer } = state.syncEventsByPeer;
    const { [id]: _duration, ...restDurationsByPeer } = state.durationsByPeer;
    const { [id]: _subtitles, ...restSubtitlesByPeer } = state.subtitlesByPeer;
    const { [id]: _negotiatedCodec, ...restNegotiatedVideoCodecByPeer } = state.negotiatedVideoCodecByPeer;
    const { [id]: _activeCodec, ...restActiveVideoCodecByPeer } = state.activeVideoCodecByPeer;
    const { [id]: _inboundTransport, ...restInboundTransportModeByPeer } = state.inboundTransportModeByPeer;
    const { [id]: _outboundTransport, ...restOutboundTransportModeByPeer } = state.outboundTransportModeByPeer;
    return {
      participants: state.participants.filter((p) => p !== id),
      remoteStreams: rest,
      streamModesByPeer: restStreamModesByPeer,
      syncEventsByPeer: restSyncEventsByPeer,
      durationsByPeer: restDurationsByPeer,
      subtitlesByPeer: restSubtitlesByPeer,
      negotiatedVideoCodecByPeer: restNegotiatedVideoCodecByPeer,
      activeVideoCodecByPeer: restActiveVideoCodecByPeer,
      inboundTransportModeByPeer: restInboundTransportModeByPeer,
      outboundTransportModeByPeer: restOutboundTransportModeByPeer,
    };
  }),
  addRemoteStream: (id, stream) => set((state) => ({
    remoteStreams: { ...state.remoteStreams, [id]: stream }
  })),
  removeRemoteStream: (id) => set((state) => {
    const { [id]: _, ...rest } = state.remoteStreams;
    return { remoteStreams: rest };
  }),
  setStreamModeByPeer: (peerId, mode) =>
    set((state) => {
      const nextStreamModesByPeer = { ...state.streamModesByPeer, [peerId]: mode };
      if (mode !== "none") {
        return { streamModesByPeer: nextStreamModesByPeer };
      }

      // Reset per-peer file timeline when streaming stops to avoid stale resume positions
      // the next time this peer starts a new file stream.
      const { [peerId]: _sync, ...nextSyncEventsByPeer } = state.syncEventsByPeer;
      const { [peerId]: _duration, ...nextDurationsByPeer } = state.durationsByPeer;

      return {
        streamModesByPeer: nextStreamModesByPeer,
        syncEventsByPeer: nextSyncEventsByPeer,
        durationsByPeer: nextDurationsByPeer,
      };
    }),
  setSyncEventByPeer: (peerId, event) =>
    set((state) => ({ syncEventsByPeer: { ...state.syncEventsByPeer, [peerId]: event } })),
  setDurationByPeer: (peerId, duration) =>
    set((state) => ({ durationsByPeer: { ...state.durationsByPeer, [peerId]: duration } })),
  setIncomingSyncRequest: (req) => set({ incomingSyncRequest: req }),
  addChatMessage: (msg) => set((state) => ({ chatMessages: [...state.chatMessages, msg] })),
  toggleTheaterMode: () => set((state) => ({ theaterMode: !state.theaterMode })),
  clearParticipants: () =>
    set({
      participants: [],
      remoteStreams: {},
      chatMessages: [],
      streamModesByPeer: {},
      syncEventsByPeer: {},
      durationsByPeer: {},
      incomingSyncRequest: null,
      theaterMode: false,
      subtitlesByPeer: {},
      negotiatedVideoCodecByPeer: {},
      activeVideoCodecByPeer: {},
      codecActiveTimestampByPeer: {},
      inboundTransportModeByPeer: {},
      outboundTransportModeByPeer: {},
      outboundWebcodecsVideoCodec: null,
    }),
  addSubtitleTrack: (peerId, track) =>
    set((state) => ({
      // Deduplicate by subtitle id to avoid reconnect/datachannel replay duplicates.
      subtitlesByPeer: {
        ...state.subtitlesByPeer,
        [peerId]: [...(state.subtitlesByPeer[peerId] || []).filter((existing) => existing.id !== track.id), track],
      },
    })),
  setSubtitleTracksForPeer: (peerId, tracks) =>
    set((state) => ({
      subtitlesByPeer: {
        ...state.subtitlesByPeer,
        [peerId]: tracks,
      },
    })),
  setNegotiatedVideoCodecForPeer: (peerId, codec) =>
    set((state) => ({
      negotiatedVideoCodecByPeer: {
        ...state.negotiatedVideoCodecByPeer,
        [peerId]: codec,
      },
    })),
  setActiveVideoCodecForPeer: (peerId, codec) =>
    set((state) => ({
      activeVideoCodecByPeer: {
        ...state.activeVideoCodecByPeer,
        [peerId]: codec,
      },
    })),
  setCodecActiveTimestampForPeer: (peerId, ts) =>
    set((state) => ({
      codecActiveTimestampByPeer: {
        ...state.codecActiveTimestampByPeer,
        [peerId]: ts,
      },
    })),
  setInboundTransportModeForPeer: (peerId, mode) =>
    set((state) => ({
      inboundTransportModeByPeer: {
        ...state.inboundTransportModeByPeer,
        [peerId]: mode,
      },
    })),
  setOutboundTransportModeForPeer: (peerId, mode) =>
    set((state) => ({
      outboundTransportModeByPeer: {
        ...state.outboundTransportModeByPeer,
        [peerId]: mode,
      },
    })),
  setOutboundWebcodecsVideoCodec: (codec) =>
    set({
      outboundWebcodecsVideoCodec: codec,
    }),
}));

// --- Context for WebRTC actions ---
interface WebRTCContextValue {
  joinLobby: (lobbyId: string) => void;
  leaveLobby: () => void;
  broadcastStream: (
    stream: MediaStream | null,
    mode: StreamMode,
    quality?: StreamQuality,
    targetPeerIds?: string[],
  ) => void;
  broadcastStreamMode: (mode: StreamMode) => void;
  broadcastSyncEvent: (action: "play" | "pause" | "seek", time: number) => void;
  broadcastDuration: (duration: number) => void;
  sendSyncRequest: (targetPeerId: string, action: "play" | "pause" | "seek", time: number) => void;
  broadcastChatMessage: (text: string) => void;
  broadcastSubtitle: (label: string, language: string, content: string) => void;
  sendBinaryToPeers: (data: Uint8Array, targetPeerIds?: string[]) => void;
  getDataChannelForPeer: (peerId: string) => RTCDataChannel | null;
  getNegotiatedVideoCodecForPeer: (peerId: string) => SupportedVideoCodec | null;
  broadcastActiveVideoCodec: (codec: SupportedVideoCodec) => void;
  getActiveVideoCodecForPeer: (peerId: string) => SupportedVideoCodec | null;
}

const WebRTCContext = createContext<WebRTCContextValue | null>(null);

const STUN_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
  ],
};

export const WebRTCProvider = ({ children }: { children: ReactNode }) => {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const providerMountedRef = useRef(true);
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const dataChannels = useRef<Map<string, RTCDataChannel>>(new Map());
  const localCodecCapabilitiesRef = useRef<CodecCapabilities | null>(null);
  const remoteCodecCapabilitiesRef = useRef<Map<string, CodecCapabilities>>(new Map());
  const sentCapabilitiesToPeerRef = useRef<Set<string>>(new Set());
  const localStreamRef = useRef<MediaStream | null>(null);
  const activeQualityRef = useRef<StreamQuality | null>(null);
  const makingOfferRef = useRef<Map<string, boolean>>(new Map());
  const store = useWebRTCStore();

  // Initialize peer ID
  useEffect(() => {
    store.setPeerId(uuidv4());
  }, []);

  const handleDataChannelMessage = (event: MessageEvent, senderId: string) => {
    if (typeof event.data !== "string") {
      // Binary payloads are handled by transport-specific consumers.
      return;
    }

    try {
      const msg = JSON.parse(event.data);
      if (msg.type === "sync") {
        useWebRTCStore.getState().setSyncEventByPeer(senderId, {
          ...(msg.payload as SyncEvent),
          receivedAtMs: Date.now(),
        });
      } else if (msg.type === "sync_request") {
        useWebRTCStore.getState().setIncomingSyncRequest({
          ...msg.payload,
          requestedByPeerId: senderId,
        });
      } else if (msg.type === "stream_mode") {
        const mode = msg.payload.mode as StreamMode;
        useWebRTCStore.getState().setStreamModeByPeer(senderId, mode);
        if (mode === "none") {
          // Explicitly clear stale MediaStream references so remote UI does not keep a frozen frame.
          useWebRTCStore.getState().removeRemoteStream(senderId);
        }
      } else if (msg.type === "duration") {
        useWebRTCStore.getState().setDurationByPeer(senderId, msg.payload.duration);
      } else if (msg.type === "chat") {
        useWebRTCStore.getState().addChatMessage({
          ...msg.payload,
          senderId,
        });
      } else if (msg.type === "subtitle") {
        useWebRTCStore.getState().addSubtitleTrack(senderId, msg.payload as SubtitleTrack);
      } else if (msg.type === "subtitle_pack") {
        const tracks = Array.isArray(msg.payload?.tracks)
          ? (msg.payload.tracks as SubtitleTrack[])
          : [];
        useWebRTCStore.getState().setSubtitleTracksForPeer(senderId, tracks);
      } else if (msg.type === "codec_capabilities") {
        remoteCodecCapabilitiesRef.current.set(senderId, {
          encode: normalizeCodecList(msg.payload?.encode),
          decode: normalizeCodecList(msg.payload?.decode),
        });
        console.info("[transport] remote codec_capabilities", {
          fromPeerId: senderId,
          encode: remoteCodecCapabilitiesRef.current.get(senderId)?.encode ?? [],
          decode: remoteCodecCapabilitiesRef.current.get(senderId)?.decode ?? [],
        });
        sendCodecCapabilitiesToPeer(senderId);
        maybeSelectCodecForPeer(senderId);
        void recomputeOutboundTransportAndCodec();
      } else if (msg.type === "codec_selected") {
        const [codec] = normalizeCodecList([msg.payload?.codec]);
        if (codec) {
          useWebRTCStore.getState().setNegotiatedVideoCodecForPeer(senderId, codec);
        }
      } else if (msg.type === "codec_active") {
        const [codec] = normalizeCodecList([msg.payload?.codec]);
        if (codec) {
          const now = Date.now();
          useWebRTCStore.getState().setActiveVideoCodecForPeer(senderId, codec);
          useWebRTCStore.getState().setCodecActiveTimestampForPeer(senderId, now);
          console.info("[transport] recv codec_active", { fromPeerId: senderId, codec, at: now });
        }
      } else if (msg.type === "transport_selected") {
        const mode = msg.payload?.mode as TransportMode | undefined;
        if (mode === "webcodecs" || mode === "webrtc") {
          useWebRTCStore.getState().setInboundTransportModeForPeer(senderId, mode);
          console.info("[transport] recv transport_selected", { fromPeerId: senderId, mode });
        }
      }
    } catch (err) {
      console.error("Failed to parse data channel message", err);
    }
  };

  const sendCurrentStateToPeer = useCallback((targetPeerId: string) => {
    const state = useWebRTCStore.getState();
    const myPeerId = state.peerId;
    const mode = state.streamModesByPeer[myPeerId] ?? "none";
    sendDataMessageToPeer(targetPeerId, { type: "stream_mode", payload: { mode } });

    const activeCodec = state.activeVideoCodecByPeer[myPeerId];
    if (activeCodec) {
      sendDataMessageToPeer(targetPeerId, {
        type: "codec_active",
        payload: { codec: activeCodec },
      });
    }

    const subtitleTracks = state.subtitlesByPeer[myPeerId] ?? [];
    if (subtitleTracks.length > 0) {
      sendDataMessageToPeer(targetPeerId, {
        type: "subtitle_pack",
        payload: { tracks: subtitleTracks },
      });
    }

    if (mode === "file") {
      const sync = state.syncEventsByPeer[myPeerId];
      const duration = state.durationsByPeer[myPeerId];
      if (sync) {
        const now = Date.now();
        // Late joiners used to receive the last *discrete* sync (play/pause/seek). For "play", that
        // froze media time at the last broadcast while the host kept playing — joiners stayed at 0:00
        // or another stale point. Extrapolate from the host's wall-clock to the live media position.
        let time = sync.time;
        let action: "play" | "pause" | "seek" = sync.action;
        if (sync.action === "play") {
          time = sync.time + Math.max(0, (now - sync.timestamp) / 1000);
          if (typeof duration === "number" && Number.isFinite(duration) && duration > 0) {
            time = Math.min(time, duration);
          }
        } else if (sync.action === "pause" || sync.action === "seek") {
          // Pause/seek snapshots are wall-stable; keep stored media time.
          action = sync.action;
        }
        sendDataMessageToPeer(targetPeerId, {
          type: "sync",
          payload: {
            action,
            time,
            timestamp: now,
          },
        });
      }
      if (typeof duration === "number" && Number.isFinite(duration)) {
        sendDataMessageToPeer(targetPeerId, { type: "duration", payload: { duration } });
      }
    }
  }, []);

  const broadcastDataMessage = (message: any) => {
    const data = JSON.stringify(message);
    dataChannels.current.forEach((dc) => {
      if (dc.readyState === "open") {
        dc.send(data);
      }
    });
  };

  const sendDataMessageToPeer = (targetPeerId: string, message: any) => {
    const dc = dataChannels.current.get(targetPeerId);
    if (!dc || dc.readyState !== "open") return;
    dc.send(JSON.stringify(message));
  };

  const sendBinaryToPeers = useCallback(
    (data: Uint8Array, targetPeerIds?: string[]) => {
      const binary = new Uint8Array(data);
      if (targetPeerIds && targetPeerIds.length > 0) {
        for (const peerId of targetPeerIds) {
          const dc = dataChannels.current.get(peerId);
          if (!dc || dc.readyState !== "open") continue;
          dc.send(binary as unknown as ArrayBufferView<ArrayBuffer>);
        }
        return;
      }

      dataChannels.current.forEach((dc) => {
        if (dc.readyState === "open") {
          dc.send(binary as unknown as ArrayBufferView<ArrayBuffer>);
        }
      });
    },
    [],
  );

  const getDataChannelForPeer = useCallback((peerId: string): RTCDataChannel | null => {
    return dataChannels.current.get(peerId) ?? null;
  }, []);

  const getNegotiatedVideoCodecForPeer = useCallback((peerId: string): SupportedVideoCodec | null => {
    return useWebRTCStore.getState().negotiatedVideoCodecByPeer[peerId] ?? null;
  }, []);

  const getActiveVideoCodecForPeer = useCallback((peerId: string): SupportedVideoCodec | null => {
    return useWebRTCStore.getState().activeVideoCodecByPeer[peerId] ?? null;
  }, []);

  const broadcastActiveVideoCodec = useCallback((codec: SupportedVideoCodec) => {
    const myPeerId = useWebRTCStore.getState().peerId;
    useWebRTCStore.getState().setActiveVideoCodecForPeer(myPeerId, codec);
    broadcastDataMessage({
      type: "codec_active",
      payload: { codec },
    });
  }, []);

  const maybeSelectCodecForPeer = useCallback((peerId: string) => {
    const local = localCodecCapabilitiesRef.current;
    const remote = remoteCodecCapabilitiesRef.current.get(peerId);
    if (!local || !remote) return;

    const selected = pickMutualCodec(local, remote);
    if (!selected) return;

    useWebRTCStore.getState().setNegotiatedVideoCodecForPeer(peerId, selected);
    sendDataMessageToPeer(peerId, {
      type: "codec_selected",
      payload: { codec: selected },
    });
  }, []);

  const sendCodecCapabilitiesToPeer = useCallback((peerId: string) => {
    const capabilities = localCodecCapabilitiesRef.current;
    if (!capabilities || sentCapabilitiesToPeerRef.current.has(peerId)) return;
    sentCapabilitiesToPeerRef.current.add(peerId);

    sendDataMessageToPeer(peerId, {
      type: "codec_capabilities",
      payload: {
        encode: capabilities.encode,
        decode: capabilities.decode,
      },
    });
  }, []);

  const sendTransportSelectedToPeer = useCallback(
    (peerId: string) => {
      const mode = useWebRTCStore.getState().outboundTransportModeByPeer[peerId] ?? "webrtc";
      sendDataMessageToPeer(peerId, {
        type: "transport_selected",
        payload: { mode },
      });
      console.info("[transport] send transport_selected", { toPeerId: peerId, mode });
    },
    [sendDataMessageToPeer],
  );

  const recomputeOutboundTransportAndCodec = useCallback(() => {
    const local = localCodecCapabilitiesRef.current;
    if (!local) return;

    // Prefer actual connected peer IDs (data-channel / known capabilities) instead of
    // `participants`, which can lag behind or be empty depending on signaling timing.
    const myPeerId = useWebRTCStore.getState().peerId;
    const peerIds = Array.from(
      new Set([
        ...Array.from(dataChannels.current.keys()),
        ...Array.from(remoteCodecCapabilitiesRef.current.keys()),
      ]),
    ).filter((id) => id !== myPeerId);

    let bestCodec: SupportedVideoCodec | null = null;
    let bestScore = -1;

    const baseOrder: SupportedVideoCodec[] = [...VIDEO_CODEC_PRIORITY];

    // WebCodecs encode policy:
    // - Only use WebCodecs if the streamer can do *hardware encoding* for the codec.
    // - If only software encoding exists, fall back to WebRTC for encoding.
    const effectivePriority: SupportedVideoCodec[] = baseOrder.filter((codec) => {
      const accel = getBestEncodeHardwareAcceleration(codec);
      return accel === "prefer-hardware";
    });

    // Compatibility-first: pick the highest-priority codec that maximizes
    // the number of peers that can decode it.
    for (const codec of effectivePriority) {
      if (!local.encode.includes(codec)) continue;

      let score = 0;
      for (const peerId of peerIds) {
        const remote = remoteCodecCapabilitiesRef.current.get(peerId);
        if (remote?.decode.includes(codec)) score += 1;
      }

      if (score > bestScore) {
        bestScore = score;
        bestCodec = codec;
      }
    }

    const nextSharedCodec = bestCodec && bestScore > 0 ? bestCodec : null;
    useWebRTCStore.getState().setOutboundWebcodecsVideoCodec(nextSharedCodec);

    console.info("[transport] recompute outbound WebCodecs", {
      localEncode: local.encode,
      localDecode: local.decode,
      peers: peerIds,
      bestCodec: nextSharedCodec,
      bestScore,
      remoteDecodeByPeer: peerIds.reduce<Record<string, SupportedVideoCodec[]>>((acc, peerId) => {
        const remote = remoteCodecCapabilitiesRef.current.get(peerId);
        acc[peerId] = remote?.decode ?? [];
        return acc;
      }, {}),
    });

    for (const peerId of peerIds) {
      const remote = remoteCodecCapabilitiesRef.current.get(peerId);
      const nextMode: TransportMode =
        nextSharedCodec && remote?.decode.includes(nextSharedCodec) ? "webcodecs" : "webrtc";

      const prevMode = useWebRTCStore.getState().outboundTransportModeByPeer[peerId];
      if (prevMode !== nextMode) {
        useWebRTCStore.getState().setOutboundTransportModeForPeer(peerId, nextMode);
        sendTransportSelectedToPeer(peerId);
      }
    }
  }, [sendTransportSelectedToPeer]);

  const enforceCodecPreferences = (pc: RTCPeerConnection) => {
    if (
      typeof RTCRtpReceiver === "undefined" ||
      typeof RTCRtpReceiver.getCapabilities !== "function"
    ) {
      return;
    }

    const capabilities = RTCRtpReceiver.getCapabilities("video");
    if (!capabilities || !capabilities.codecs) return;

    const av1 = capabilities.codecs.filter(
      (c) => c.mimeType.toLowerCase() === "video/av1",
    );
    const vp9 = capabilities.codecs.filter(
      (c) => c.mimeType.toLowerCase() === "video/vp9",
    );
    const h264 = capabilities.codecs.filter(
      (c) => c.mimeType.toLowerCase() === "video/h264",
    );

    const preferredCodecs = [...av1, ...vp9, ...h264, ...capabilities.codecs];

    const uniqueCodecs = preferredCodecs.filter(
      (codec, index, self) =>
        index ===
        self.findIndex(
          (c) =>
            c.mimeType === codec.mimeType && c.sdpFmtpLine === codec.sdpFmtpLine,
        ),
    );

    pc.getTransceivers().forEach((transceiver) => {
      const isVideo =
        transceiver.receiver.track?.kind === "video" ||
        transceiver.sender.track?.kind === "video";
      if (!isVideo) return;

      try {
        transceiver.setCodecPreferences(uniqueCodecs);
      } catch (err) {
        console.error("Failed to set codec preferences on transceiver", err);
      }
    });
  };

  const enforceSdpBitrate = (sdp: string, targetKbps: number) => {
    const kbps = Math.max(1, Math.floor(targetKbps));
    const tiasBps = kbps * 1000;

    const lines = sdp.split(/\r?\n/);
    let inVideo = false;
    const modifiedLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (line.startsWith("m=")) {
        inVideo = line.startsWith("m=video");
      }

      if (inVideo) {
        if (line.startsWith("b=AS:") || line.startsWith("b=TIAS:")) {
          continue;
        }
      }

      modifiedLines.push(line);

      if (inVideo && line.startsWith("c=")) {
        modifiedLines.push(`b=AS:${kbps}`);
        modifiedLines.push(`b=TIAS:${tiasBps}`);
      }
    }

    // SDP requires a trailing \r\n.
    return modifiedLines.join("\r\n") + "\r\n";
  };

  const createPeerConnection = (targetPeerId: string, polite: boolean) => {
    const pc = new RTCPeerConnection(STUN_SERVERS);
    peerConnections.current.set(targetPeerId, pc);

    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current) {
        wsRef.current.send(JSON.stringify({
          type: "ice_candidate",
          target_peer_id: targetPeerId,
          payload: { candidate: JSON.stringify(event.candidate) }
        }));
      }
    };

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        const stream = event.streams[0];
        useWebRTCStore.getState().addRemoteStream(targetPeerId, stream);

        // Some browsers keep the last painted frame even after sender track ends.
        // Remove stream on remote track end so UI clears immediately.
        stream.getTracks().forEach((track) => {
          track.addEventListener("ended", () => {
            useWebRTCStore.getState().removeRemoteStream(targetPeerId);
          });
        });
      }
    };

    pc.onnegotiationneeded = async () => {
      if (makingOfferRef.current.get(targetPeerId)) return;
      if (pc.signalingState !== "stable") return;

      try {
        makingOfferRef.current.set(targetPeerId, true);
        const offer = await pc.createOffer();
        if (pc.signalingState !== "stable") return;
        const targetKbps = (activeQualityRef.current?.bitrateMbps ?? 3) * 1000;
        if (offer.sdp) offer.sdp = enforceSdpBitrate(offer.sdp, targetKbps);
        await pc.setLocalDescription(offer);
        wsRef.current?.send(JSON.stringify({
          type: "offer",
          target_peer_id: targetPeerId,
          payload: { sdp: JSON.stringify(pc.localDescription) }
        }));
      } catch (err) {
        console.error("Error during negotiation", err);
      } finally {
        makingOfferRef.current.set(targetPeerId, false);
      }
    };

    // Setup Data Channel
    if (!polite) {
      const dc = pc.createDataChannel("watch-together-data");
      dc.binaryType = "arraybuffer";
      dc.onmessage = (e) => handleDataChannelMessage(e, targetPeerId);
      dataChannels.current.set(targetPeerId, dc);
      dc.onopen = () => {
        sendCurrentStateToPeer(targetPeerId);
        sendCodecCapabilitiesToPeer(targetPeerId);
        sendTransportSelectedToPeer(targetPeerId);
      };
      if (dc.readyState === "open") {
        sendCurrentStateToPeer(targetPeerId);
        sendCodecCapabilitiesToPeer(targetPeerId);
        sendTransportSelectedToPeer(targetPeerId);
      }
    } else {
      pc.ondatachannel = (event) => {
        const dc = event.channel;
        dc.binaryType = "arraybuffer";
        dc.onmessage = (e) => handleDataChannelMessage(e, targetPeerId);
        dataChannels.current.set(targetPeerId, dc);
        dc.onopen = () => {
          sendCurrentStateToPeer(targetPeerId);
          sendCodecCapabilitiesToPeer(targetPeerId);
          sendTransportSelectedToPeer(targetPeerId);
        };
        if (dc.readyState === "open") {
          sendCurrentStateToPeer(targetPeerId);
          sendCodecCapabilitiesToPeer(targetPeerId);
          sendTransportSelectedToPeer(targetPeerId);
        }
      };
    }

    if (localStreamRef.current) {
      // If this peer will use WebCodecs for video, don't attach WebRTC tracks (we'll route them
      // via data-channel instead). When the peer later switches to WebRTC, `broadcastStream`
      // will add/replace tracks as needed.
      const outboundMode = useWebRTCStore.getState().outboundTransportModeByPeer[targetPeerId] ?? "webrtc";
      if (outboundMode !== "webcodecs") {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }
    }

    // Apply codec preferences to offerers immediately after tracks/transceivers exist.
    enforceCodecPreferences(pc);

    return pc;
  };

  const handleSignalingMessage = async (message: any) => {
    const { type, payload } = message;
    const myPeerId = useWebRTCStore.getState().peerId;

    switch (type) {
      case "peer_joined": {
        const { peer_id } = payload;
        if (!peer_id || peer_id === myPeerId) break;
        store.addParticipant(peer_id);
        const existingPc = peerConnections.current.get(peer_id);
        if (existingPc) {
          existingPc.close();
          peerConnections.current.delete(peer_id);
        }
        const existingDc = dataChannels.current.get(peer_id);
        if (existingDc && existingDc.readyState !== "closed") {
          try {
            existingDc.close();
          } catch {
            /* ignore */
          }
          dataChannels.current.delete(peer_id);
        }
        remoteCodecCapabilitiesRef.current.delete(peer_id);
        sentCapabilitiesToPeerRef.current.delete(peer_id);
        // The peer who was already here creates the offer
        createPeerConnection(peer_id, false);
        void recomputeOutboundTransportAndCodec();
        break;
      }
      case "peer_left": {
        const { peer_id } = payload;
        if (!peer_id || peer_id === myPeerId) break;
        store.removeParticipant(peer_id);
        const pc = peerConnections.current.get(peer_id);
        if (pc) {
          pc.close();
          peerConnections.current.delete(peer_id);
        }
        const dc = dataChannels.current.get(peer_id);
        if (dc) {
          try {
            if (dc.readyState !== "closed") dc.close();
          } catch {
            /* ignore */
          }
          dataChannels.current.delete(peer_id);
        }
        useWebRTCStore.setState((state) => {
          const { [peer_id]: _removed, ...rest } = state.activeVideoCodecByPeer;
          return { activeVideoCodecByPeer: rest };
        });
        remoteCodecCapabilitiesRef.current.delete(peer_id);
        sentCapabilitiesToPeerRef.current.delete(peer_id);
        break;
      }
      case "offer": {
        const { peer_id, sdp } = payload;
        if (!peer_id || peer_id === myPeerId) break;
        let pc = peerConnections.current.get(peer_id);
        if (!pc) {
          pc = createPeerConnection(peer_id, true);
        }
        // Never munge incoming remote SDP before setRemoteDescription.
        // Firefox/Chrome codec fmtp lines can become invalid when rewritten here.
        const parsedSdp = JSON.parse(sdp);
        const targetKbps = (activeQualityRef.current?.bitrateMbps ?? 3) * 1000;

        // 1. Process the incoming offer (creates the video transceiver)
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(parsedSdp));
        } catch (error) {
          console.error("Failed to apply remote offer SDP", {
            peerId: peer_id,
            type: parsedSdp?.type,
            error,
          });
          throw error;
        }

        // 2. Enforce preferences on the newly created transceiver
        enforceCodecPreferences(pc);

        // 3. Generate the answer matching the enforced preferences
        const answer = await pc.createAnswer();
        if (answer.sdp) answer.sdp = enforceSdpBitrate(answer.sdp, targetKbps);
        await pc.setLocalDescription(answer);
        wsRef.current?.send(JSON.stringify({
          type: "answer",
          target_peer_id: peer_id,
          payload: { sdp: JSON.stringify(answer) }
        }));
        break;
      }
      case "answer": {
        const { peer_id, sdp } = payload;
        if (!peer_id || peer_id === myPeerId) break;
        const pc = peerConnections.current.get(peer_id);
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(sdp)));
        }
        break;
      }
      case "ice_candidate": {
        const { peer_id, candidate } = payload;
        if (!peer_id || peer_id === myPeerId) break;
        const pc = peerConnections.current.get(peer_id);
        if (pc) {
          await pc.addIceCandidate(new RTCIceCandidate(JSON.parse(candidate)));
        }
        break;
      }
    }
  };

  const joinLobby = useCallback((lobbyId: string) => {
    const state = useWebRTCStore.getState();
    const ws = wsRef.current;
    if (
      state.lobbyId === lobbyId &&
      ws &&
      (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      const oldWs = wsRef.current;
      oldWs.onclose = null;
      oldWs.close();
      wsRef.current = null;
    }

    useWebRTCStore.getState().setLobbyId(lobbyId);
    useWebRTCStore.getState().setError(null);
    useWebRTCStore.getState().setIsConnected(false);

    const connect = () => {
      const baseWs = process.env.NEXT_PUBLIC_MONOLITH_STREAM_WS_URL?.replace(/\/$/, "");
      const wsUrl =
        baseWs != null && baseWs !== ""
          ? `${baseWs}/${lobbyId}`
          : (() => {
            const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
            const host =
              process.env.NEXT_PUBLIC_MONOLITH_STREAM_SIGNALING_HOST ?? "localhost:8084";
            return `${protocol}//${host}/v1/stream/ws/${lobbyId}`;
          })();
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        useWebRTCStore.getState().setIsConnected(true);
        useWebRTCStore.getState().setError(null);
        let peerId = useWebRTCStore.getState().peerId;
        if (!peerId) {
          peerId = uuidv4();
          useWebRTCStore.getState().setPeerId(peerId);
        }
        ws.send(JSON.stringify({
          type: "join",
          payload: { peer_id: peerId }
        }));
      };

      ws.onmessage = (event) => {
        const rawData = event.data;
        if (typeof rawData !== "string") return;

        // Robust parsing for potentially concatenated JSON objects
        let startIndex = 0;
        while (startIndex < rawData.length) {
          // Find the start of the next JSON object
          const openingBraceIndex = rawData.indexOf("{", startIndex);
          if (openingBraceIndex === -1) break;

          let braceCount = 0;
          let endIndex = -1;
          let inQuote = false;
          let escaped = false;

          for (let i = openingBraceIndex; i < rawData.length; i++) {
            const char = rawData[i];

            if (escaped) {
              escaped = false;
              continue;
            }

            if (char === "\\\\") {
              escaped = true;
              continue;
            }

            if (char === '"') {
              inQuote = !inQuote;
              continue;
            }

            if (!inQuote) {
              if (char === "{") braceCount++;
              if (char === "}") {
                braceCount--;
                if (braceCount === 0) {
                  endIndex = i;
                  break;
                }
              }
            }
          }

          if (endIndex !== -1) {
            const jsonString = rawData.substring(openingBraceIndex, endIndex + 1);
            try {
              const msg = JSON.parse(jsonString);
              handleSignalingMessage(msg);
            } catch (err) {
              console.error("Failed to parse extracted JSON object:", jsonString, "Error:", err);
            }
            startIndex = endIndex + 1;
          } else {
            // No matching closing brace found
            break;
          }
        }
      };

      ws.onerror = () => {
        // Only set error if we are actively trying to use the app
        // We'll let onclose handle the reconnect logic
      };

      ws.onclose = () => {
        useWebRTCStore.getState().setIsConnected(false);
        // Only try to reconnect if we haven't manually left the lobby
        if (useWebRTCStore.getState().lobbyId === lobbyId) {
          useWebRTCStore.getState().setError("Connection lost. Reconnecting...");
          if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null;
            connect();
          }, 3000); // 3 second reconnect delay
        }
      };
    };

    connect();
  }, []);

  const leaveLobby = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    useWebRTCStore.getState().setLobbyId(null); // this prevents reconnection logic
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    useWebRTCStore.getState().clearParticipants();
    dataChannels.current.forEach((dc) => {
      try {
        if (dc.readyState !== "closed") dc.close();
      } catch {
        /* ignore */
      }
    });
    dataChannels.current.clear();
    peerConnections.current.forEach((pc) => pc.close());
    peerConnections.current.clear();
    remoteCodecCapabilitiesRef.current.clear();
    sentCapabilitiesToPeerRef.current.clear();
  }, []);

  const broadcastStream = useCallback((
    stream: MediaStream | null,
    mode: StreamMode,
    quality?: StreamQuality,
    targetPeerIds?: string[],
  ) => {
    localStreamRef.current = stream;
    if (quality) activeQualityRef.current = quality;

    // Keep stream mode updated so peers can decide when to show playback controls.
    const myPeerId = useWebRTCStore.getState().peerId;
    useWebRTCStore.getState().setStreamModeByPeer(myPeerId, mode);
    broadcastDataMessage({ type: "stream_mode", payload: { mode } });

    const videoTrack = stream?.getVideoTracks()[0] || null;
    const audioTrack = stream?.getAudioTracks()[0] || null;
    const targetPeerIdSet = targetPeerIds ? new Set(targetPeerIds) : null;
    const isMotionProfile = mode === "file" || (mode === "screen" && (quality?.fps ?? 30) >= 60);
    const contentHint: "motion" | "detail" = isMotionProfile ? "motion" : "detail";
    const degradationPreference: RTCDegradationPreference = isMotionProfile
      ? "maintain-framerate"
      : "balanced";

    // Hint the encoder according to stream type: motion for high-action media, detail for static desktop content.
    if (videoTrack && (mode === "screen" || mode === "file")) {
      // Not all browsers have this typed on MediaStreamTrack; keep it safe.
      (videoTrack as unknown as { contentHint?: string }).contentHint = contentHint;
    }

    // Update all existing peer connections
    peerConnections.current.forEach(async (pc, peerId) => {
      const shouldSendToPeer = targetPeerIdSet ? targetPeerIdSet.has(peerId) : true;
      if (!shouldSendToPeer) {
        // Clear any existing media senders for peers that should not receive WebRTC.
        const senders = pc.getSenders();
        const videoSender = senders.find((s) => s.track?.kind === "video");
        if (videoSender) {
          try {
            videoSender.replaceTrack(null);
          } catch (error) {
            console.error("Failed to clear video sender track", error);
          }
        }

        const audioSender = senders.find((s) => s.track?.kind === "audio");
        if (audioSender) {
          try {
            audioSender.replaceTrack(null);
          } catch (error) {
            console.error("Failed to clear audio sender track", error);
          }
        }
        return;
      }

      const senders = pc.getSenders();

      // Handle Video Track
      if (videoTrack) {
        let sender = senders.find((s) => s.track?.kind === "video") ?? null;
        if (sender) sender.replaceTrack(videoTrack);
        else sender = pc.addTrack(videoTrack, stream!);

        // Apply encoder config.
        if (sender && quality) {
          try {
            const params = sender.getParameters();

            // Ensure encodings array exists.
            if (!params.encodings || params.encodings.length === 0) {
              params.encodings = [{}];
            }

            params.encodings[0].maxBitrate = Math.floor(quality.bitrateMbps * 1_000_000);
            params.encodings[0].maxFramerate = quality.fps;
            // DOM typings are inconsistent across browsers; set as extended fields.
            (params.encodings[0] as any).networkPriority = "high";
            (params.encodings[0] as any).priority = "high";
            params.degradationPreference = degradationPreference;

            await sender.setParameters(params);
          } catch (error) {
            console.error("Failed to set video sender parameters", error);
          }
        }
      } else {
        const sender = senders.find(s => s.track?.kind === "video");
        if (sender) {
          try {
            sender.replaceTrack(null);
          } catch (error) {
            console.error("Failed to clear video sender track", error);
          }
        }
      }

      // Handle Audio Track
      if (audioTrack) {
        const sender = senders.find(s => s.track?.kind === "audio");
        if (sender) {
          sender.replaceTrack(audioTrack);
        } else {
          pc.addTrack(audioTrack, stream!);
        }
      } else {
        const sender = senders.find(s => s.track?.kind === "audio");
        if (sender) {
          try {
            sender.replaceTrack(null);
          } catch (error) {
            console.error("Failed to clear audio sender track", error);
          }
        }
      }

      // Renegotiation is handled implicitly if negotiationneeded fires
      // Ensure codec preferences are applied once transceivers exist.
      enforceCodecPreferences(pc);
    });
  }, []);

  const broadcastStreamMode = useCallback((mode: StreamMode) => {
    const myPeerId = useWebRTCStore.getState().peerId;
    useWebRTCStore.getState().setStreamModeByPeer(myPeerId, mode);
    broadcastDataMessage({ type: "stream_mode", payload: { mode } });
  }, []);

  const broadcastSyncEvent = useCallback((action: "play" | "pause" | "seek", time: number) => {
    const payload = { action, time, timestamp: Date.now() };
    const myPeerId = useWebRTCStore.getState().peerId;

    broadcastDataMessage({ type: "sync", payload });

    // Also apply locally for the local streamer.
    useWebRTCStore.getState().setSyncEventByPeer(myPeerId, {
      ...payload,
      receivedAtMs: Date.now(),
    });
  }, []);

  const broadcastDuration = useCallback((duration: number) => {
    const myPeerId = useWebRTCStore.getState().peerId;
    useWebRTCStore.getState().setDurationByPeer(myPeerId, duration);
    broadcastDataMessage({ type: "duration", payload: { duration } });
  }, []);

  const sendSyncRequest = useCallback((targetPeerId: string, action: "play" | "pause" | "seek", time: number) => {
    const payload = { action, time, timestamp: Date.now() };
    sendDataMessageToPeer(targetPeerId, { type: "sync_request", payload });
  }, []);

  const broadcastChatMessage = useCallback((text: string) => {
    const payload = { text, timestamp: Date.now() };
    broadcastDataMessage({ type: "chat", payload });
    // Also apply locally
    useWebRTCStore.getState().addChatMessage({
      ...payload,
      senderId: useWebRTCStore.getState().peerId,
    });
  }, []);

  const broadcastSubtitle = useCallback((label: string, language: string, content: string) => {
    const payload: SubtitleTrack = {
      id: crypto.randomUUID(),
      label,
      language,
      content,
    };
    const myPeerId = useWebRTCStore.getState().peerId;

    // Apply locally
    useWebRTCStore.getState().addSubtitleTrack(myPeerId, payload);
    // Broadcast to peers
    broadcastDataMessage({ type: "subtitle", payload });
  }, []);

  useEffect(() => {
    providerMountedRef.current = true;

    void detectCodecCapabilities()
      .then((capabilities) => {
        localCodecCapabilitiesRef.current = capabilities;
        Array.from(dataChannels.current.keys()).forEach((peerId) => {
          sendCodecCapabilitiesToPeer(peerId);
          maybeSelectCodecForPeer(peerId);
        });
        void recomputeOutboundTransportAndCodec();
      })
      .catch((error) => {
        console.warn("Unable to detect local WebCodecs capabilities", error);
      });

    return () => {
      providerMountedRef.current = false;
      queueMicrotask(() => {
        if (!providerMountedRef.current) {
          leaveLobby();
        }
      });
    };
  }, [leaveLobby, maybeSelectCodecForPeer, sendCodecCapabilitiesToPeer]);

  const contextValue = React.useMemo(() => ({
    joinLobby,
    leaveLobby,
    broadcastStream,
    broadcastStreamMode,
    broadcastSyncEvent,
    broadcastDuration,
    sendSyncRequest,
    broadcastChatMessage,
    broadcastSubtitle,
    sendBinaryToPeers,
    getDataChannelForPeer,
    getNegotiatedVideoCodecForPeer,
    broadcastActiveVideoCodec,
    getActiveVideoCodecForPeer,
  }), [
    joinLobby,
    leaveLobby,
    broadcastStream,
    broadcastStreamMode,
    broadcastSyncEvent,
    broadcastDuration,
    sendSyncRequest,
    broadcastChatMessage,
    broadcastSubtitle,
    sendBinaryToPeers,
    getDataChannelForPeer,
    getNegotiatedVideoCodecForPeer,
    broadcastActiveVideoCodec,
    getActiveVideoCodecForPeer,
  ]);

  return (
    <WebRTCContext.Provider value={contextValue}>
      {children}
    </WebRTCContext.Provider>
  );
};

export const useWebRTC = () => {
  const context = useContext(WebRTCContext);
  if (!context) {
    throw new Error("useWebRTC must be used within a WebRTCProvider");
  }
  return context;
};