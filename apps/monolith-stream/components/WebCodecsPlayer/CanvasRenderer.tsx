"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export interface CanvasRendererHandle {
  renderFrame: (frame: VideoFrame) => void;
}

interface CanvasRendererProps {
  width: number;
  height: number;
  className?: string;
}

export const CanvasRenderer = forwardRef<CanvasRendererHandle, CanvasRendererProps>(
  function CanvasRenderer({ width, height, className }, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const pendingFrameRef = useRef<VideoFrame | null>(null);
    const rafIdRef = useRef<number | null>(null);

    const stopRenderLoop = () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };

    const flushPendingFrame = () => {
      pendingFrameRef.current?.close();
      pendingFrameRef.current = null;
    };

    const scheduleRender = () => {
      if (rafIdRef.current !== null) {
        return;
      }

      const tick = () => {
        rafIdRef.current = null;
        const frame = pendingFrameRef.current;
        pendingFrameRef.current = null;
        if (!frame) {
          return;
        }

        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) {
          frame.close();
          return;
        }

        try {
          context.drawImage(frame as unknown as CanvasImageSource, 0, 0, width, height);
        } finally {
          frame.close();
        }

        if (pendingFrameRef.current) {
          rafIdRef.current = requestAnimationFrame(tick);
        }
      };

      rafIdRef.current = requestAnimationFrame(tick);
    };

    useEffect(() => {
      return () => {
        stopRenderLoop();
        flushPendingFrame();
      };
    }, []);

    useImperativeHandle(ref, () => ({
      renderFrame: (frame) => {
        if (!canvasRef.current) {
          frame.close();
          return;
        }

        // Keep only the freshest frame to avoid visual lag when decode output arrives in bursts.
        pendingFrameRef.current?.close();
        pendingFrameRef.current = frame;

        scheduleRender();
      },
    }), [width, height]);

    return <canvas ref={canvasRef} width={width} height={height} className={className} />;
  },
);
