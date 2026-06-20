"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@swiss/ui";
import { fetchJson } from "@/app/lib/fetch-json";
import type { BurnedPastesResponse } from "@/src/types/backend";

function shortId(id: string): string {
  if (id.length <= 14) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function reasonLabel(reason: string): string {
  if (reason === "expired") return "Expired";
  if (reason === "burned") return "Burned manually";
  return "Removed";
}

function pasteHadDeviceWrap(
  paste: BurnedPastesResponse["pastes"][number],
  deviceKeyID: string,
): boolean {
  const wraps = Array.isArray(paste.device_key_ids_with_dek)
    ? paste.device_key_ids_with_dek
    : [];
  return wraps.includes(deviceKeyID);
}

export default function BurnedWorkspace() {
  const [data, setData] = useState<BurnedPastesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchJson<BurnedPastesResponse>("/api/pastes/burned");
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex flex-col px-4 sm:px-8 lg:px-24 pt-8 sm:pt-12 lg:pt-24">
        <div className="mb-6 flex items-baseline flex-wrap gap-x-2">
          <h1 className="text-3xl sm:text-5xl lg:text-7xl font-bold">BURNED</h1>
        </div>
        <p className="mb-6 max-w-2xl text-(--on-surface-variant)">
          Artifacts with ciphertext removed — after expiry (lazy wipe on read) or
          after you burned them from the vault. Rows stay for your records; title
          and content are gone from the server.
        </p>
        <div className="mb-6 sm:mb-10">
          <Button
            type="button"
            variant="secondary"
            size="md"
            disabled={loading}
            onClick={() => void load()}
          >
            Refresh
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 px-4 sm:px-8 lg:px-24 pb-8 sm:pb-12 lg:pb-24">
        {loading ? (
          <p className="text-sm text-(--on-surface-variant)">Loading…</p>
        ) : error ? (
          <p className="text-sm text-[#ffb4ab]">{error}</p>
        ) : data && data.pastes.length === 0 ? (
          <p className="text-sm text-(--on-surface-variant)">
            Nothing here yet. Expired or burned pastes appear after ciphertext is
            wiped.
          </p>
        ) : data ? (
          <div className="overflow-x-auto rounded-xs border border-white/10 bg-(--surface-container-low)">
            <table className="w-full min-w-3xl sm:min-w-2xl border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="sticky left-0 z-10 bg-(--surface-container-low) px-3 py-3 font-semibold text-(--on-surface-variant)">
                    Paste
                  </th>
                  <th className="px-2 py-3 font-semibold text-(--on-surface-variant)">
                    Created
                  </th>
                  <th className="px-2 py-3 font-semibold text-(--on-surface-variant)">
                    Reason
                  </th>
                  <th className="px-2 py-3 font-semibold text-(--on-surface-variant)">
                    Burned at
                  </th>
                  <th className="px-2 py-3 font-semibold text-(--on-surface-variant)">
                    Had expiry
                  </th>
                  {data.devices.map((d) => (
                    <th
                      key={d.device_key_id}
                      className="px-2 py-3 text-center font-semibold text-(--on-surface-variant)"
                      title={d.device_key_id}
                    >
                      {shortId(d.device_key_id)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.pastes.map((paste) => (
                  <tr
                    key={paste.paste_id}
                    className="border-b border-white/5 last:border-0"
                  >
                    <td className="sticky left-0 z-10 max-w-48 bg-(--surface-container-low) px-3 py-2 font-mono text-xs break-all text-(--on-surface)">
                      {paste.paste_id}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-(--on-surface-variant)">
                      {paste.created_at}
                    </td>
                    <td className="px-2 py-2 text-(--on-surface)">
                      {reasonLabel(paste.reason)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-(--on-surface-variant)">
                      {paste.burned_at ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-(--on-surface-variant)">
                      {paste.expires_at ?? "—"}
                    </td>
                    {data.devices.map((d) => {
                      const had = pasteHadDeviceWrap(paste, d.device_key_id);
                      return (
                        <td
                          key={d.device_key_id}
                          className="px-2 py-2 text-center text-(--on-surface)"
                        >
                          {had ? "✓" : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
