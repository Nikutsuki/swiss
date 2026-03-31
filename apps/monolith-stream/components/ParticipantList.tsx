"use client";

import { useWebRTCStore } from "@/hooks/useWebRTC";
import { Card, CardTitle, CardBody, Badge } from "@swiss/ui";

export function ParticipantList() {
  const { peerId, participants, isConnected } = useWebRTCStore();

  return (
    <Card className="h-full min-h-0 flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <CardTitle className="mt-0!">Participants</CardTitle>
        <Badge variant={isConnected ? "success" : "error"}>
          {isConnected ? "Connected" : "Disconnected"}
        </Badge>
      </div>
      
      <CardBody className="flex flex-col gap-2 mt-0! flex-1 min-h-0 overflow-y-auto pr-1">
        <div className="flex items-center justify-between p-2 rounded bg-(--surface-container-high)">
          <span className="text-sm font-medium">You</span>
          <span className="text-xs text-(--on-surface-variant) font-mono truncate max-w-[120px]">
            {peerId}
          </span>
        </div>
        
        {participants.map((id) => (
          <div key={id} className="flex items-center justify-between p-2 rounded border border-(--outline-variant)/30">
            <span className="text-sm">Peer</span>
            <span className="text-xs text-(--on-surface-variant) font-mono truncate max-w-[120px]">
              {id}
            </span>
          </div>
        ))}
        
        {participants.length === 0 && (
          <div className="text-sm text-center text-(--on-surface-variant) py-4">
            Waiting for others to join...
          </div>
        )}
      </CardBody>
    </Card>
  );
}