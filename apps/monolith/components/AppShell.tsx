"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";

const STORAGE_KEY = "monolith-sidebar-collapsed";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [sharedRouteHasSession, setSharedRouteHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    if (!pathname.startsWith("/p/")) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/pastes/shared/recent", {
          method: "GET",
          credentials: "include",
        });
        if (!cancelled) {
          setSharedRouteHasSession(res.ok);
        }
      } catch {
        if (!cancelled) {
          setSharedRouteHasSession(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const showSidebar = !pathname.startsWith("/p/") ? true : sharedRouteHasSession === true;

  return (
    <div className="flex h-full min-h-[calc(100vh-5rem)] w-full">
      {showSidebar ? (
        <Sidebar
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
        />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
