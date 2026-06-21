"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@swiss/ui";
import { formatDuration } from "@/app/lib/format";
import type { CardProgressResponse } from "@/src/types/backend";

export interface FlashcardCard {
  questionId: string;
  prompt: string;
  answer: string;
  progress?: CardProgressResponse;
  imagePath?: string;
}

export interface FlashcardResult {
  questionId: string;
  known: boolean;
  responseTimeMs: number;
}

const SWIPE_THRESHOLD_PX = 80;
const SWIPE_CONFIDENT_DISTANCE_PX = 100;
const SWIPE_VELOCITY = 0.8;
const TAP_MAX_DURATION_MS = 300;
const TAP_MAX_MOVEMENT_PX = 10;
const EXIT_ANIMATION_MS = 400;

export default function FlashcardInterface({
  cards,
  onComplete,
  onQuit,
}: {
  cards: FlashcardCard[];
  onComplete: (results: FlashcardResult[]) => void;
  onQuit: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [exiting, setExiting] = useState<"known" | "unknown" | null>(null);
  const [sessionKnown, setSessionKnown] = useState(0);
  const [sessionUnknown, setSessionUnknown] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const resultsRef = useRef<FlashcardResult[]>([]);
  const cardShownAtRef = useRef(0);
  const pointerRef = useRef<{ x: number; y: number; time: number; dragging: boolean } | null>(null);

  const card = cards[index];
  const isLast = index === cards.length - 1;

  useEffect(() => {
    cardShownAtRef.current = Date.now();
    const start = Date.now();
    const timer = setInterval(() => {
      setElapsedSeconds(Math.round((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const mark = useCallback(
    (known: boolean) => {
      if (exiting) return;
      resultsRef.current.push({
        questionId: card.questionId,
        known,
        responseTimeMs: Date.now() - cardShownAtRef.current,
      });
      if (known) setSessionKnown((n) => n + 1);
      else setSessionUnknown((n) => n + 1);
      setExiting(known ? "known" : "unknown");
      setDragX(0);

      window.setTimeout(() => {
        if (isLast) {
          onComplete(resultsRef.current);
          return;
        }
        setExiting(null);
        setFlipped(false);
        setIndex((i) => i + 1);
        cardShownAtRef.current = Date.now();
      }, EXIT_ANIMATION_MS);
    },
    [card, exiting, isLast, onComplete],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.key === "ArrowLeft") {
        mark(true);
      } else if (e.key === "ArrowRight") {
        mark(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mark]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointerRef.current = { x: e.clientX, y: e.clientY, time: Date.now(), dragging: true };
    setIsDragging(true);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const start = pointerRef.current;
    if (!start?.dragging) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      setDragX(dx);
    }
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const start = pointerRef.current;
      pointerRef.current = null;
      setIsDragging(false);
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const duration = Date.now() - start.time;
      const velocity = Math.abs(dx) / Math.max(1, duration);
      setDragX(0);

      if (duration < TAP_MAX_DURATION_MS && Math.abs(dx) < TAP_MAX_MOVEMENT_PX && Math.abs(dy) < TAP_MAX_MOVEMENT_PX) {
        setFlipped((f) => !f);
        return;
      }
      if (Math.abs(dx) <= Math.abs(dy)) return;

      const confidentSwipe =
        Math.abs(dx) >= SWIPE_CONFIDENT_DISTANCE_PX ||
        (Math.abs(dx) >= SWIPE_THRESHOLD_PX && velocity >= SWIPE_VELOCITY);
      if (confidentSwipe) {
        mark(dx < 0);
      }
    },
    [mark],
  );

  const progress = card.progress;
  const confidence =
    progress && progress.times_reviewed > 0
      ? Math.round((progress.times_correct / progress.times_reviewed) * 100)
      : null;

  const dragHint = dragX < -SWIPE_THRESHOLD_PX / 2 ? "known" : dragX > SWIPE_THRESHOLD_PX / 2 ? "unknown" : null;

  const cardTransform = exiting
    ? `translateX(${exiting === "known" ? -500 : 500}px) translateY(-100px) rotate(${exiting === "known" ? -45 : 45}deg) scale(0.8)`
    : `translateX(${dragX}px) rotate(${dragX / 20}deg)`;
  const cardOpacity = exiting ? 0 : 1 - Math.min(0.4, Math.abs(dragX) / 400);

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-8">
      <div className="flex items-center justify-between gap-4 text-sm text-(--on-surface-variant)">
        <span>
          Card {Math.min(index + 1, cards.length)} of {cards.length}
        </span>
        <span>{formatDuration(elapsedSeconds)}</span>
        <Button size="sm" variant="ghost" onClick={onQuit}>
          Quit
        </Button>
      </div>
      <div className="mt-2 h-1 w-full bg-(--surface-container-low)">
        <div
          className="h-1 bg-(--security-emerald) transition-all duration-300"
          style={{ width: `${Math.round((index / cards.length) * 100)}%` }}
        />
      </div>

      <div className="mt-3 flex justify-between text-xs text-(--on-surface-variant)">
        <span>
          <span className="text-(--security-emerald)">{sessionKnown}</span> known ·{" "}
          <span className="text-red-400">{sessionUnknown}</span> learning
        </span>
        {confidence !== null ? (
          <span>
            {confidence}% confidence · reviewed {progress?.times_reviewed}× · interval {progress?.interval_days}d
          </span>
        ) : (
          <span>New card</span>
        )}
      </div>

      <div className="relative mt-6 select-none" style={{ perspective: "1200px" }}>
        {dragHint ? (
          <div
            className={`pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-6xl font-black ${
              dragHint === "known" ? "text-(--security-emerald)" : "text-red-400"
            }`}
          >
            {dragHint === "known" ? "✓" : "✗"}
          </div>
        ) : null}
        <div
          className="cursor-pointer touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          style={{
            transform: cardTransform,
            opacity: cardOpacity,
            transition: exiting
              ? `transform ${EXIT_ANIMATION_MS}ms ease-in, opacity ${EXIT_ANIMATION_MS}ms ease-in`
              : isDragging
                ? "none"
                : "transform 200ms ease-out, opacity 200ms ease-out",
          }}
        >
          <div className={`fiszki-card-inner relative h-72 w-full sm:h-80 ${flipped ? "flipped" : ""}`}>
            <div className="fiszki-card-face absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-md bg-(--surface-container-low) p-8 text-center">
              <span className="text-xs uppercase tracking-widest text-(--on-surface-variant)">Question</span>
              {card.imagePath && (
                <img src={card.imagePath} alt="Question context" className="max-h-24 w-auto object-contain rounded-md mb-2" />
              )}
              <span className="text-xl font-bold leading-snug sm:text-2xl">{card.prompt}</span>
              <span className="text-xs text-(--on-surface-variant)">
                Tap to reveal · swipe left if you know it, right if you don&apos;t
              </span>
            </div>
            <div
              className="fiszki-card-face absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-md bg-(--surface-container-high) p-8 text-center"
              style={{ transform: "rotateY(180deg)" }}
            >
              <span className="text-xs uppercase tracking-widest text-(--on-surface-variant)">Answer</span>
              <span className="text-xl font-bold leading-snug sm:text-2xl">{card.answer}</span>
              <span className="text-xs text-(--on-surface-variant)">Swipe or use the buttons below</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 flex items-center justify-center gap-4">
        <Button variant="secondary" className="border-(--security-emerald) text-(--security-emerald)" onClick={() => mark(true)}>
          Know it
        </Button>
        <Button variant="ghost" onClick={() => setFlipped((f) => !f)}>
          Flip
        </Button>
        <Button variant="secondary" className="border-red-500 text-red-400" onClick={() => mark(false)}>
          Don&apos;t know
        </Button>
      </div>
      <p className="mt-4 text-center text-xs text-(--on-surface-variant)">
        Keyboard: Space flips · ← know it · → don&apos;t know
      </p>
    </div>
  );
}
