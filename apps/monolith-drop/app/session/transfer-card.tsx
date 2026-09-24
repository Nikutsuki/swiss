"use client";

import { memo, useDeferredValue } from "react";
import { MdClose } from "react-icons/md";

import type { TransferSession } from "./types";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB", "TB"];
  let i = -1;
  let v = n;
  do {
    v /= 1024;
    i++;
  } while (v >= 1024 && i < u.length - 1);
  return `${v.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

function formatEta(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))}s`;
  const m = Math.floor(seconds / 60);
  const r = Math.round(seconds % 60);
  return `${m}m ${r}s`;
}

export type TransferCardProps = {
  transfer: TransferSession;
  variant: "upload" | "download";
  onDismiss?: () => void;
  /** Stop an in-progress upload (sender abort). */
  onStop?: () => void;
};

function TransferCardInner({ transfer, variant, onDismiss, onStop }: TransferCardProps) {
  const deferredCurrent = useDeferredValue(transfer.currentSpeedBps);
  const deferredAvg = useDeferredValue(transfer.averageSpeedBps);
  const deferredEta = useDeferredValue(transfer.etaSeconds);

  const pct =
    transfer.total > 0
      ? Math.min(100, Math.round((transfer.progress / transfer.total) * 100))
      : 0;

  const label = variant === "upload" ? "Upload" : "Download";
  const accent =
    variant === "upload"
      ? "bg-(--security-emerald)"
      : "bg-(--surface-bright)";
  const canDismiss =
    transfer.status === "done" ||
    transfer.status === "error" ||
    transfer.status === "cancelled";

  const canStopUpload =
    variant === "upload" &&
    transfer.direction === "out" &&
    transfer.status === "sending" &&
    Boolean(onStop);

  return (
    <div className="relative border border-(--outline-variant)/10 bg-(--surface-container-lowest) p-3 sm:p-4 pr-8 sm:pr-10">
      {canDismiss && onDismiss ? (
        <button
          type="button"
          aria-label={`Dismiss ${transfer.name}`}
          className="absolute top-2 right-2 rounded p-1 text-(--on-surface-variant) transition-colors hover:bg-(--surface-container-high) hover:text-white"
          onClick={onDismiss}
        >
          <MdClose className="text-lg" aria-hidden />
        </button>
      ) : null}
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="mb-0.5 inline-block text-[9px] font-bold tracking-tighter text-(--on-surface-variant) uppercase">
            {label}
          </span>
          <h4 className="truncate font-['Space_Grotesk'] text-sm font-bold text-white">
            {transfer.name}
          </h4>
          <p className="text-[10px] text-(--on-surface-variant)">
            {transfer.status === "queued"
              ? "Queued"
              : `${formatBytes(transfer.progress)} / ${formatBytes(transfer.total)}`}
          </p>
        </div>
        <div className="text-right">
          <span className="font-['Space_Grotesk'] text-xl sm:text-2xl font-bold text-white">
            {transfer.status === "queued" ? "—" : `${pct}%`}
          </span>
        </div>
      </div>
      <div className="relative mb-3 h-2 w-full overflow-hidden bg-(--surface-container-lowest)">
        <div
          className={`absolute top-0 left-0 h-full ${accent} transition-[width] duration-300 ease-out`}
          style={{ width: transfer.status === "queued" ? "0%" : `${pct}%` }}
        />
      </div>
      <div className="grid grid-cols-1 gap-1 text-[9px] tracking-wide text-(--on-surface-variant) sm:grid-cols-3">
        <div>
          <span className="block uppercase">Current</span>
          <span className="text-white">
            {deferredCurrent > 0 ? `${formatBytes(deferredCurrent)}/s` : "—"}
          </span>
        </div>
        <div>
          <span className="block uppercase">Average</span>
          <span className="text-white">
            {deferredAvg > 0 ? `${formatBytes(deferredAvg)}/s` : "—"}
          </span>
        </div>
        <div>
          <span className="block uppercase">ETA</span>
          <span className="text-white">{formatEta(deferredEta)}</span>
        </div>
      </div>
      {transfer.status === "error" ? (
        <p className="mt-2 text-[10px] text-red-400">Transfer failed</p>
      ) : null}
      {transfer.status === "cancelled" ? (
        <p className="mt-2 text-[10px] text-(--on-surface-variant)">Transfer stopped</p>
      ) : null}
      {canStopUpload ? (
        <button
          type="button"
          className="mt-3 w-full border border-(--outline-variant)/40 py-2 text-[9px] font-bold tracking-widest text-(--on-surface-variant) uppercase transition-colors hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300"
          onClick={onStop}
        >
          Stop transfer
        </button>
      ) : null}
    </div>
  );
}

export const TransferCard = memo(TransferCardInner);
