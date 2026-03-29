"use client";

import { useEffect, useRef } from "react";

export function StreamView(props: {
  stream: MediaStream | null;
  muted?: boolean;
  className?: string;
}) {
  const { stream, muted = false, className = "" } = props;
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream ?? null;
    return () => {
      el.srcObject = null;
    };
  }, [stream]);

  if (!stream?.getTracks().some((t) => t.readyState === "live")) {
    return null;
  }

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className={`max-h-[70vh] w-full rounded-lg bg-black object-contain ${className}`}
    />
  );
}
