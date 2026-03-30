"use client";

import { useRef } from "react";
import { Button, Card, CardBody } from "@swiss/ui";
import { MonitorUp, FileVideo, X } from "lucide-react";
import { useMediaStream } from "@/hooks/useMediaStream";

export type StreamQuality = {
  resolution: "720p" | "1080p" | "2k";
  fps: 30 | 60;
  bitrateMbps: number;
};

interface StreamControlsProps {
  onStreamReady: (stream: MediaStream | null, type: 'screen' | 'file' | 'none', url?: string | null) => void;
  quality: StreamQuality;
  onQualityChange: (quality: StreamQuality) => void;
}

export function StreamControls({ onStreamReady, quality, onQualityChange }: StreamControlsProps) {
  const { startScreenShare, startLocalFile, stopStream, localStream, localVideoUrl, error } = useMediaStream();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const activeType = localStream ? 'screen' : localVideoUrl ? 'file' : 'none';

  const handleFpsChange = (nextFps: number) => {
    const fps = nextFps === 30 ? 30 : 60;
    onQualityChange({ ...quality, fps });
  };

  const handleResolutionChange = (next: string) => {
    if (next === "720p" || next === "1080p" || next === "2k") {
      onQualityChange({ ...quality, resolution: next });
    }
  };

  const handleBitrateChange = (nextMbps: number) => {
    const bitrateMbps = Number.isFinite(nextMbps) && nextMbps > 0 ? nextMbps : 8;
    onQualityChange({ ...quality, bitrateMbps });
  };

  const handleScreenShare = async () => {
    const stream = await startScreenShare(quality);
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
      <CardBody className="flex flex-col gap-3 !mt-0 pt-0">
        <div className="flex items-center gap-3">
          <div className="text-xs text-(--on-surface-variant) whitespace-nowrap">Stream Config</div>
          <div className="flex-1 grid grid-cols-3 gap-2">
            <select
              value={quality.resolution}
              onChange={(e) => handleResolutionChange(e.target.value)}
              className="bg-(--surface-container-high) border border-(--outline-variant)/30 rounded-md px-2 py-1 text-sm"
            >
              <option value="720p">720p</option>
              <option value="1080p">1080p</option>
              <option value="2k">2K</option>
            </select>
            <select
              value={quality.fps}
              onChange={(e) => handleFpsChange(Number(e.target.value))}
              className="bg-(--surface-container-high) border border-(--outline-variant)/30 rounded-md px-2 py-1 text-sm"
            >
              <option value={30}>30 fps</option>
              <option value={60}>60 fps</option>
            </select>
            <select
              value={quality.bitrateMbps}
              onChange={(e) => handleBitrateChange(Number(e.target.value))}
              className="bg-(--surface-container-high) border border-(--outline-variant)/30 rounded-md px-2 py-1 text-sm"
            >
              <option value={2}>2 Mbps</option>
              <option value={5}>5 Mbps</option>
              <option value={8}>8 Mbps</option>
              <option value={15}>15 Mbps</option>
              <option value={25}>25 Mbps</option>
            </select>
          </div>
        </div>
      </CardBody>
      {error && <p className="text-[#ffb4ab] text-xs px-6 pb-4">{error}</p>}
    </Card>
  );
}