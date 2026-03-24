"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@swiss/ui";
import { bytesToBase64Url } from "@/app/lib/b64url";
import { fetchJson } from "@/app/lib/fetch-json";
import {
  getDeviceRecord,
  saveDeviceRecord,
  type DeviceRecord,
} from "@/app/lib/device-storage";
import {
  decryptFullPaste,
  decryptTitleFromMetadata,
  exportSpkiPublic,
  generateDeviceKeyPair,
} from "@/app/lib/e2ee-paste";
import { isPasteExpiredClient } from "@/app/lib/paste-expiry";
import type {
  PasteContentResponse,
  PasteMetadataResponse,
} from "@/src/types/backend";

function truncateMiddle(s: string, max = 48): string {
  if (s.length <= max) return s;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${s.slice(0, head)}…${s.slice(s.length - tail)}`;
}

type ListRow = PasteMetadataResponse & {
  decryptedTitle: string | null;
  titleError: string | null;
};

type DetailState =
  | { kind: "plain"; title: string; content: string }
  | {
      kind: "ciphertext";
      encrypted_title: string;
      encrypted_content: string;
      wrapped_dek: string;
    };

export default function EncryptedMessagesWorkspace() {
  const [device, setDevice] = useState<DeviceRecord | null>(null);
  const [idbReady, setIdbReady] = useState(false);
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupMessage, setSetupMessage] = useState("");
  const [rows, setRows] = useState<ListRow[] | null>(null);
  const [listError, setListError] = useState("");
  const [listLoading, setListLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [burnBusy, setBurnBusy] = useState(false);

  const loadPastes = useCallback(async (rec: DeviceRecord | null) => {
    setListLoading(true);
    setListError("");
    setRows(null);
    setSelectedId(null);
    setDetail(null);
    setDetailError("");
    try {
      const url = rec
        ? `/api/pastes?${new URLSearchParams({ device_key_id: rec.deviceKeyId })}`
        : "/api/pastes";
      const list = await fetchJson<PasteMetadataResponse[]>(url);
      const nextRows: ListRow[] = await Promise.all(
        list.map(async (meta) => {
          if (rec && meta.wrapped_dek && !isPasteExpiredClient(meta)) {
            try {
              const decryptedTitle = await decryptTitleFromMetadata(
                meta.encrypted_title,
                meta.wrapped_dek,
                rec.keyPair.privateKey,
              );
              return { ...meta, decryptedTitle, titleError: null };
            } catch (e) {
              return {
                ...meta,
                decryptedTitle: null,
                titleError:
                  e instanceof Error ? e.message : "Could not decrypt title",
              };
            }
          }
          return { ...meta, decryptedTitle: null, titleError: null };
        }),
      );
      setRows(nextRows);
    } catch (e) {
      setListError(
        e instanceof Error ? e.message : "Failed to load encrypted messages",
      );
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rec = await getDeviceRecord();
        if (!cancelled) {
          setDevice(rec);
          setIdbReady(true);
        }
      } catch {
        if (!cancelled) {
          setListError("Could not open local encryption storage.");
          setIdbReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!idbReady) return;
    void loadPastes(device);
  }, [device, idbReady, loadPastes]);

  const setupDevice = useCallback(async () => {
    if (!window.crypto?.subtle) {
      setListError("Web Crypto is not available in this context.");
      return;
    }
    setSetupBusy(true);
    setSetupMessage("Generating device encryption keys…");
    setListError("");
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
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Device setup failed");
    } finally {
      setSetupBusy(false);
      setSetupMessage("");
    }
  }, []);

  const openPaste = useCallback(
    async (pasteId: string) => {
      setSelectedId(pasteId);
      setDetail(null);
      setDetailError("");
      setDetailLoading(true);
      try {
        const url = device
          ? `/api/pastes/${pasteId}?${new URLSearchParams({
              device_key_id: device.deviceKeyId,
            })}`
          : `/api/pastes/${pasteId}`;
        const data = await fetchJson<PasteContentResponse>(url);
        if (device && data.wrapped_dek) {
          try {
            const { title, content } = await decryptFullPaste(
              data.encrypted_title,
              data.encrypted_content,
              data.wrapped_dek,
              device.keyPair.privateKey,
            );
            setDetail({ kind: "plain", title, content });
            return;
          } catch {
            /* show ciphertext below */
          }
        }
        setDetail({
          kind: "ciphertext",
          encrypted_title: data.encrypted_title,
          encrypted_content: data.encrypted_content,
          wrapped_dek: data.wrapped_dek,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Request failed";
        if (msg.includes("paste expired")) {
          setDetailError(
            "This paste has expired; the server removed the ciphertext.",
          );
        } else if (msg.includes("paste removed")) {
          setDetailError(
            "This paste was burned or removed; ciphertext is no longer on the server.",
          );
        } else {
          setDetailError(msg);
        }
      } finally {
        setDetailLoading(false);
      }
    },
    [device],
  );

  const burnSelected = useCallback(async () => {
    if (!selectedId) return;
    if (
      !globalThis.confirm(
        "Burn this paste? Ciphertext will be removed from the server. This cannot be undone.",
      )
    ) {
      return;
    }
    setBurnBusy(true);
    setDetailError("");
    try {
      await fetchJson(`/api/pastes/${selectedId}/burn`, { method: "POST" });
      await loadPastes(device);
      setSelectedId(null);
      setDetail(null);
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : "Burn failed");
    } finally {
      setBurnBusy(false);
    }
  }, [device, loadPastes, selectedId]);

  if (!idbReady) {
    return (
      <div className="flex flex-1 items-center justify-center p-12 text-(--on-surface-variant)">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex flex-col px-24 pt-24">
        <div className="mb-6 flex items-baseline flex-wrap gap-x-2">
          <h1 className="text-7xl font-bold">ENCRYPTED</h1>
          <h1 className="text-7xl font-bold text-(--security-emerald)">
            MESSAGES
          </h1>
        </div>
        <p className="mb-10 max-w-2xl text-(--on-surface-variant)">
          Raw ciphertext and optional decryption on this device. For key coverage
          and re-wrapping DEKs across devices, use the Vault page.
        </p>
      </div>

      <div className="flex min-h-0 flex-1 gap-8 px-24 pb-24">
        <section className="flex min-h-0 w-full max-w-md flex-col border border-white/10 bg-(--surface-container-low) rounded-xs">
          <div className="flex h-16 items-center justify-between border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-semibold tracking-wide text-(--on-surface-variant)">
              Artifacts
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={listLoading}
              onClick={() => void loadPastes(device)}
            >
              Refresh
            </Button>
          </div>
          {!device ? (
            <div className="space-y-3 border-b border-white/10 px-4 py-3">
              <p className="text-xs text-(--on-surface-variant)">
                No device key in this browser — you can still browse ciphertext.
                Register to decrypt when keys exist for this device.
              </p>
              <Button
                type="button"
                size="sm"
                disabled={setupBusy}
                onClick={() => void setupDevice()}
              >
                {setupBusy ? setupMessage || "Setting up…" : "Enable this device"}
              </Button>
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {listLoading ? (
              <p className="p-4 text-sm text-(--on-surface-variant)">
                Loading…
              </p>
            ) : listError ? (
              <p className="p-4 text-sm text-[#ffb4ab]">{listError}</p>
            ) : rows?.length === 0 ? (
              <p className="p-4 text-sm text-(--on-surface-variant)">
                No pastes yet. Create one from the home screen.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {rows?.map((row) => {
                  const active = selectedId === row.paste_id;
                  const expired = isPasteExpiredClient(row);
                  const b64Label = truncateMiddle(row.encrypted_title);
                  const label = expired
                    ? "Expired (payload removed)"
                    : (row.decryptedTitle ?? `[ciphertext] ${b64Label}`);
                  return (
                    <li key={row.paste_id}>
                      <button
                        type="button"
                        onClick={() => void openPaste(row.paste_id)}
                        className={[
                          "w-full rounded-xs px-3 py-3 text-left text-sm transition-colors",
                          active
                            ? "bg-white/10 text-(--on-surface)"
                            : "text-(--on-surface-variant) hover:bg-white/5",
                        ].join(" ")}
                      >
                        <span className="block font-medium break-all text-(--on-surface)">
                          {label}
                        </span>
                        <span className="mt-1 block font-mono text-xs opacity-70">
                          {row.paste_id}
                        </span>
                        <span className="mt-0.5 block text-xs opacity-60">
                          {row.created_at}
                        </span>
                        {row.expires_at ? (
                          <span className="mt-0.5 block text-xs opacity-60">
                            Expires {row.expires_at}
                          </span>
                        ) : null}
                        {!row.wrapped_dek ? (
                          <span className="mt-1 block text-xs text-(--on-surface-variant)">
                            No wrapped key for this device — ciphertext only.
                          </span>
                        ) : null}
                        {row.titleError ? (
                          <span className="mt-1 block text-xs text-[#ffb4ab]">
                            {row.titleError} — showing ciphertext label.
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col border border-white/10 bg-(--surface-container-low) rounded-xs">
          <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-semibold tracking-wide text-(--on-surface-variant)">
              Preview
            </h2>
            {selectedId ? (
              <Button
                type="button"
                variant="error"
                size="sm"
                disabled={detailLoading || burnBusy}
                onClick={() => void burnSelected()}
              >
                {burnBusy ? "Burning…" : "Burn paste"}
              </Button>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            {!selectedId ? (
              <p className="text-sm text-(--on-surface-variant)">
                Select an artifact. Payloads are base64url ciphertext unless this
                device can decrypt.
              </p>
            ) : detailLoading ? (
              <p className="text-sm text-(--on-surface-variant)">
                Loading…
              </p>
            ) : detailError ? (
              <p className="text-sm text-[#ffb4ab]">{detailError}</p>
            ) : detail?.kind === "plain" ? (
              <div className="flex flex-col gap-4">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-(--on-surface-variant)">
                    Title
                  </h3>
                  <p className="mt-1 text-lg font-medium">{detail.title}</p>
                </div>
                <div className="min-h-0 flex-1">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-(--on-surface-variant)">
                    Content
                  </h3>
                  <pre className="mt-2 max-h-[min(60vh,32rem)] overflow-auto whitespace-pre-wrap rounded-xs border border-white/10 bg-black/20 p-4 font-mono text-sm">
                    {detail.content}
                  </pre>
                </div>
              </div>
            ) : detail?.kind === "ciphertext" ? (
              <div className="flex flex-col gap-5">
                <p className="text-sm text-(--on-surface-variant)">
                  Encrypted payload (base64url). Decryption requires a wrapped key
                  for this device and matching private key material.
                </p>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-(--on-surface-variant)">
                    encrypted_title
                  </h3>
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-xs border border-white/10 bg-black/20 p-3 font-mono text-xs">
                    {detail.encrypted_title || "—"}
                  </pre>
                </div>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-(--on-surface-variant)">
                    encrypted_content
                  </h3>
                  <pre className="mt-2 max-h-[min(50vh,24rem)] overflow-auto whitespace-pre-wrap break-all rounded-xs border border-white/10 bg-black/20 p-3 font-mono text-xs">
                    {detail.encrypted_content || "—"}
                  </pre>
                </div>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-(--on-surface-variant)">
                    wrapped_dek
                  </h3>
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-xs border border-white/10 bg-black/20 p-3 font-mono text-xs">
                    {detail.wrapped_dek || "—"}
                  </pre>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
