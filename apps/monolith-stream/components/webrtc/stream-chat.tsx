"use client";

import type { ChatLine } from "@/src/hooks/use-stream-chat";
import { useCallback, useEffect, useRef, useState } from "react";

export function StreamChatPanel(props: {
  messages: ChatLine[];
  sendText: (t: string) => void;
  status: string;
  selfPeerId: string;
  className?: string;
}) {
  const { messages, sendText, status, selfPeerId, className = "" } = props;
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const submit = useCallback(() => {
    const t = draft.trim();
    if (!t) return;
    sendText(t);
    setDraft("");
  }, [draft, sendText]);

  return (
    <aside
      className={`flex min-h-0 flex-col border-l border-white/10 bg-black/20 ${className}`}
    >
      <div className="border-b border-white/10 px-3 py-2">
        <h2 className="text-sm font-medium text-gray-200">Chat</h2>
        <p className="text-xs text-gray-500">
          {status === "open"
            ? "Connected"
            : status === "connecting"
              ? "Connecting…"
              : status === "error"
                ? "Chat unavailable"
                : "Idle"}
        </p>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2 text-sm">
        {messages.map((m, i) => (
          <div key={`${m.ts}-${m.senderId}-${i}`} className="text-gray-300">
            <span className="font-medium text-emerald-400/90">
              {m.email || m.senderId.slice(0, 8)}
              {m.senderId === selfPeerId ? " (you)" : ""}
            </span>
            <span className="text-gray-500"> · </span>
            <span className="break-words">{m.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="border-t border-white/10 p-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Message…"
            className="min-w-0 flex-1 rounded border border-white/15 bg-black/40 px-2 py-1.5 text-sm text-gray-100 placeholder:text-gray-600"
          />
          <button
            type="button"
            onClick={submit}
            className="rounded bg-emerald-700 px-3 py-1.5 text-sm text-white hover:bg-emerald-600"
          >
            Send
          </button>
        </div>
      </div>
    </aside>
  );
}
