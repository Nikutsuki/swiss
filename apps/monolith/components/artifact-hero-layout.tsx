"use client";

import type { ReactNode } from "react";

export type ArtifactHeroLayoutProps = {
  expirationProgress: number;
  artifactKindBadge: string;
  isEncrypted: boolean;
  /** Short id fragment shown after "ID:" */
  pasteIdFragment: string;
  headline: string;
  /** ORIGIN column; omit both to hide */
  originLabel?: string;
  originValue?: string;
  createdDisplay: string;
  /** Countdown or "Never" / "Expired" */
  expiresDisplay: string;
  /** Right-side buttons (copy, download, burn, …) */
  actions?: ReactNode;
  children: ReactNode;
};

export function ArtifactHeroLayout({
  expirationProgress,
  artifactKindBadge,
  isEncrypted,
  pasteIdFragment,
  headline,
  originLabel,
  originValue,
  createdDisplay,
  expiresDisplay,
  actions,
  children,
}: ArtifactHeroLayoutProps) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 px-4 sm:px-8 lg:px-24 pb-8 sm:pb-12 lg:pb-24 pt-6 sm:pt-8 lg:pt-12">
      <div className="h-1 w-full rounded-full bg-(--surface-container-low)">
        <div
          className="h-full rounded-full bg-(--security-emerald) shadow-[0_0_20px_1px_var(--security-emerald)] transition-all duration-1000 ease-linear"
          style={{
            width: `${Math.max(0, Math.min(1, expirationProgress)) * 100}%`,
          }}
        />
      </div>
      <div className="mt-4 sm:mt-6 flex flex-wrap gap-3 sm:gap-4 items-center">
        {isEncrypted ? (
          <span className="text-sm uppercase tracking-wider text-(--on-surface) bg-(--primary-fixed) px-3 py-1 rounded-2xl">
            {artifactKindBadge}
          </span>
        ) : (
          <span className="text-sm uppercase tracking-wider text-(--on-surface) bg-red-600 px-3 py-1 rounded-2xl">
            {artifactKindBadge}
          </span>
        )}
        <span className="text-sm uppercase tracking-wider text-(--on-surface-variant)">
          ID: {pasteIdFragment}
        </span>
      </div>
      <h1 className="text-3xl sm:text-5xl lg:text-7xl font-bold wrap-break-word">{headline}</h1>
      <div className="flex flex-col gap-4 justify-between lg:flex-row lg:items-start">
        <div className="flex flex-wrap gap-4 sm:gap-8">
          {originLabel !== undefined && originValue !== undefined ? (
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-xs font-light tracking-widest text-(--on-surface-variant)">
                {originLabel}
              </span>
              <span className="font-medium break-all text-white">{originValue}</span>
            </div>
          ) : null}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-light tracking-widest text-(--on-surface-variant)">
              CREATED
            </span>
            <span className="font-medium text-white">{createdDisplay}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-light tracking-widest text-(--on-surface-variant)">
              EXPIRES
            </span>
            <span className="font-medium text-(--security-emerald)">{expiresDisplay}</span>
          </div>
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
