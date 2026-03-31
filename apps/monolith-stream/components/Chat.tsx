"use client";

import { useState, useRef, useEffect } from "react";
import { useWebRTCStore, useWebRTC } from "@/hooks/useWebRTC";
import { Card, Input, Button } from "@swiss/ui";
import { Send } from "lucide-react";

export function Chat() {
  const [text, setText] = useState("");
  const { chatMessages, peerId } = useWebRTCStore();
  const { broadcastChatMessage } = useWebRTC();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    
    broadcastChatMessage(text);
    setText("");
  };

  return (
    <Card className="flex flex-col h-full min-h-0 max-h-full gap-4 overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-2">
        {chatMessages.length === 0 ? (
          <p className="text-sm text-(--on-surface-variant) text-center mt-4">
            No messages yet. Say hello!
          </p>
        ) : (
          chatMessages.map((msg, idx) => {
            const isMe = msg.senderId === peerId;
            return (
              <div 
                key={idx} 
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                <div 
                  className={`max-w-[85%] px-3 py-2 rounded-lg text-sm ${
                    isMe 
                      ? 'bg-(--security-emerald) text-black rounded-br-sm' 
                      : 'bg-(--surface-container-high) text-(--on-surface) rounded-bl-sm'
                  }`}
                >
                  {!isMe && (
                    <span className="text-[10px] opacity-70 block mb-0.5">
                      {msg.senderId.substring(0, 5)}
                    </span>
                  )}
                  {msg.text}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>
      
      <form onSubmit={handleSend} className="flex gap-2">
        <Input 
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message..."
          className="flex-1"
        />
        <Button type="submit" variant="primary" disabled={!text.trim()} className="px-3">
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </Card>
  );
}