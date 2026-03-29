"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type ChatLine = {
  senderId: string;
  email: string;
  text: string;
  ts: number;
};

function chatWsBaseFromSignaling(signalingWsBase: string): string {
  const s = signalingWsBase.trim();
  return s.replace(/\/v1\/stream\/ws$/, "/v1/stream/chat/ws");
}

export function useStreamChat(options: {
  sessionId: string;
  peerId: string;
  signalingWsBase: string;
  /** Optional override; defaults derived from signaling URL. */
  chatWsBase?: string;
}) {
  const { sessionId, peerId, signalingWsBase, chatWsBase: chatOverride } =
    options;

  const chatWsBase = useMemo(
    () =>
      (chatOverride ?? chatWsBaseFromSignaling(signalingWsBase)).trim(),
    [chatOverride, signalingWsBase],
  );

  const [messages, setMessages] = useState<ChatLine[]>([]);
  const [status, setStatus] = useState<"idle" | "connecting" | "open" | "error">(
    "idle",
  );
  const wsRef = useRef<WebSocket | null>(null);

  const sendText = useCallback((text: string) => {
    const ws = wsRef.current;
    const t = text.trim();
    if (!ws || ws.readyState !== WebSocket.OPEN || !t) return;
    ws.send(JSON.stringify({ type: "chat", text: t }));
  }, []);

  useEffect(() => {
    if (!sessionId?.trim() || !peerId?.trim() || !chatWsBase) {
      startTransition(() => setStatus("idle"));
      return;
    }

    let cancelled = false;
    const ac = new AbortController();

    async function run() {
      setStatus("connecting");
      try {
        const res = await fetch("/api/mstream/chat-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: sessionId.trim(),
            peerId: peerId.trim(),
          }),
          signal: ac.signal,
        });
        if (!res.ok) {
          setStatus("error");
          return;
        }
        const data = (await res.json()) as { token?: string };
        if (!data.token || cancelled) {
          setStatus("error");
          return;
        }
        const u = new URL(chatWsBase);
        u.searchParams.set("session_id", sessionId.trim());
        u.searchParams.set("peer_id", peerId.trim());
        u.searchParams.set("token", data.token);
        const ws = new WebSocket(u.toString());
        wsRef.current = ws;

        ws.onopen = () => {
          if (!cancelled) setStatus("open");
        };
        ws.onerror = () => {
          if (!cancelled) setStatus("error");
        };
        ws.onclose = () => {
          wsRef.current = null;
          if (!cancelled) setStatus("idle");
        };
        ws.onmessage = (ev) => {
          try {
            const v = JSON.parse(String(ev.data)) as {
              type?: string;
              senderId?: string;
              email?: string;
              text?: string;
              ts?: number;
            };
            if (v.type !== "chat" || typeof v.text !== "string") return;
            const line: ChatLine = {
              senderId: String(v.senderId ?? ""),
              email: String(v.email ?? ""),
              text: v.text,
              ts: typeof v.ts === "number" ? v.ts : Date.now() / 1000,
            };
            setMessages((m) => [...m.slice(-200), line]);
          } catch {
            /* ignore */
          }
        };
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    void run();
    return () => {
      cancelled = true;
      ac.abort();
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        ws.onmessage = null;
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      }
    };
  }, [sessionId, peerId, chatWsBase]);

  return { messages, sendText, status, chatWsBase };
}
