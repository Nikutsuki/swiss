"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button, Input } from "@swiss/ui";
import { ArtifactHeroLayout } from "@/components/artifact-hero-layout";
import TextViewer from "@/components/TextViewer";
import {
  copyTextToClipboard,
  downloadTextAsFile,
  sanitizeDownloadBasename,
} from "@/app/lib/artifact-export";
import { decryptSharedPasteContent, type PasswordKdfParams } from "@/app/lib/share-crypto";
import { useArtifactExpiry } from "@/app/lib/use-artifact-expiry";
import { LuDownload } from "react-icons/lu";
import { MdContentCopy } from "react-icons/md";

type SharedPastePayload = {
  token: string;
  visibility_mode: "public" | "password";
  encrypted_title: string;
  encrypted_content: string;
  share_wrap_nonce?: string;
  share_wrap_blob: string;
  password_kdf?: PasswordKdfParams;
  expires_at?: string;
  created_at: string;
  owner_email: string;
  paste_id: string;
  is_encrypted: boolean;
};

async function fetchSharedPaste(token: string): Promise<SharedPastePayload> {
  const res = await fetch(`/api/shared-pastes/${token}`, {
    method: "GET",
    credentials: "omit",
  });
  if (!res.ok) {
    throw new Error(res.status === 410 ? "Paste is no longer available." : "Paste not found.");
  }
  return res.json() as Promise<SharedPastePayload>;
}

export default function SharedPastePage({ params }: { params: Promise<{ token: string }> }) {
  const [payload, setPayload] = useState<SharedPastePayload | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  const { expirationProgress, remainingTime } = useArtifactExpiry(
    payload?.created_at,
    payload?.expires_at ?? null,
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { token: t } = await params;
        if (cancelled) return;
        const data = await fetchSharedPaste(t);
        if (cancelled) return;
        setPayload(data);
        if (data.visibility_mode === "public") {
          const decrypted = await decryptSharedPasteContent({
            encrypted_title: data.encrypted_title,
            encrypted_content: data.encrypted_content,
            visibility_mode: data.visibility_mode,
            share_wrap_blob: data.share_wrap_blob,
          });
          if (cancelled) return;
          setTitle(decrypted.title);
          setContent(decrypted.content);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load paste");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params]);

  const unlock = async (e: FormEvent) => {
    e.preventDefault();
    if (!payload || payload.visibility_mode !== "password") return;
    setBusy(true);
    setError("");
    try {
      const decrypted = await decryptSharedPasteContent({
        encrypted_title: payload.encrypted_title,
        encrypted_content: payload.encrypted_content,
        visibility_mode: payload.visibility_mode,
        share_wrap_blob: payload.share_wrap_blob,
        share_wrap_nonce: payload.share_wrap_nonce,
        password_kdf: payload.password_kdf,
        password,
      });
      setTitle(decrypted.title);
      setContent(decrypted.content);
    } catch {
      setError("Invalid password or corrupted payload.");
    } finally {
      setBusy(false);
    }
  };

  const unlocked = title !== "" || content !== "";
  /** Copy/download export body only (not the title line). */
  const exportBody = content;

  const handleCopy = () => {
    void copyTextToClipboard(exportBody);
  };

  const handleDownload = () => {
    const base = sanitizeDownloadBasename(
      title || "artifact",
      payload?.paste_id.slice(0, 8) ?? "paste",
    );
    downloadTextAsFile(base, exportBody);
  };

  if (busy && !payload) {
    return <div className="flex flex-1 items-center justify-center p-8">Loading paste...</div>;
  }
  if (error && !payload) {
    return <div className="flex flex-1 items-center justify-center p-8 text-red-400">{error}</div>;
  }
  if (!payload) {
    return <div className="flex flex-1 items-center justify-center p-8">Paste unavailable.</div>;
  }

  return (
    <ArtifactHeroLayout
      expirationProgress={expirationProgress}
      artifactKindBadge={
        payload.is_encrypted ? "ENCRYPTED ARTIFACT" : "PLAINTEXT ARTIFACT"
      }
      isEncrypted={payload.is_encrypted}
      pasteIdFragment={payload.paste_id.split("-")[0]}
      headline={unlocked ? title : "Encrypted Paste"}
      originLabel="ORIGIN"
      originValue={payload.owner_email}
      createdDisplay={new Date(payload.created_at).toLocaleDateString()}
      expiresDisplay={remainingTime}
      actions={
        <>
          <Button
            type="button"
            variant="tertiary"
            size="md"
            bold={true}
            disabled={!unlocked || content === ""}
            className="gap-2 tracking-wider"
            onClick={() => handleCopy()}
          >
            <MdContentCopy size={16} />
            {!unlocked
              ? "UNLOCK TO COPY"
              : content === ""
                ? "NO BODY TO COPY"
                : "COPY RAW"}
          </Button>
          <Button
            type="button"
            variant="tertiary"
            size="md"
            bold={true}
            disabled={!unlocked || content === ""}
            className="gap-2 tracking-wider"
            onClick={() => handleDownload()}
          >
            <LuDownload size={16} />
            {!unlocked
              ? "UNLOCK TO DOWNLOAD"
              : content === ""
                ? "NO BODY"
                : "DOWNLOAD"}
          </Button>
        </>
      }
    >
      {payload.visibility_mode === "password" && !unlocked ? (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <form
            onSubmit={(e) => void unlock(e)}
            className="flex w-full max-w-lg flex-col gap-3 rounded-md border border-white/10 bg-black/20 p-6"
          >
            <Input
              title="Password"
              type="password"
              size="lg"
              placeholder="Enter paste password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button type="submit" size="md" bold={true} disabled={busy || password.length < 8}>
              {busy ? "UNLOCKING..." : "UNLOCK"}
            </Button>
            {error ? <p className="text-sm text-red-400">{error}</p> : null}
          </form>
        </div>
      ) : (
        <div className="flex min-h-0 flex-col gap-3 flex-1">
          <TextViewer text={content} fileName={title} fileType="auto" className="flex-1" />
        </div>
      )}
    </ArtifactHeroLayout>
  );
}
