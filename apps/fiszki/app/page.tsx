import { Suspense } from "react";
import StudySetsWorkspace from "@/app/study-sets-workspace";

export default function HomePage() {
  return (
    <Suspense>
      <StudySetsWorkspace />
    </Suspense>
  );
}
