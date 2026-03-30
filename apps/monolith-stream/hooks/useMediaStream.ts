import { useState, useCallback } from "react";

export function useMediaStream() {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [localVideoUrl, setLocalVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    if (localVideoUrl) {
      URL.revokeObjectURL(localVideoUrl);
      setLocalVideoUrl(null);
    }
  }, [localStream, localVideoUrl]);

  const startScreenShare = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      setLocalStream(stream);
      setLocalVideoUrl(null);
      setError(null);
      
      if (stream.getVideoTracks()[0]) {
        stream.getVideoTracks()[0].onended = () => {
          stopStream();
        };
      }
      
      return stream;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to share screen");
      return null;
    }
  }, [stopStream]);

  const startLocalFile = useCallback(async (file: File) => {
    try {
      const url = URL.createObjectURL(file);
      setLocalVideoUrl(url);
      setLocalStream(null);
      setError(null);
      return url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load local file");
      return null;
    }
  }, []);

  return {
    localStream,
    localVideoUrl,
    error,
    startScreenShare,
    startLocalFile,
    stopStream,
  };
}
