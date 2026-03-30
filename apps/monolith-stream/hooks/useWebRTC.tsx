"use client";

import React, { createContext, useContext, useEffect, useRef, useState, ReactNode, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { create } from "zustand";
import type { StreamQuality } from "@/components/StreamControls";

// --- Zustand Store for UI State ---
interface SyncEvent {
  action: "play" | "pause" | "seek";
  time: number;
  timestamp: number;
}

type StreamMode = "none" | "screen" | "file";

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
  durationsByPeer: Record<string, number>;
  // Latest sync request received by the local peer (only meaningful if local peer is the streamer).
  incomingSyncRequest: SyncRequest | null;
  chatMessages: ChatMessage[];
  setPeerId: (id: string) => void;
  setLobbyId: (id: string | null) => void;
  setIsConnected: (connected: boolean) => void;
  setError: (err: string | null) => void;
  addParticipant: (id: string) => void;
  removeParticipant: (id: string) => void;
  addRemoteStream: (id: string, stream: MediaStream) => void;
  removeRemoteStream: (id: string) => void;
  setStreamModeByPeer: (peerId: string, mode: StreamMode) => void;
  setSyncEventByPeer: (peerId: string, event: SyncEvent) => void;
  setDurationByPeer: (peerId: string, duration: number) => void;
  setIncomingSyncRequest: (req: SyncRequest | null) => void;
  addChatMessage: (msg: ChatMessage) => void;
  toggleTheaterMode: () => void;
  clearParticipants: () => void;
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
    return { 
      participants: state.participants.filter((p) => p !== id),
      remoteStreams: rest,
      streamModesByPeer: restStreamModesByPeer,
      syncEventsByPeer: restSyncEventsByPeer,
      durationsByPeer: restDurationsByPeer,
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
    set((state) => ({ streamModesByPeer: { ...state.streamModesByPeer, [peerId]: mode } })),
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
    }),
}));

// --- Context for WebRTC actions ---
interface WebRTCContextValue {
  joinLobby: (lobbyId: string) => void;
  leaveLobby: () => void;
  broadcastStream: (stream: MediaStream | null, mode: StreamMode, quality?: StreamQuality) => void;
  broadcastStreamMode: (mode: StreamMode) => void;
  broadcastSyncEvent: (action: "play" | "pause" | "seek", time: number) => void;
  broadcastDuration: (duration: number) => void;
  sendSyncRequest: (targetPeerId: string, action: "play" | "pause" | "seek", time: number) => void;
  broadcastChatMessage: (text: string) => void;
}

const WebRTCContext = createContext<WebRTCContextValue | null>(null);

const STUN_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
  ],
};

