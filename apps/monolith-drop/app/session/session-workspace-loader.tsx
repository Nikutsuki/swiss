"use client";

import dynamic from "next/dynamic";

const SessionWorkspace = dynamic(() => import("./session-workspace"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-full flex-1 items-center justify-center bg-(--surface) text-(--on-surface-variant)">
      Loading…
    </div>
  ),
});

export default function SessionWorkspaceLoader() {
  return <SessionWorkspace />;
}
