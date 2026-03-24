"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@swiss/ui";
import { base64UrlToBytes, bytesToBase64Url } from "@/app/lib/b64url";
import { fetchJson } from "@/app/lib/fetch-json";
import {
  getDeviceRecord,
  saveDeviceRecord,
  type DeviceRecord,
} from "@/app/lib/device-storage";
import { isPasteExpiredClient } from "@/app/lib/paste-expiry";
import {
  exportSpkiPublic,
  generateDeviceKeyPair,
  rewrapDekForAllDevices,
  unwrapDek,
  type DeviceKeyRow,
} from "@/app/lib/e2ee-paste";
import type { DekCoverageResponse, PasteContentResponse } from "@/src/types/backend";

function shortId(id: string): string {
  if (id.length <= 14) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function deviceHasWrap(
  paste: DekCoverageResponse["pastes"][number],
  deviceKeyId: string,
): boolean {
  const wraps = Array.isArray(paste.device_key_ids_with_dek)
    ? paste.device_key_ids_with_dek
    : [];
  return wraps.includes(deviceKeyId);
}

function pasteRewrapAllowed(
  paste: DekCoverageResponse["pastes"][number],
  deviceKeyId: string,
): boolean {
  return (
    deviceHasWrap(paste, deviceKeyId) && !isPasteExpiredClient(paste)
  );
}

async function performRewrap(
  pasteId: string,
  keys: DeviceKeyRow[],
  dev: DeviceRecord,
): Promise<void> {
  const q = new URLSearchParams({ device_key_id: dev.deviceKeyId });
  const data = await fetchJson<PasteContentResponse>(
    `/api/pastes/${pasteId}?${q.toString()}`,
  );
  if (!data.wrapped_dek) {
    throw new Error(
      "No wrapped DEK for this browser — cannot unwrap the DEK here.",
    );
  }
  const dek = await unwrapDek(
    base64UrlToBytes(data.wrapped_dek),
    dev.keyPair.privateKey,
  );
  const wrapped = await rewrapDekForAllDevices(dek, keys);
  await fetchJson(`/api/pastes/${pasteId}/rewrap`, {
    method: "POST",
    body: JSON.stringify({ wrapped_deks: wrapped }),
  });
}

export default function VaultWorkspace() {
  const [device, setDevice] = useState<DeviceRecord | null>(null);
  const [idbReady, setIdbReady] = useState(false);
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupMessage, setSetupMessage] = useState("");
  const [coverage, setCoverage] = useState<DekCoverageResponse | null>(null);
  const [coverageLoading, setCoverageLoading] = useState(false);
  const [coverageError, setCoverageError] = useState("");
  const [status, setStatus] = useState("");
  const [rewrapPasteId, setRewrapPasteId] = useState<string | null>(null);
  const [rewrapAllBusy, setRewrapAllBusy] = useState(false);
  const [burningPasteId, setBurningPasteId] = useState<string | null>(null);
  const [viewPasteId, setViewPasteId] = useState<string | null>(null);
  const [sharedByPasteId, setSharedByPasteId] = useState<
    Record<string, { visibility_mode?: string; public_token?: string }>
  >({});

  const loadCoverage = useCallback(async () => {
    setCoverageLoading(true);
    setCoverageError("");
    try {
      const data = await fetchJson<DekCoverageResponse>(
        "/api/pastes/dek-coverage",
      );
      setCoverage(data);
      const sharedRows = await fetchJson<
        { paste_id: string; visibility_mode?: string; public_token?: string }[]
      >("/api/pastes/shared/recent");
      const nextSharedByPasteId: Record<
        string,
        { visibility_mode?: string; public_token?: string }
      > = {};
      for (const row of sharedRows) {
        nextSharedByPasteId[row.paste_id] = {
          visibility_mode: row.visibility_mode,
          public_token: row.public_token,
        };
      }
      setSharedByPasteId(nextSharedByPasteId);
    } catch (e) {
      setCoverageError(
        e instanceof Error ? e.message : "Failed to load DEK coverage",
      );
      setCoverage(null);
      setSharedByPasteId({});
    } finally {
      setCoverageLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rec = await getDeviceRecord();
        if (!cancelled) setDevice(rec);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setIdbReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!idbReady) return;
    void loadCoverage();
  }, [idbReady, loadCoverage]);

  const setupDevice = useCallback(async () => {
    if (!window.crypto?.subtle) {
      setCoverageError("Web Crypto is not available in this context.");
      return;
    }
    setSetupBusy(true);
    setSetupMessage("Generating device encryption keys…");
    try {
      const pair = await generateDeviceKeyPair();
      const spki = await exportSpkiPublic(pair.publicKey);
      setSetupMessage("Registering this device with the server…");
      const { device_key_id } = await fetchJson<{ device_key_id: string }>(
        "/api/devices",
        {
          method: "POST",
          body: JSON.stringify({
            public_key: bytesToBase64Url(spki),
          }),
        },
      );
      const rec: DeviceRecord = { deviceKeyId: device_key_id, keyPair: pair };
      await saveDeviceRecord(rec);
      setDevice(rec);
      setSetupMessage("");
      void loadCoverage();
    } catch (e) {
      setCoverageError(e instanceof Error ? e.message : "Device setup failed");
    } finally {
      setSetupBusy(false);
      setSetupMessage("");
    }
  }, [loadCoverage]);

  const rewrapOne = useCallback(
    async (pasteId: string) => {
      if (!device) {
        setStatus("Enable this device first — rewrap needs your private key.");
        return;
      }
      setRewrapPasteId(pasteId);
      setStatus("");
      try {
        const keys = await fetchJson<DeviceKeyRow[]>("/api/devices/keys");
        if (keys.length === 0) {
          throw new Error("No device public keys registered.");
        }
        await performRewrap(pasteId, keys, device);
        setStatus(`Rewrapped paste ${shortId(pasteId)} for all ${keys.length} device(s).`);
        await loadCoverage();
      } catch (e) {
        setStatus(e instanceof Error ? e.message : "Rewrap failed");
      } finally {
        setRewrapPasteId(null);
      }
    },
    [device, loadCoverage],
  );

  const burnOne = useCallback(
    async (pasteId: string) => {
      if (
        !globalThis.confirm(
          "Burn this paste? Ciphertext will be removed from the server immediately. This cannot be undone.",
        )
      ) {
        return;
      }
      setBurningPasteId(pasteId);
      setStatus("");
      try {
        await fetchJson(`/api/pastes/${pasteId}/burn`, { method: "POST" });
        setStatus(`Burned paste ${shortId(pasteId)}.`);
        await loadCoverage();
      } catch (e) {
        setStatus(e instanceof Error ? e.message : "Burn failed");
      } finally {
        setBurningPasteId(null);
      }
    },
    [loadCoverage],
  );

  const rewrapAll = useCallback(async () => {
    if (!device || !coverage) {
      setStatus("Need an enabled device and loaded coverage.");
      return;
    }
    const targets = coverage.pastes.filter((p) =>
      pasteRewrapAllowed(p, device.deviceKeyId),
    );
    if (targets.length === 0) {
      setStatus(
        "No eligible pastes (need a wrap on this device and non-expired payload).",
      );
      return;
    }
    setRewrapAllBusy(true);
    setStatus("");
    try {
      const keys = await fetchJson<DeviceKeyRow[]>("/api/devices/keys");
      if (keys.length === 0) {
        throw new Error("No device public keys registered.");
      }
      for (let i = 0; i < targets.length; i++) {
        setStatus(`Rewrapping ${i + 1} / ${targets.length}…`);
        await performRewrap(targets[i].paste_id, keys, device);
      }
      setStatus(`Finished rewrap for ${targets.length} paste(s).`);
      await loadCoverage();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Bulk rewrap failed");
    } finally {
      setRewrapAllBusy(false);
    }
  }, [coverage, device, loadCoverage]);

  const viewSharedPaste = useCallback(async (pasteId: string) => {
    setViewPasteId(pasteId);
    setStatus("");
    try {
      const recent = await fetchJson<
        { paste_id: string; public_token: string }[]
      >("/api/pastes/shared/recent");
      const existing = recent.find((row) => row.paste_id === pasteId);
      if (existing?.public_token) {
        window.open(`/p/${existing.public_token}`, "_blank", "noopener,noreferrer");
        return;
      }

      if (!device) {
        throw new Error("No existing share link found, and this device cannot create one.");
      }

      const q = new URLSearchParams({ device_key_id: device.deviceKeyId });
      const data = await fetchJson<PasteContentResponse>(
        `/api/pastes/${pasteId}?${q.toString()}`,
      );
      if (!data.wrapped_dek) {
        throw new Error(
          "This device cannot unwrap this paste yet. Rewrap from a device that already has access.",
        );
      }
      const dek = await unwrapDek(
        base64UrlToBytes(data.wrapped_dek),
        device.keyPair.privateKey,
      );
      const rawDek = new Uint8Array(await crypto.subtle.exportKey("raw", dek));
      const shared = await fetchJson<{ token: string; url: string }>(
        `/api/pastes/${pasteId}/share`,
        {
          method: "POST",
          body: JSON.stringify({
            visibility_mode: "public",
            share_wrap_blob: bytesToBase64Url(rawDek),
          }),
        },
      );
      window.open(shared.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to open paste");
    } finally {
      setViewPasteId(null);
    }
  }, [device]);

  if (!idbReady) {
    return (
      <div className="flex flex-1 items-center justify-center p-12 text-(--on-surface-variant)">
        Loading vault…
      </div>
    );
  }

  const rewrapableCount =
    device && coverage
      ? coverage.pastes.filter((p) =>
          pasteRewrapAllowed(p, device.deviceKeyId),
        ).length
      : 0;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex flex-col px-24 pt-24">
        <div className="mb-6 flex items-baseline">
          <h1 className="text-7xl font-bold">VAULT</h1>
        </div>
        <p className="mb-6 max-w-2xl text-(--on-surface-variant)">
          See which registered devices have a wrapped DEK per paste. A checkmark
          only means the server stores a wrap for that device key; opening ciphertext
          still requires the matching private key in a browser. Use rewrap from a
          device that already has a wrap to regenerate wraps for every registered
          device (e.g. after adding a new laptop). Burn removes ciphertext
          immediately; expired pastes are wiped on the next read and then appear
          under Burned.
        </p>
        <div className="mb-10 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            size="md"
            disabled={coverageLoading}
            onClick={() => void loadCoverage()}
          >
            Refresh coverage
          </Button>
          {!device ? (
            <Button
              type="button"
              size="md"
              disabled={setupBusy}
              onClick={() => void setupDevice()}
            >
              {setupBusy ? setupMessage || "Setting up…" : "Enable this device"}
            </Button>
          ) : (
            <Button
              type="button"
              size="md"
              disabled={
                rewrapAllBusy ||
                rewrapPasteId !== null ||
                rewrapableCount === 0
              }
              onClick={() => void rewrapAll()}
            >
              {rewrapAllBusy
                ? "Rewrapping all…"
                : `Rewrap all (${rewrapableCount})`}
            </Button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 px-24 pb-24">
        {device ? (
          <p className="mb-4 text-sm text-(--on-surface-variant)">
            This browser:{" "}
            <span className="font-mono text-(--on-surface)">
              {shortId(device.deviceKeyId)}
            </span>
          </p>
        ) : (
          <p className="mb-4 text-sm text-(--on-surface-variant)">
            Enable this device to rewrap — the private key never leaves the
            browser.
          </p>
        )}

        {status ? (
          <p className="mb-4 text-sm text-(--on-surface-variant)">{status}</p>
        ) : null}

        {coverageLoading ? (
          <p className="text-sm text-(--on-surface-variant)">Loading…</p>
        ) : coverageError ? (
          <p className="text-sm text-[#ffb4ab]">{coverageError}</p>
        ) : coverage && coverage.pastes.length === 0 ? (
          <p className="text-sm text-(--on-surface-variant)">
            No pastes yet. Create one from the home screen.
          </p>
        ) : coverage ? (
          <div className="overflow-x-auto rounded-xs border border-white/10 bg-(--surface-container-low)">
            <table className="w-full min-w-xl border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="sticky left-0 z-10 bg-(--surface-container-low) px-3 py-3 font-semibold text-(--on-surface-variant)">
                    Paste
                  </th>
                  <th className="px-2 py-3 font-semibold text-(--on-surface-variant)">
                    Created
                  </th>
                  <th className="px-2 py-3 font-semibold text-(--on-surface-variant)">
                    Expires
                  </th>
                  <th className="px-2 py-3 font-semibold text-(--on-surface-variant)">
                    Visibility
                  </th>
                  {coverage.devices.map((d) => {
                    const isLocal = device?.deviceKeyId === d.device_key_id;
                    return (
                      <th
                        key={d.device_key_id}
                        className={`px-2 py-3 text-center font-semibold ${
                          isLocal
                            ? "text-(--security-emerald)"
                            : "text-(--on-surface-variant)"
                        }`}
                        title={d.device_key_id}
                      >
                        {isLocal ? "This device" : shortId(d.device_key_id)}
                      </th>
                    );
                  })}
                  <th className="px-3 py-3 font-semibold text-(--on-surface-variant)">
                    Rewrap
                  </th>
                  <th className="px-3 py-3 font-semibold text-(--on-surface-variant)">
                    View
                  </th>
                  <th className="px-3 py-3 font-semibold text-(--on-surface-variant)">
                    Burn
                  </th>
                </tr>
              </thead>
              <tbody>
                {coverage.pastes.map((paste) => {
                  const canRewrap =
                    !!device && pasteRewrapAllowed(paste, device.deviceKeyId);
                  const burnBusy = burningPasteId === paste.paste_id;
                  return (
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
                      <td className="whitespace-nowrap px-2 py-2 text-(--on-surface-variant)">
                        {paste.expires_at ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-(--on-surface-variant)">
                        {sharedByPasteId[paste.paste_id]?.visibility_mode ===
                        "password"
                          ? "Password protected"
                          : sharedByPasteId[paste.paste_id]?.visibility_mode ===
                              "public"
                            ? "Public"
                            : "Not shared"}
                      </td>
                      {coverage.devices.map((d) => {
                        const has = deviceHasWrap(paste, d.device_key_id);
                        return (
                          <td
                            key={d.device_key_id}
                            className="px-2 py-2 text-center text-(--on-surface)"
                          >
                            {has ? "✓" : "—"}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={
                            !canRewrap ||
                            rewrapPasteId !== null ||
                            rewrapAllBusy
                          }
                          onClick={() => void rewrapOne(paste.paste_id)}
                        >
                          {rewrapPasteId === paste.paste_id
                            ? "Working…"
                            : "Rewrap"}
                        </Button>
                      </td>
                      <td className="px-3 py-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={
                            viewPasteId !== null ||
                            rewrapPasteId !== null ||
                            rewrapAllBusy
                          }
                          onClick={() => void viewSharedPaste(paste.paste_id)}
                        >
                          {viewPasteId === paste.paste_id ? "Opening…" : "View"}
                        </Button>
                      </td>
                      <td className="px-3 py-2">
                        <Button
                          type="button"
                          variant="error"
                          size="sm"
                          disabled={
                            burnBusy ||
                            rewrapPasteId !== null ||
                            rewrapAllBusy
                          }
                          onClick={() => void burnOne(paste.paste_id)}
                        >
                          {burnBusy ? "Burning…" : "Burn"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {coverage && coverage.devices.length === 0 ? (
          <p className="mt-6 text-sm text-(--on-surface-variant)">
            No device keys registered yet. Enable this device to create one.
          </p>
        ) : null}
      </div>
    </div>
  );
}
