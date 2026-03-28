import { Suspense } from "react";

import SessionWorkspaceLoader from "./session-workspace-loader";

export default function TransmissionSessionPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-full flex-1 items-center justify-center bg-(--surface) text-(--on-surface-variant)">
          Loading…
        </div>
      }
    >
      <SessionWorkspaceLoader />
    </Suspense>
  );
}
