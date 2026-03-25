"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Input, Modal, Select, Textarea } from "@swiss/ui";
import { QRCodeSVG } from "qrcode.react";
import { bytesToBase64Url } from "@/app/lib/b64url";
import {
  getDeviceRecord,
  saveDeviceRecord,
  type DeviceRecord,
} from "@/app/lib/device-storage";
import {
  createEncryptedPastePayload,
  exportSpkiPublic,
  generateDeviceKeyPair,
  type DeviceKeyRow,
} from "@/app/lib/e2ee-paste";
import {
  createPasswordWrappedDek,
  createShareablePayload,
} from "@/app/lib/share-crypto";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || res.statusText);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

export default function NewPasteWorkspace() {
  const [device, setDevice] = useState<DeviceRecord | null>(null);
  const [idbReady, setIdbReady] = useState(false);
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupMessage, setSetupMessage] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [expiresAfterSeconds, setExpiresAfterSeconds] = useState<string>("");
  const [editorBusy, setEditorBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [encryptionOption, setEncryptionOption] = useState<"encrypted" | "public" | "password">("encrypted");
  const [sharePassword, setSharePassword] = useState("");
  const [shareResultUrl, setShareResultUrl] = useState("");

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
          setStatus("Could not open local encryption storage.");
          setIdbReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setupDevice = useCallback(async () => {
    if (!window.crypto?.subtle) {
      setStatus("Web Crypto is not available in this context.");
      return;
    }
    setSetupBusy(true);
    setSetupMessage("Generating device encryption keys…");
    setStatus("");
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
      setStatus("This device can create encrypted pastes.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Device setup failed");
    } finally {
      setSetupBusy(false);
      setSetupMessage("");
    }
  }, []);

  const savePaste = useCallback(async () => {
    setEditorBusy(true);
    setStatus("");
    try {
      let payload: {
        encrypted_title: string;
        encrypted_content: string;
        wrapped_deks: { device_key_id: string; wrapped_dek: string }[];
      };
      let rawDekB64 = "";
      if (encryptionOption === "encrypted") {
        if (!device) {
          throw new Error("Enable this device before creating encrypted pastes.");
        }
        const keys = await fetchJson<DeviceKeyRow[]>("/api/devices/keys");
        if (keys.length === 0) {
          throw new Error("No device keys on the server; set up a device first.");
        }
        payload = await createEncryptedPastePayload(title, content, keys);
      } else {
        const sharePayload = await createShareablePayload(title, content);
        rawDekB64 = sharePayload.raw_dek_b64;
        payload = {
          encrypted_title: sharePayload.encrypted_title,
          encrypted_content: sharePayload.encrypted_content,
          wrapped_deks: [],
        };
      }
      const sec =
        expiresAfterSeconds === "" ? null : Number(expiresAfterSeconds);
      if (sec !== null && (!Number.isFinite(sec) || sec <= 0)) {
        throw new Error("Invalid expiry selection.");
      }
      const body =
        sec !== null
          ? { ...payload, expires_in_seconds: Math.floor(sec) }
          : payload;
      const created = await fetchJson<{ id: string }>("/api/pastes", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (encryptionOption !== "encrypted") {
        const shareBody =
          encryptionOption === "public"
            ? {
              visibility_mode: "public",
              share_wrap_blob: rawDekB64,
              ...(sec !== null ? { expires_in_seconds: Math.floor(sec) } : {}),
            }
            : {
              visibility_mode: "password",
              ...(await createPasswordWrappedDek(rawDekB64, sharePassword)),
              ...(sec !== null ? { expires_in_seconds: Math.floor(sec) } : {}),
            };
        const shared = await fetchJson<{ url: string }>(`/api/pastes/${created.id}/share`, {
          method: "POST",
          body: JSON.stringify(shareBody),
        });
        const fullUrl = new URL(shared.url, window.location.origin).toString();
        setShareResultUrl(fullUrl);
        setStatus("Shared paste created.");
      } else {
        setStatus(`Created paste ${created.id}`);
      }
      setTitle("");
      setContent("");
      setSharePassword("");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Save failed");
    } finally {
      setEditorBusy(false);
    }
  }, [content, device, encryptionOption, expiresAfterSeconds, sharePassword, title]);

  if (!idbReady) {
    return (
      <div className="flex flex-1 items-center justify-center p-12 text-(--on-surface-variant)">
        Loading vault…
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <Modal
        isOpen={shareResultUrl.length > 0}
        onClose={() => setShareResultUrl("")}
        className="h-screen w-screen max-w-none rounded-none border-0 bg-black/70 backdrop:bg-black/75"
      >
        <div className="flex h-full w-full items-center justify-center">
          <div className="flex w-full max-w-2xl flex-col gap-5 rounded-xl border border-white/15 bg-(--surface-container-low) p-8">
            <h2 className="text-3xl font-bold">Shared Paste Link Ready</h2>
            <p className="text-sm text-(--on-surface-variant)">
              Share this link with anyone. Password-protected links still require the password.
            </p>
            <Input size="lg" value={shareResultUrl} readOnly />
            <div className="flex items-center justify-center rounded-lg bg-white p-4">
              {shareResultUrl ? <QRCodeSVG value={shareResultUrl} size={220} /> : null}
            </div>
            <div className="flex gap-3">
              <Button
                type="button"
                size="md"
                onClick={() => {
                  if (shareResultUrl) {
                    void navigator.clipboard.writeText(shareResultUrl);
                  }
                }}
              >
                COPY LINK
              </Button>
              <Button type="button" size="md" variant="ghost" onClick={() => setShareResultUrl("")}>
                CLOSE
              </Button>
            </div>
          </div>
        </div>
      </Modal>
      <div className="flex flex-col px-24 pt-24">
        <div className="mb-6 flex items-baseline">
          <h1 className="text-7xl font-bold">NEW&nbsp;</h1>
          <h1 className="text-7xl font-bold text-(--security-emerald)">
            ARTIFACT
          </h1>
        </div>
        <h2 className="mb-10 text-(--on-surface-variant)">
          Input raw data or code into the terminal below. Artifacts are processed
          with 256-bit encryption by default if stored in the secure vault.
        </h2>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-24 pb-24">
        {!device && (
          <p className="text-sm text-(--on-surface-variant)">
            Register this browser once so pastes can be encrypted for your
            devices.
          </p>
        )}
        <Input
          title="Paste Title"
          placeholder="Enter a title for your paste"
          size="lg"
          className="w-full"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Textarea
          placeholder="// Start typing here..."
          size="lg"
          className="min-h-0 w-full flex-1 resize-none"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        {encryptionOption === "password" ? (
          <Input
            title="Share password"
            placeholder="Enter password for shared paste"
            size="lg"
            className="w-full"
            type="password"
            value={sharePassword}
            onChange={(e) => setSharePassword(e.target.value)}
          />
        ) : null}
        <div className="flex justify-between pt-12">
          <div className="flex gap-4">
            <Select
              title="Encryption"
              size="lg"
              value={encryptionOption}
              onChange={(e) =>
                setEncryptionOption(
                  e.target.value as "encrypted" | "public" | "password",
                )
              }
              options={
                device
                  ? [{ value: "encrypted", label: "Encrypted for my devices" }, { value: "public", label: "No encryption (not recommended)" }, { value: "password", label: "Password-protected" }]
                  : [{ value: "public", label: "No encryption (not recommended)" }, { value: "password", label: "Password-protected" }]
              }
            />
            <Select
              title="Expires after"
              size="lg"
              value={expiresAfterSeconds}
              onChange={(e) => setExpiresAfterSeconds(e.target.value)}
              options={[
                { value: "", label: "Never" },
                { value: "3600", label: "1 hour" },
                { value: "86400", label: "1 day" },
                { value: "604800", label: "7 days" },
                { value: "2592000", label: "30 days" },
              ]}
            />
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            {!device && encryptionOption === "encrypted" ? (
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
                bold={true}
                disabled={editorBusy || (encryptionOption === "password" && sharePassword.length < 8)}
                onClick={() => void savePaste()}
              >
                {editorBusy ? "CREATING…" : "CREATE PASTE"}
              </Button>
            )}
          </div>
        </div>
        {status ? (
          <p className="text-sm text-(--on-surface-variant)">{status}</p>
        ) : null}
      </div>
    </div>
  );
}
