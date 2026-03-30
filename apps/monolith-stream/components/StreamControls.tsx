"use client";

import { useRef } from "react";
import { Button, Card, CardBody } from "@swiss/ui";
import { MonitorUp, FileVideo, X } from "lucide-react";
import { useMediaStream } from "@/hooks/useMediaStream";

interface StreamControlsProps {
  onStreamReady: (stream: MediaStream | null, type: 'screen' | 'file' | 'none', url?: string | null) => void;
}

export function StreamControls({ onStreamReady }: StreamControlsProps) {
  const { startScreenShare, startLocalFile, stopStream, localStream, localVideoUrl, error } = useMediaStream();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const activeType = localStream ? 'screen' : localVideoUrl ? 'file' : 'none';

  const handleScreenShare = async () => {
    const stream = await startScreenShare();
    if (stream) onStreamReady(stream, 'screen');
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // For local files, we'll capture a stream from the video element later, 
      // but for now we signal that a file is ready
      const url = await startLocalFile(file);
      onStreamReady(null, 'file', url);
    }
  };

  const handleStop = () => {
    stopStream();
    onStreamReady(null, 'none');
  };

  return (
    <Card>
      <CardBody className="flex gap-4 items-center !mt-0 py-2">
        {activeType === 'none' ? (
          <>
            <Button onClick={handleScreenShare} variant="secondary" className="flex-1" bold>
              <MonitorUp className="w-4 h-4 mr-2" /> Share Screen
            </Button>
            
            <input 
              type="file" 
              accept="video/mp4,video/webm" 
              className="hidden" 
              ref={fileInputRef}
              onChange={handleFileChange}
            />
            <Button onClick={() => fileInputRef.current?.click()} variant="secondary" className="flex-1" bold>
              <FileVideo className="w-4 h-4 mr-2" /> Stream File
            </Button>
          </>
        ) : (
          <Button onClick={handleStop} variant="error" className="w-full" bold>
            <X className="w-4 h-4 mr-2" /> Stop Streaming {activeType === 'screen' ? 'Screen' : 'File'}
          </Button>
        )}
      </CardBody>
      {error && <p className="text-[#ffb4ab] text-xs px-6 pb-4">{error}</p>}
    </Card>
  );
}