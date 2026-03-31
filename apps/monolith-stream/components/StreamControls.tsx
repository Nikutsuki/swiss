"use client";

import { useRef } from "react";
import { Button, Card, CardBody } from "@swiss/ui";
import { MonitorUp, FileVideo, X, Subtitles } from "lucide-react";
import { useMediaStream } from "@/hooks/useMediaStream";
import { useWebRTC } from "@/hooks/useWebRTC";

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
  const subtitleInputRef = useRef<HTMLInputElement>(null);
  const { broadcastSubtitle } = useWebRTC();
  
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

  const handleSubtitleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const text = await file.text();
        const baseName = file.name.endsWith(".vtt") ? file.name.slice(0, -4) : file.name;
        const language = baseName.split("_").pop() || "en";
        const label = baseName;

        broadcastSubtitle(label, language, text);
      } catch (err) {
        console.error("Failed to read subtitle file:", err);
      }
    }

    // Reset input so the same file can be uploaded again if needed
    if (subtitleInputRef.current) {
      subtitleInputRef.current.value = "";
    }
  };

  return (
    <Card>
      <CardBody className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-stretch sm:items-center mt-0! py-2">
        {activeType === 'none' ? (
          <>
            <Button onClick={handleScreenShare} variant="secondary" className="w-full sm:flex-1" bold>
              <MonitorUp className="w-4 h-4 mr-2" /> Share Screen
            </Button>
            
            <input 
              type="file" 
              accept="video/mp4,video/webm" 
              className="hidden" 
              ref={fileInputRef}
              onChange={handleFileChange}
            />
            <Button onClick={() => fileInputRef.current?.click()} variant="secondary" className="w-full sm:flex-1" bold>
              <FileVideo className="w-4 h-4 mr-2" /> Stream File
            </Button>
          </>
        ) : (
          <>
            <Button onClick={handleStop} variant="error" className="w-full sm:flex-1" bold>
              <X className="w-4 h-4 mr-2" /> Stop {activeType === 'screen' ? 'Screen' : 'File'}
            </Button>

            {/* Subtitle Injection Control - Only visible when streaming */}
            <input
              type="file"
              accept=".vtt"
              className="hidden"
              ref={subtitleInputRef}
              onChange={handleSubtitleUpload}
              multiple
            />
            <Button onClick={() => subtitleInputRef.current?.click()} variant="secondary" className="w-full sm:w-auto sm:flex-none" bold>
              <Subtitles className="w-4 h-4 mr-2" /> Add .VTT
            </Button>
          </>
        )}
      </CardBody>
      <CardBody className="flex flex-col gap-3 mt-0! pt-0">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <div className="text-xs text-(--on-surface-variant)">Stream Config</div>
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <select
              value={quality.resolution}
              onChange={(e) => handleResolutionChange(e.target.value)}
              className="w-full bg-(--surface-container-high) border border-(--outline-variant)/30 rounded-md px-2 py-1 text-sm"
            >
              <option value="720p">720p</option>
              <option value="1080p">1080p</option>
              <option value="2k">2K</option>
            </select>
            <select
              value={quality.fps}
              onChange={(e) => handleFpsChange(Number(e.target.value))}
              className="w-full bg-(--surface-container-high) border border-(--outline-variant)/30 rounded-md px-2 py-1 text-sm"
            >
              <option value={30}>30 fps</option>
              <option value={60}>60 fps</option>
            </select>
            <select
              value={quality.bitrateMbps}
              onChange={(e) => handleBitrateChange(Number(e.target.value))}
              className="w-full bg-(--surface-container-high) border border-(--outline-variant)/30 rounded-md px-2 py-1 text-sm"
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