"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MdDescription } from "react-icons/md";
import { Button } from "@swiss/ui";
import { fetchJson } from "@/app/lib/fetch-json";
import { formatArtifactTimestamp } from "@/app/lib/format-timestamp";
import type { SharedPasteMetadataResponse } from "@/src/types/backend";

function format_visibility(mode: string): string {
  return mode === "password" ? "Password" : "Public";
}

export default function PublicWorkspace() {
  const [rows, setRows] = useState<SharedPasteMetadataResponse[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchJson<SharedPasteMetadataResponse[]>(
        "/api/pastes/shared/recent",
      );
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load shared pastes");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex flex-col px-4 sm:px-8 lg:px-24 pt-8 sm:pt-12 lg:pt-24">
        <div className="mb-6 flex items-baseline flex-wrap gap-x-2">
          <h1 className="text-3xl sm:text-5xl lg:text-7xl font-bold">PUBLIC</h1>
          <h1 className="text-3xl sm:text-5xl lg:text-7xl font-bold text-(--security-emerald)">ARTIFACTS</h1>
        </div>
        <p className="mb-10 max-w-2xl text-(--on-surface-variant)">
          Shared artifacts. This page shows both publicly accessible and
          password-protected links.
        </p>
      </div>

      <div className="flex min-h-0 flex-1 gap-4 sm:gap-8 px-4 sm:px-8 lg:px-24 pb-8 sm:pb-12 lg:pb-24">
        <section className="flex min-h-0 w-full flex-col border border-white/10 bg-(--surface-container-low) rounded-xs">
          <div className="flex min-h-16 items-center justify-between border-b border-white/10 px-3 sm:px-4 py-3">
            <h2 className="text-sm font-semibold tracking-wide text-(--on-surface-variant)">
              Shared links
            </h2>
            <Button type="button" variant="ghost" size="sm" disabled={loading} onClick={() => void load()}>
              Refresh
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {loading ? (
              <p className="p-4 text-sm text-(--on-surface-variant)">Loading…</p>
            ) : error ? (
              <p className="p-4 text-sm text-[#ffb4ab]">{error}</p>
            ) : rows?.length === 0 ? (
              <p className="p-4 text-sm text-(--on-surface-variant)">
                No shared artifacts yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {rows?.map((row) => (
                  <li key={row.paste_id}>
                    <Link
                      href={`/p/${row.public_token}`}
                      className="block border border-transparent px-3 py-2 transition-colors hover:bg-(--surface-container-high) active:bg-(--surface-container-high)"
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-(--security-emerald)">
                          <MdDescription className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          {format_visibility(row.visibility_mode)}
                        </span>
                        <span className="truncate text-[10px] tracking-widest text-(--on-surface-variant)">
                          ARTIFACT #{row.public_token.slice(0, 8)}
                        </span>
                      </div>
                      <p className="truncate text-base font-black uppercase tracking-tight text-(--on-surface)">
                        {row.encrypted_title || row.paste_id.slice(0, 18)}
                      </p>
                      <p className="mt-1 truncate text-[10px] uppercase tracking-[0.18em] text-(--on-surface-variant)">
                        {formatArtifactTimestamp(row.created_at)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
