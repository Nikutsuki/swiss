"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@swiss/ui";
import { bytesToBase64Url } from "@/app/lib/b64url";
import { fetchJson } from "@/app/lib/fetch-json";
import { formatArtifactTimestamp } from "@/app/lib/format-timestamp";
import {
  getDeviceRecord,
  saveDeviceRecord,
  type DeviceRecord,
} from "@/app/lib/device-storage";
import {
  decryptTitleFromMetadata,
  exportSpkiPublic,
  generateDeviceKeyPair,
} from "@/app/lib/e2ee-paste";
import { isPasteExpiredClient } from "@/app/lib/paste-expiry";
import type {
  PasteMetadataResponse,
  SharedPasteMetadataResponse,
} from "@/src/types/backend";
import { MdDescription } from "react-icons/md";

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

export default function EncryptedMessagesWorkspace() {
  const router = useRouter();
  const [device, setDevice] = useState<DeviceRecord | null>(null);
  const [idbReady, setIdbReady] = useState(false);
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupMessage, setSetupMessage] = useState("");
  const [rows, setRows] = useState<ListRow[] | null>(null);
  const [listError, setListError] = useState("");
  const [listLoading, setListLoading] = useState(false);

  const loadPastes = useCallback(async (rec: DeviceRecord | null) => {
    setListLoading(true);
    setListError("");
    setRows(null);
    try {
      const url = rec
        ? `/api/pastes?${new URLSearchParams({ device_key_id: rec.deviceKeyId })}`
        : "/api/pastes";
      const [list, sharedRecent] = await Promise.all([
        fetchJson<PasteMetadataResponse[]>(url),
        fetchJson<SharedPasteMetadataResponse[]>(
          "/api/pastes/shared/recent",
        ).catch(() => []),
      ]);
      const sharedPasteIds = new Set(sharedRecent.map((row) => row.paste_id));
      const encryptedOnly = list.filter(
        (meta) => meta.vault_only || !sharedPasteIds.has(meta.paste_id),
      );
      const nextRows: ListRow[] = await Promise.all(
        encryptedOnly.map(async (meta) => {
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

  useEffect(() => {
    if (!idbReady) return;
    const o = new URLSearchParams(window.location.search).get("open");
    if (o) {
      window.history.replaceState({}, "", "/encrypted");
      router.replace(`/encrypted/${encodeURIComponent(o)}`);
    }
  }, [idbReady, router]);

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

  if (!idbReady) {
    return (
      <div className="flex flex-1 items-center justify-center p-12 text-(--on-surface-variant)">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex flex-col px-4 sm:px-8 lg:px-24 pt-8 sm:pt-12 lg:pt-24">
        <div className="mb-6 flex items-baseline flex-wrap gap-x-2">
          <h1 className="text-3xl sm:text-5xl lg:text-7xl font-bold">ENCRYPTED</h1>
          <h1 className="text-3xl sm:text-5xl lg:text-7xl font-bold text-(--security-emerald)">
            ARTIFACTS
          </h1>
        </div>
        <p className="mb-10 max-w-2xl text-(--on-surface-variant)">
          Open an artifact for a full-page view (same layout as shared links).
          Decryption uses keys for this browser only. For key coverage and
          re-wrapping, use the Vault page.
        </p>
      </div>

      <div className="flex min-h-0 flex-1 px-4 sm:px-8 lg:px-24 pb-8 sm:pb-12 lg:pb-24">
        <section className="flex min-h-0 w-full flex-col rounded-xs border border-white/10 bg-(--surface-container-low)">
          <div className="flex min-h-16 items-center justify-between border-b border-white/10 px-3 sm:px-4 py-3">
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
                Register to decrypt titles when keys exist for this device.
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
              <p className="p-4 text-sm text-(--on-surface-variant)">Loading…</p>
            ) : listError ? (
              <p className="p-4 text-sm text-[#ffb4ab]">{listError}</p>
            ) : rows?.length === 0 ? (
              <p className="p-4 text-sm text-(--on-surface-variant)">
                No pastes yet. Create one from the home screen.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {rows?.map((row) => {
                  const expired = isPasteExpiredClient(row);
                  const b64Label = truncateMiddle(row.encrypted_title);
                  const titleLine = expired
                    ? "EXPIRED (PAYLOAD REMOVED)"
                    : (row.decryptedTitle ?? `[CIPHERTEXT] ${b64Label}`).toUpperCase();
                  return (
                    <li key={row.paste_id}>
                      <Link
                        href={`/encrypted/${row.paste_id}`}
                        className="block border border-transparent px-3 py-2 transition-colors hover:bg-(--surface-container-high) active:bg-(--surface-container-high)"
                      >
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-(--security-emerald)">
                            <MdDescription
                              className="h-3.5 w-3.5 shrink-0"
                              aria-hidden
                            />
                            VAULT
                          </span>
                          <span className="truncate text-[10px] tracking-widest text-(--on-surface-variant)">
                            ARTIFACT #{row.paste_id.slice(0, 8)}
                          </span>
                        </div>
                        <p className="truncate text-base font-black uppercase tracking-tight text-(--on-surface)">
                          {titleLine}
                        </p>
                        <p className="mt-1 truncate text-[10px] uppercase tracking-[0.18em] text-(--on-surface-variant)">
                          {formatArtifactTimestamp(row.created_at)}
                        </p>
                        {row.expires_at ? (
                          <p className="mt-0.5 truncate text-[10px] text-(--on-surface-variant)">
                            Expires {row.expires_at}
                          </p>
                        ) : null}
                        {!row.wrapped_dek ? (
                          <p className="mt-1 text-[10px] text-(--on-surface-variant)">
                            No wrapped key for this device — ciphertext only on
                            open.
                          </p>
                        ) : null}
                        {row.titleError ? (
                          <p className="mt-1 text-[10px] text-[#ffb4ab]">
                            {row.titleError}
                          </p>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
