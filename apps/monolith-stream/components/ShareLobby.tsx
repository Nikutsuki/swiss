"use client";

import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { Button, Input, Card, CardTitle, CardBody } from "@swiss/ui";
import { Check, Copy } from "lucide-react";

interface ShareLobbyProps {
  lobbyId: string;
  fitHeight?: boolean;
}

export function ShareLobby({ lobbyId, fitHeight = false }: ShareLobbyProps) {
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
    <Card
      className={
        fitHeight
          ? "h-full min-h-0 flex flex-col max-w-none mx-0 mt-0"
          : "max-w-md mx-auto mt-6 sm:mt-8"
      }
    >
      <CardTitle>Invite Others</CardTitle>
      <CardBody
        className={
          fitHeight
            ? "flex flex-col items-center gap-4 sm:gap-6 mt-0! flex-1 min-h-0"
            : "flex flex-col items-center gap-4 sm:gap-6"
        }
      >
        <div className="bg-white p-3 sm:p-4 mt-4 sm:mt-8 rounded-lg">
          <QRCodeSVG value={url} size={160} className="sm:hidden" />
          <QRCodeSVG value={url} size={200} className="hidden sm:block" />
        </div>
        
        <div className="w-full flex flex-col sm:flex-row gap-2">
          <Input 
            value={url} 
            readOnly 
            className="flex-1 font-mono text-xs w-full" 
            title="Lobby URL"
          />
          <Button 
            variant="secondary" 
            className="w-full sm:w-auto" 
            onClick={handleCopy}
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}