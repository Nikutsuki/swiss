"use client";

import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { Button, Input, Card, CardTitle, CardBody } from "@swiss/ui";
import { Check, Copy } from "lucide-react";

interface ShareLobbyProps {
  lobbyId: string;
}

export function ShareLobby({ lobbyId }: ShareLobbyProps) {
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setUrl(`${window.location.origin}/lobby/${lobbyId}`);
  }, [lobbyId]);

  const handleCopy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!url) return null;

  return (
    <Card className="max-w-md mx-auto mt-8">
      <CardTitle>Invite Others</CardTitle>
      <CardBody className="flex flex-col items-center gap-6">
        <div className="bg-white p-4 rounded-lg">
          <QRCodeSVG value={url} size={200} />
        </div>
        
        <div className="w-full flex gap-2">
          <Input 
            value={url} 
            readOnly 
            className="flex-1 font-mono text-xs" 
            title="Lobby URL"
          />
          <Button 
            variant="secondary" 
            className="mt-7" 
            onClick={handleCopy}
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}