export const WebRTCProvider = ({ children }: { children: ReactNode }) => {
  const wsRef = useRef<WebSocket | null>(null);
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const dataChannels = useRef<Map<string, RTCDataChannel>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const activeQualityRef = useRef<StreamQuality | null>(null);
  const store = useWebRTCStore();

  // Initialize peer ID
  useEffect(() => {
    store.setPeerId(uuidv4());
  }, []);

  const handleDataChannelMessage = (event: MessageEvent, senderId: string) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === "sync") {
        useWebRTCStore.getState().setSyncEventByPeer(senderId, msg.payload);
      } else if (msg.type === "sync_request") {
        useWebRTCStore.getState().setIncomingSyncRequest({
          ...msg.payload,
          requestedByPeerId: senderId,
        });
      } else if (msg.type === "stream_mode") {
        useWebRTCStore.getState().setStreamModeByPeer(senderId, msg.payload.mode);
      } else if (msg.type === "duration") {
        useWebRTCStore.getState().setDurationByPeer(senderId, msg.payload.duration);
      } else if (msg.type === "chat") {
        useWebRTCStore.getState().addChatMessage({
          ...msg.payload,
          senderId,
        });
      }
    } catch (err) {
      console.error("Failed to parse data channel message", err);
    }
  };

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

  const enforceCodecPreferences = (pc: RTCPeerConnection) => {
    if (
      typeof RTCRtpReceiver === "undefined" ||
      typeof RTCRtpReceiver.getCapabilities !== "function"
    ) {
      return;
    }

    const capabilities = RTCRtpReceiver.getCapabilities("video");
    if (!capabilities || !capabilities.codecs) return;

    const vp9 = capabilities.codecs.filter(
      (c) => c.mimeType.toLowerCase() === "video/vp9",
    );
    const h264 = capabilities.codecs.filter(
      (c) => c.mimeType.toLowerCase() === "video/h264",
    );

    const preferredCodecs = [...vp9, ...h264, ...capabilities.codecs];

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

    const lines = sdp.split(/\r\n/);
    let inVideo = false;
    let inserted = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith("m=")) {
        inVideo = line.startsWith("m=video");
        inserted = false;
        continue;
      }

      if (!inVideo) continue;

      // Remove existing bandwidth constraints for this m-section.
      if (line.startsWith("b=AS:") || line.startsWith("b=TIAS:")) {
        lines[i] = "";
        continue;
      }

      // Insert bandwidth constraints just after the connection line.
      if (!inserted && line.startsWith("c=")) {
        lines.splice(i + 1, 0, `b=AS:${kbps}`, `b=TIAS:${tiasBps}`);
        inserted = true;
        i += 2;
      }
    }

    return lines.filter((l) => l !== "").join("\r\n");
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
        useWebRTCStore.getState().addRemoteStream(targetPeerId, event.streams[0]);
      }
    };

    pc.onnegotiationneeded = async () => {
      try {
        const offer = await pc.createOffer();
        const targetKbps = (activeQualityRef.current?.bitrateMbps ?? 8) * 1000;
        if (offer.sdp) offer.sdp = enforceSdpBitrate(offer.sdp, targetKbps);
        await pc.setLocalDescription(offer);
        wsRef.current?.send(JSON.stringify({
          type: "offer",
          target_peer_id: targetPeerId,
          payload: { sdp: JSON.stringify(pc.localDescription) }
        }));
      } catch (err) {
        console.error("Error during negotiation", err);
      }
    };

    // Setup Data Channel
    if (!polite) {
      const dc = pc.createDataChannel("watch-together-data");
      dc.onmessage = (e) => handleDataChannelMessage(e, targetPeerId);
      dataChannels.current.set(targetPeerId, dc);
      dc.onopen = () => {
        // Push current stream mode + latest sync state to late joiners.
        const myPeerId = useWebRTCStore.getState().peerId;
        const mode = useWebRTCStore.getState().streamModesByPeer[myPeerId] ?? "none";
        sendDataMessageToPeer(targetPeerId, { type: "stream_mode", payload: { mode } });

        if (mode === "file") {
          const sync = useWebRTCStore.getState().syncEventsByPeer[myPeerId];
          const duration = useWebRTCStore.getState().durationsByPeer[myPeerId];
          if (sync) {
            sendDataMessageToPeer(targetPeerId, { type: "sync", payload: sync });
          }
          if (typeof duration === "number" && Number.isFinite(duration)) {
            sendDataMessageToPeer(targetPeerId, { type: "duration", payload: { duration } });
          }
        }
      };
    } else {
      pc.ondatachannel = (event) => {
        const dc = event.channel;
        dc.onmessage = (e) => handleDataChannelMessage(e, targetPeerId);
        dataChannels.current.set(targetPeerId, dc);
        dc.onopen = () => {
          // Push current stream mode + latest sync state to late joiners.
          const myPeerId = useWebRTCStore.getState().peerId;
          const mode = useWebRTCStore.getState().streamModesByPeer[myPeerId] ?? "none";
          sendDataMessageToPeer(targetPeerId, { type: "stream_mode", payload: { mode } });

          if (mode === "file") {
            const sync = useWebRTCStore.getState().syncEventsByPeer[myPeerId];
            const duration = useWebRTCStore.getState().durationsByPeer[myPeerId];
            if (sync) {
              sendDataMessageToPeer(targetPeerId, { type: "sync", payload: sync });
            }
            if (typeof duration === "number" && Number.isFinite(duration)) {
              sendDataMessageToPeer(targetPeerId, { type: "duration", payload: { duration } });
            }
          }
        };
      };
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    // Apply codec preferences to offerers immediately after tracks/transceivers exist.
    enforceCodecPreferences(pc);

    // We don't manually createOffer here anymore, onnegotiationneeded will handle it when tracks are added
    // But if there are no tracks, we should force it if not polite
    if (!polite && (!localStreamRef.current || localStreamRef.current.getTracks().length === 0)) {
      pc.createOffer().then((offer) => {
        const targetKbps = (activeQualityRef.current?.bitrateMbps ?? 8) * 1000;
        if (offer.sdp) offer.sdp = enforceSdpBitrate(offer.sdp, targetKbps);
        pc.setLocalDescription(offer);
        wsRef.current?.send(JSON.stringify({
          type: "offer",
          target_peer_id: targetPeerId,
          payload: { sdp: JSON.stringify(offer) }
        }));
      });
    }

    return pc;
  };

  const handleSignalingMessage = async (message: any) => {
    const { type, payload } = message;
    
    switch (type) {
      case "peer_joined": {
        const { peer_id } = payload;
        store.addParticipant(peer_id);
        // The peer who was already here creates the offer
        createPeerConnection(peer_id, false);
        break;
      }
      case "peer_left": {
        const { peer_id } = payload;
        store.removeParticipant(peer_id);
        const pc = peerConnections.current.get(peer_id);
        if (pc) {
          pc.close();
          peerConnections.current.delete(peer_id);
        }
        break;
      }
      case "offer": {
        const { peer_id, sdp } = payload;
        let pc = peerConnections.current.get(peer_id);
        if (!pc) {
          pc = createPeerConnection(peer_id, true);
        }
        // 1. Process the incoming offer (creates the video transceiver)
        await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(sdp)));

        // 2. Enforce preferences on the newly created transceiver
        enforceCodecPreferences(pc);

        // 3. Generate the answer matching the enforced preferences
        const answer = await pc.createAnswer();
        const targetKbps = (activeQualityRef.current?.bitrateMbps ?? 8) * 1000;
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
        const pc = peerConnections.current.get(peer_id);
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(sdp)));
        }
        break;
      }
      case "ice_candidate": {
        const { peer_id, candidate } = payload;
        const pc = peerConnections.current.get(peer_id);
        if (pc) {
          await pc.addIceCandidate(new RTCIceCandidate(JSON.parse(candidate)));
        }
        break;
      }
    }
  };

  const joinLobby = useCallback((lobbyId: string) => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    useWebRTCStore.getState().setLobbyId(lobbyId);
    useWebRTCStore.getState().setError(null);
    useWebRTCStore.getState().setIsConnected(false);

    let reconnectTimer: NodeJS.Timeout;
    
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
        ws.send(JSON.stringify({
          type: "join",
          payload: { peer_id: useWebRTCStore.getState().peerId }
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
          clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => {
            connect();
          }, 3000); // 3 second reconnect delay
        }
      };
    };

    connect();
  }, []);

  const leaveLobby = useCallback(() => {
    useWebRTCStore.getState().setLobbyId(null); // this prevents reconnection logic
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    useWebRTCStore.getState().clearParticipants();
    peerConnections.current.forEach((pc) => pc.close());
    peerConnections.current.clear();
  }, []);

  const broadcastStream = useCallback((stream: MediaStream | null, mode: StreamMode, quality?: StreamQuality) => {
    localStreamRef.current = stream;
    if (quality) activeQualityRef.current = quality;

    // Keep stream mode updated so peers can decide when to show playback controls.
    const myPeerId = useWebRTCStore.getState().peerId;
    useWebRTCStore.getState().setStreamModeByPeer(myPeerId, mode);
    broadcastDataMessage({ type: "stream_mode", payload: { mode } });

    const videoTrack = stream?.getVideoTracks()[0] || null;
    const audioTrack = stream?.getAudioTracks()[0] || null;

    // Hint to the encoder to prioritize detail for screen shares.
    if (videoTrack && mode === "screen") {
      // Not all browsers have this typed on MediaStreamTrack; keep it safe.
      (videoTrack as unknown as { contentHint?: string }).contentHint = "detail";
    }

    // Update all existing peer connections
    peerConnections.current.forEach(async (pc) => {
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

            params.encodings[0].maxBitrate = Math.max(
              1_000_000,
              Math.floor(quality.bitrateMbps * 1_000_000),
            );
            params.encodings[0].maxFramerate = quality.fps;
            params.degradationPreference = "maintain-resolution";

            await sender.setParameters(params);
          } catch (error) {
            console.error("Failed to set video sender parameters", error);
          }
        }
      } else {
        const sender = senders.find(s => s.track?.kind === "video");
        if (sender) pc.removeTrack(sender);
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
        if (sender) pc.removeTrack(sender);
      }

      // Renegotiation is handled implicitly if negotiationneeded fires
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
    useWebRTCStore.getState().setSyncEventByPeer(myPeerId, payload);
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

  useEffect(() => {
    return () => {
      leaveLobby();
    };
  }, [leaveLobby]);

  const contextValue = React.useMemo(() => ({
    joinLobby,
    leaveLobby,
    broadcastStream,
    broadcastStreamMode,
    broadcastSyncEvent,
    broadcastDuration,
    sendSyncRequest,
    broadcastChatMessage,
  }), [
    joinLobby,
    leaveLobby,
    broadcastStream,
    broadcastStreamMode,
    broadcastSyncEvent,
    broadcastDuration,
    sendSyncRequest,
    broadcastChatMessage,
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