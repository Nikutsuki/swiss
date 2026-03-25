"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@swiss/ui";
import {
  MdLockOutline,
  MdLockPerson,
  MdNoteAdd,
  MdKeyboardDoubleArrowLeft,
  MdKeyboardDoubleArrowRight,
  MdDescription,
} from "react-icons/md";
import { FaGlobeAmericas, FaFireAlt } from "react-icons/fa";

const navLinkClass =
  "h-14 w-full min-w-0 shrink-0 items-center gap-0 overflow-hidden px-4 text-left text-sm tracking-[0.01em] transition-[background-color,color,gap,padding] duration-200";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

const items: NavItem[] = [
  { href: "/", label: "New paste", icon: <MdNoteAdd className="h-6 w-6 shrink-0" /> },
  { href: "/vault", label: "Vault", icon: <MdLockOutline className="h-6 w-6 shrink-0" /> },
  { href: "/public", label: "Public", icon: <FaGlobeAmericas className="h-6 w-6 shrink-0" /> },
  { href: "/encrypted", label: "Encrypted", icon: <MdLockPerson className="h-6 w-6 shrink-0" /> },
  { href: "/burned", label: "Burned", icon: <FaFireAlt className="h-6 w-6 shrink-0" /> },
];

type SidebarProps = {
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

type RecentSharedPaste = {
  paste_id: string;
  public_token: string;
  visibility_mode: "public" | "password";
  encrypted_title: string;
  created_at: string;
  expires_at?: string;
};

const SIDEBAR_EXPANDED_W = "clamp(14rem, 12.5vw, 20rem)";
const SIDEBAR_COLLAPSED_W = "4.25rem";

export default function Sidebar({ collapsed, onToggleCollapsed }: SidebarProps) {
  const pathname = usePathname();
  const [recentShared, setRecentShared] = useState<RecentSharedPaste[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/pastes/shared/recent", { credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as RecentSharedPaste[];
        if (!cancelled) {
          setRecentShared(data.slice(0, 5));
        }
      } catch {
        if (!cancelled) {
          setRecentShared([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const format_visibility = (mode: RecentSharedPaste["visibility_mode"]) =>
    mode === "password" ? "Password" : "Public";
  const format_timestamp = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const formatted = new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC",
    }).format(date);
    return `${formatted.replace(",", " //")} UTC`;
  };

  return (
    <aside
      style={{ width: collapsed ? SIDEBAR_COLLAPSED_W : SIDEBAR_EXPANDED_W }}
      className="flex h-full shrink-0 flex-col overflow-hidden border-r border-white/5 bg-(--surface-container-low) pt-5 transition-[width] duration-420 ease-[cubic-bezier(0.33,1,0.68,1)] motion-reduce:transition-none"
    >
      <div
        className={`overflow-hidden px-4 pb-4 transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none ${collapsed
          ? "pointer-events-none max-h-0 -translate-y-1 opacity-0"
          : "max-h-40 translate-y-0 opacity-100"
          }`}
        aria-hidden={collapsed}
      >
        <h3 className="px-2 font-semibold tracking-widest">ARTIFACT ARCHIVE</h3>
      </div>

      <nav
        className="flex min-h-0 flex-col overflow-y-auto overflow-x-hidden pb-2"
        aria-label="Archive sections"
      >
        {items.map(({ href, label, icon }) => {
          const active =
            href === "/"
              ? pathname === "/"
              : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Button
              key={href}
              asChild
              variant={active ? "fancy" : "ghost"}
              size="md"
              bold={active}
              className={`${navLinkClass} ${active ? "" : "text-(--on-surface) hover:bg-white/5"
                } rounded-none ${collapsed ? "justify-center px-2" : "justify-start gap-3"
                }`}
            >
              <Link href={href} title={collapsed ? label : undefined}>
                {icon}
                <span
                  className={`min-w-0 truncate transition-[opacity,transform,max-width] duration-300 ease-out motion-reduce:transition-none ${collapsed
                    ? "pointer-events-none max-w-0 -translate-x-1 opacity-0"
                    : "max-w-48 translate-x-0 opacity-100"
                    }`}
                >
                  {label}
                </span>
              </Link>
            </Button>
          );
        })}
      </nav>

      <div
        className={`px-4 pb-2 transition-[opacity,transform,max-height] duration-300 ease-out motion-reduce:transition-none ${collapsed
          ? "pointer-events-none max-h-0 -translate-y-1 opacity-0"
          : "max-h-96 translate-y-0 opacity-100"
          }`}
        aria-hidden={collapsed}
      >
        <h4 className="mx-2 mb-3 mt-2 text-xs tracking-widest text-(--on-surface-variant)">
          RECENT ARTIFACTS
        </h4>
        <div className="space-y-1">
          {recentShared.map((item) => {
            const href = `/p/${item.public_token}`;
            const selected = pathname === href;
            return (
              <Link
                key={item.paste_id}
                href={href}
                className={`block border px-3 py-2 transition-colors ${selected
                  ? "border-(--primary-fixed) bg-(--surface-container-high)"
                  : "border-transparent bg-transparent hover:bg-(--surface-container-high)"
                  }`}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-(--security-emerald)">
                    <MdDescription className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {format_visibility(item.visibility_mode)}
                  </span>
                  <span className="truncate text-[10px] tracking-widest text-(--on-surface-variant)">
                    ARTIFACT #{item.public_token.slice(0, 8)}
                  </span>
                </div>
                <p className="truncate text-base font-black uppercase tracking-tight text-(--on-surface)">
                  {item.encrypted_title || item.paste_id.slice(0, 18)}
                </p>
                <p className="mt-1 truncate text-[10px] uppercase tracking-[0.18em] text-(--on-surface-variant)">
                  {format_timestamp(item.created_at)}
                </p>
              </Link>
            );
          })}
          {recentShared.length === 0 ? (
            <div className="border border-dashed border-(--outline-variant) px-3 py-4 text-[11px] uppercase tracking-widest text-(--on-surface-variant)">
              No recent artifacts
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-auto shrink-0 border-t border-white/10 px-2 pb-4 pt-2">
        <Button
          type="button"
          variant="ghost"
          size="md"
          className="h-11 w-full justify-center gap-0 px-0 text-(--on-surface-variant) hover:text-(--on-surface)"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <MdKeyboardDoubleArrowRight className="h-5 w-5 shrink-0" aria-hidden />
          ) : (
            <MdKeyboardDoubleArrowLeft className="h-5 w-5 shrink-0" aria-hidden />
          )}
        </Button>
      </div>
    </aside>
  );
}
