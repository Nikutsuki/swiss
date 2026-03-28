"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@swiss/ui";
import { ArtifactHeroLayout } from "@/components/artifact-hero-layout";
import TextViewer from "@/components/TextViewer";
import { ciphertextExportText } from "@/app/lib/encrypted-paste-view";
import {
  copyTextToClipboard,
  downloadTextAsFile,
  sanitizeDownloadBasename,
} from "@/app/lib/artifact-export";
import { fetchJson } from "@/app/lib/fetch-json";
import {
  getDeviceRecord,
  type DeviceRecord,
} from "@/app/lib/device-storage";
import { decryptFullPaste } from "@/app/lib/e2ee-paste";
import { useArtifactExpiry } from "@/app/lib/use-artifact-expiry";
import type {
  PasteContentResponse,
  PasteMetadataResponse,
} from "@/src/types/backend";
import { LuDownload } from "react-icons/lu";
import { MdContentCopy } from "react-icons/md";

type DetailState =
  | { kind: "plain"; title: string; content: string }
  | {
      kind: "ciphertext";
      encrypted_title: string;
      encrypted_content: string;
      wrapped_dek: string;
    };

type Props = {
  params: Promise<{ pasteId: string }>;
};

export default function EncryptedPastePage({ params }: Props) {
  const router = useRouter();
  const [pasteId, setPasteId] = useState<string | null>(null);
  const [device, setDevice] = useState<DeviceRecord | null>(null);
  const [idbReady, setIdbReady] = useState(false);
  const [listMeta, setListMeta] = useState<PasteMetadataResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [detailError, setDetailError] = useState("");
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [burnBusy, setBurnBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { pasteId: id } = await params;
      if (cancelled) return;
      setPasteId(id);
    })();
    return () => {
      cancelled = true;
    };
  }, [params]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rec = await getDeviceRecord();
        if (!cancelled) setDevice(rec);
      } finally {
        if (!cancelled) setIdbReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadPaste = useCallback(
    async (id: string, dev: DeviceRecord | null) => {
      setDetailLoading(true);
      setDetailError("");
      setDetail(null);
      try {
        const listUrl = dev
          ? `/api/pastes?${new URLSearchParams({ device_key_id: dev.deviceKeyId })}`
          : "/api/pastes";
        const list = await fetchJson<PasteMetadataResponse[]>(listUrl);
        const meta = list.find((row) => row.paste_id === id) ?? null;
        setListMeta(meta);

        const contentUrl = dev
          ? `/api/pastes/${id}?${new URLSearchParams({ device_key_id: dev.deviceKeyId })}`
          : `/api/pastes/${id}`;
        const data = await fetchJson<PasteContentResponse>(contentUrl);

        if (dev && data.wrapped_dek) {
          try {
            const { title, content } = await decryptFullPaste(
              data.encrypted_title,
              data.encrypted_content,
              data.wrapped_dek,
              dev.keyPair.privateKey,
            );
            setDetail({ kind: "plain", title, content });
            return;
          } catch {
            /* ciphertext */
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
    [],
  );

  useEffect(() => {
    if (!idbReady || !pasteId) return;
    void loadPaste(pasteId, device);
  }, [idbReady, pasteId, device, loadPaste]);

  const { expirationProgress, remainingTime } = useArtifactExpiry(
    listMeta?.created_at,
    listMeta?.expires_at ?? null,
  );

  const pasteIdFragment = pasteId?.split("-")[0] ?? "—";

  const kindBadge = listMeta
    ? listMeta.is_encrypted
      ? "ENCRYPTED ARTIFACT"
      : "PLAINTEXT ARTIFACT"
    : "VAULT";

  let headline = "Loading…";
  if (detailError) {
    headline = "Could not load paste";
  } else if (!detailLoading && detail?.kind === "plain") {
    headline = detail.title.trim() || "Untitled artifact";
  } else if (!detailLoading && detail?.kind === "ciphertext") {
    headline = "Encrypted paste";
  }

  const createdDisplay = listMeta
    ? new Date(listMeta.created_at).toLocaleDateString()
    : "—";

  const exportReady =
    !!detail &&
    !detailError &&
    (detail.kind === "ciphertext" ||
      (detail.kind === "plain" && detail.content !== ""));

  const handleCopy = useCallback(() => {
    if (!detail) return;
    if (detail.kind === "plain") {
      void copyTextToClipboard(detail.content);
      return;
    }
    void copyTextToClipboard(ciphertextExportText(detail));
  }, [detail]);

  const handleDownload = useCallback(() => {
    if (!pasteId || !detail) return;
    if (detail.kind === "plain") {
      const base = sanitizeDownloadBasename(
        detail.title || "artifact",
        pasteIdFragment,
      );
      downloadTextAsFile(base, detail.content);
      return;
    }
    const base = sanitizeDownloadBasename(
      `ciphertext-${pasteIdFragment}`,
      pasteIdFragment,
    );
    downloadTextAsFile(base, ciphertextExportText(detail));
  }, [detail, pasteId, pasteIdFragment]);

  const handleBurn = useCallback(async () => {
    if (!pasteId) return;
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
      await fetchJson(`/api/pastes/${pasteId}/burn`, { method: "POST" });
      router.push("/encrypted");
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : "Burn failed");
    } finally {
      setBurnBusy(false);
    }
  }, [pasteId, router]);

  if (!idbReady || !pasteId) {
    return (
      <div className="flex flex-1 items-center justify-center p-12 text-(--on-surface-variant)">
        Loading…
      </div>
    );
  }

  return (
    <ArtifactHeroLayout
      expirationProgress={expirationProgress}
      artifactKindBadge={kindBadge}
      isEncrypted={listMeta?.is_encrypted ?? false}
      pasteIdFragment={pasteIdFragment}
      headline={headline}
      originLabel="ORIGIN"
      originValue="Your vault"
      createdDisplay={createdDisplay}
      expiresDisplay={remainingTime}
      actions={
        <>
          <Button
            type="button"
            variant="ghost"
            size="md"
            bold={true}
            className="tracking-wider"
            onClick={() => router.push("/encrypted")}
          >
            ← LIST
          </Button>
          <Button
            type="button"
            variant="error"
            size="md"
            bold={true}
            disabled={detailLoading || burnBusy}
            className="tracking-wider"
            onClick={() => void handleBurn()}
          >
            {burnBusy ? "BURNING…" : "BURN"}
          </Button>
          <Button
            type="button"
            variant="tertiary"
            size="md"
            bold={true}
            disabled={!exportReady || !!detailError}
            className="gap-2 tracking-wider"
            onClick={() => handleCopy()}
          >
            <MdContentCopy size={16} />
            {exportReady ? "COPY RAW" : "COPY"}
          </Button>
          <Button
            type="button"
            variant="tertiary"
            size="md"
            bold={true}
            disabled={!exportReady || !!detailError}
            className="gap-2 tracking-wider"
            onClick={() => handleDownload()}
          >
            <LuDownload size={16} />
            DOWNLOAD
          </Button>
        </>
      }
    >
      {!device ? (
        <p className="text-sm text-(--on-surface-variant)">
          No device key in this browser — showing ciphertext only. Enable this
          device from the{" "}
          <button
            type="button"
            className="text-(--security-emerald) underline"
            onClick={() => router.push("/encrypted")}
          >
            messages list
          </button>
          .
        </p>
      ) : null}
      {detailError ? (
        <p className="text-sm text-[#ffb4ab]">{detailError}</p>
      ) : detailLoading || !detail ? (
        <p className="text-sm text-(--on-surface-variant)">Loading…</p>
      ) : detail.kind === "plain" ? (
        <TextViewer
          text={detail.content}
          fileName={detail.title.trim() || "artifact"}
          fileType="auto"
          className="min-h-[min(70vh,36rem)] flex-1"
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <p className="text-sm text-(--on-surface-variant)">
            Ciphertext for this device (base64url). Register this browser or
            rewrap from another device to decrypt.
          </p>
          <TextViewer
            text={ciphertextExportText(detail)}
            fileName={`ciphertext-${pasteIdFragment}.txt`}
            fileType="text"
            className="min-h-[min(70vh,36rem)] flex-1"
          />
        </div>
      )}
    </ArtifactHeroLayout>
  );
}
