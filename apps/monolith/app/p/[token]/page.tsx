"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button, Input, Textarea } from "@swiss/ui";
import { decryptSharedPasteContent, type PasswordKdfParams } from "@/app/lib/share-crypto";

type SharedPastePayload = {
  token: string;
  visibility_mode: "public" | "password";
  encrypted_title: string;
  encrypted_content: string;
  share_wrap_nonce?: string;
  share_wrap_blob: string;
  password_kdf?: PasswordKdfParams;
  expires_at?: string;
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
  const [token, setToken] = useState("");
  const [payload, setPayload] = useState<SharedPastePayload | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { token: t } = await params;
        if (cancelled) return;
        setToken(t);
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

  if (busy && !payload) {
    return <div className="flex flex-1 items-center justify-center p-8">Loading paste...</div>;
  }
  if (error && !payload) {
    return <div className="flex flex-1 items-center justify-center p-8 text-red-400">{error}</div>;
  }
  if (!payload) {
    return <div className="flex flex-1 items-center justify-center p-8">Paste unavailable.</div>;
  }

  const unlocked = title !== "" || content !== "";
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 px-24 pb-24 pt-12">
      <h1 className="text-4xl font-bold">Shared Paste</h1>
      <p className="text-sm text-(--on-surface-variant)">Token: {token}</p>
      {payload.visibility_mode === "password" && !unlocked ? (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <form onSubmit={(e) => void unlock(e)} className="flex w-full max-w-lg flex-col gap-3 rounded-md border border-white/10 bg-black/20 p-6">
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
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <Input title="Title" size="lg" value={title} readOnly />
          <Textarea className="min-h-0 flex-1" value={content} readOnly />
        </div>
      )}
    </div>
  );
}
