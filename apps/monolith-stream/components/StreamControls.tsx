"use client";

import { useRef } from "react";
import { Button, Card, CardBody } from "@swiss/ui";
import { MonitorUp, FileVideo, X, Subtitles } from "lucide-react";
import { useWebRTC } from "@/hooks/useWebRTC";
import { AnimatedDropdown } from "@/components/AnimatedDropdown";

export type StreamQuality = {
  resolution: "720p" | "1080p" | "2k";
  fps: 30 | 60;
  bitrateMbps: number;
};

interface StreamControlsProps {
  activeType: "screen" | "file" | "none";
  error: string | null;
  onStartScreenShare: () => Promise<void>;
  onStartFile: (file: File) => Promise<void>;
  onStop: () => void;
  quality: StreamQuality;
  onQualityChange: (quality: StreamQuality) => void;
}

export function StreamControls({
  activeType,
  error,
  onStartScreenShare,
  onStartFile,
  onStop,
  quality,
  onQualityChange,
}: StreamControlsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const subtitleInputRef = useRef<HTMLInputElement>(null);
  const { broadcastSubtitle } = useWebRTC();
  const resolutionOptions = [
    { value: "720p", label: "720p", description: "Balanced quality and compatibility" },
    { value: "1080p", label: "1080p", description: "Recommended default for sharp streams" },
    { value: "2k", label: "2K", description: "Higher detail for large displays" },
  ] as const;
  const fpsOptions = [
    { value: "30", label: "30 fps", description: "Lower bandwidth, stable playback" },
    { value: "60", label: "60 fps", description: "Smoother motion, higher bitrate needs" },
  ] as const;
  const bitrateOptions = [
    { value: "2", label: "2 Mbps", description: "Very low bandwidth mode" },
    { value: "3", label: "3 Mbps", description: "Stable 1080p baseline for P2P screen share" },
    { value: "5", label: "5 Mbps", description: "Good for unstable connections" },
    { value: "8", label: "8 Mbps", description: "High bitrate for strong network conditions" },
    { value: "15", label: "15 Mbps", description: "High-detail desktop sharing" },
    { value: "25", label: "25 Mbps", description: "Maximum quality profile" },
  ] as const;

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
    const bitrateMbps = Number.isFinite(nextMbps) && nextMbps > 0 ? nextMbps : 3;
    onQualityChange({ ...quality, bitrateMbps });
  };

  const handleScreenShare = async () => {
    await onStartScreenShare();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    try {
      if (file) {
        await onStartFile(file);
      }
    } finally {
      // Allow selecting the same file again after stopping/ending a previous stream.
      input.value = "";
    }
  };

  const handleStop = () => {
    onStop();
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
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <AnimatedDropdown
              label="Resolution"
              options={resolutionOptions}
              value={quality.resolution}
              onChange={handleResolutionChange}
            />
            <AnimatedDropdown
              label="Frame Rate"
              options={fpsOptions}
              value={String(quality.fps)}
              onChange={(next) => handleFpsChange(Number(next))}
            />
            <AnimatedDropdown
              label="Bitrate"
              options={bitrateOptions}
              value={String(quality.bitrateMbps)}
              onChange={(next) => handleBitrateChange(Number(next))}
            />
          </div>
        </div>
      </CardBody>
      {error && <p className="text-[#ffb4ab] text-xs px-6 pb-4">{error}</p>}
    </Card>
  );
}