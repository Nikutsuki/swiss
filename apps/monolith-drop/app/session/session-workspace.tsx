"use client";

import {
  DEFAULT_STUN_ONLY_RTC_CONFIG,
  attachFileReceiver,
  generateTransferId,
  mergeRtcConfig,
  parseIceServersFromJson,
  sendFileOverDataChannel,
  transferIdToHex,
  useP2PSignalingWhenReady,
} from "@swiss/webrtc-signaling";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MdComputer, MdDownload, MdHub, MdUpload } from "react-icons/md";

import {
  advanceTelemetry,
  initTelemetryState,
} from "@/src/utils/telemetry";

import {
  closeDropSession,
  createDropSession,
  getDropSession,
  joinDropSession,
} from "../lib/drop-api";
import { createStreamSaverSinkIfLarge } from "../lib/stream-saver-sink";

import { TransferCard } from "./transfer-card";
import type { TransferMap, TransferSession } from "./types";

const JOIN_STORAGE_PREFIX = "monolith-drop-join:";
const SELF_STORAGE_PREFIX = "monolith-drop-self:";
/** Maps join secret → session id after a successful guest join (idempotent recovery, Strict Mode). */
const INVITE_JOINED_PREFIX = "monolith-drop-invite-joined:";

function peerLabel(peerId: string): string {
  if (peerId.length <= 12) return peerId;
  return `${peerId.slice(0, 6)}…${peerId.slice(-4)}`;
}

type Role = "caller" | "callee";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB", "TB"];
  let i = -1;
  let v = n;
  do {
    v /= 1024;
    i++;
  } while (v >= 1024 && i < u.length - 1);
  return `${v.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

export default function SessionWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const joinSecretParam = searchParams.get("k")?.trim() || "";
  const sessionIdParam = searchParams.get("sid")?.trim() || "";

  const [phase, setPhase] = useState<
    "loading" | "need_create" | "host_poll" | "guest_ready" | "error"
  >("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [joinSecret, setJoinSecret] = useState<string | null>(null);
  const [peerId, setPeerId] = useState<string | null>(null);
  const [remotePeerId, setRemotePeerId] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);

  const [outgoing, setOutgoing] = useState<TransferMap>(() => new Map());
  const [incoming, setIncoming] = useState<TransferMap>(() => new Map());
  const [fileQueue, setFileQueue] = useState<File[]>([]);
  const [pauseSend, setPauseSend] = useState(false);

  const telemetryOutRef = useRef<Map<string, ReturnType<typeof initTelemetryState>>>(
    new Map(),
  );
  const telemetryInRef = useRef<Map<string, ReturnType<typeof initTelemetryState>>>(
    new Map(),
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const detachReceiverRef = useRef<(() => void) | null>(null);
  const createdOnce = useRef(false);
  /** Outgoing transfer ids (wire id hex) the user asked to stop; read by send loop via {@link sendFileOverDataChannel} `shouldCancel`. */
  const cancelOutgoingIdsRef = useRef(new Set<string>());

  const outgoingList = useMemo(() => [...outgoing.values()], [outgoing]);
  const incomingList = useMemo(() => [...incoming.values()], [incoming]);

  const requestCancelOutgoing = useCallback((tid: string) => {
    cancelOutgoingIdsRef.current.add(tid);
  }, []);

  const removeTransfer = useCallback((direction: "out" | "in", id: string) => {
    if (direction === "out") {
      telemetryOutRef.current.delete(id);
      setOutgoing((m) => {
        const n = new Map(m);
        n.delete(id);
        return n;
      });
    } else {
      telemetryInRef.current.delete(id);
      setIncoming((m) => {
        const n = new Map(m);
        n.delete(id);
        return n;
      });
    }
  }, []);

  const signalingBaseUrl = process.env.NEXT_PUBLIC_SIGNALING_WS_URL ?? "";
  const wsMixedContentWarning =
    typeof window !== "undefined" &&
    signalingBaseUrl.startsWith("ws://") &&
    window.location.protocol === "https:"
      ? "WebSocket uses `ws://` from an `https://` page; browsers may block it (mixed content)."
      : null;
  const rtcConfig = useMemo(() => {
    const extra = parseIceServersFromJson(process.env.NEXT_PUBLIC_WEBRTC_ICE_SERVERS);
    return mergeRtcConfig(DEFAULT_STUN_ONLY_RTC_CONFIG, extra);
  }, []);

  const applySessionRow = useCallback(
    (
      row: Awaited<ReturnType<typeof getDropSession>>,
      selfPeer: string,
      storedJoin: string | null,
    ) => {
      setSessionId(row.session_id);
      setExpiresAt(row.expires_at);
      setCreatedAt(row.created_at);
      if (storedJoin) {
        setJoinSecret(storedJoin);
      }
      setPeerId(selfPeer);
      if (selfPeer === row.peer_host) {
        setRole("caller");
        if (row.peer_guest) {
          setRemotePeerId(row.peer_guest);
          setPhase("guest_ready");
        } else {
          setRemotePeerId(null);
          setPhase("host_poll");
        }
        return;
      }
      if (row.peer_guest && selfPeer === row.peer_guest) {
        setRole("callee");
        setRemotePeerId(row.peer_host);
        setPhase("guest_ready");
        return;
      }
      setPhase("error");
      setErrorMsg("Your session token does not match this room.");
    },
    [],
  );

  /** Guest: join with ?k= then persist self peer id. */
  useEffect(() => {
    if (!joinSecretParam) {
      return;
    }
    let cancelled = false;

    const applyGuestSession = (
      full: Awaited<ReturnType<typeof getDropSession>>,
      selfPeerId: string,
    ) => {
      router.replace(`/session?sid=${encodeURIComponent(full.session_id)}`, { scroll: false });
      applySessionRow(full, selfPeerId, null);
    };

    const run = async () => {
      const inviteKey = `${INVITE_JOINED_PREFIX}${joinSecretParam}`;
      const cachedSid = sessionStorage.getItem(inviteKey);
      if (cachedSid) {
        const cachedSelf = sessionStorage.getItem(`${SELF_STORAGE_PREFIX}${cachedSid}`);
        if (cachedSelf) {
          try {
            const full = await getDropSession(cachedSid);
            if (cancelled) return;
            applyGuestSession(full, cachedSelf);
            return;
          } catch {
            sessionStorage.removeItem(inviteKey);
            /* fall through to fresh join */
          }
        }
      }

      try {
        const row = await joinDropSession(joinSecretParam);
        sessionStorage.setItem(inviteKey, row.session_id);
        sessionStorage.setItem(`${SELF_STORAGE_PREFIX}${row.session_id}`, row.peer_id);
        const full = await getDropSession(row.session_id);
        applyGuestSession(full, row.peer_id);
      } catch (e) {
        const status =
          e instanceof Error && "status" in e ? (e as { status?: number }).status : undefined;
        if (status === 409) {
          const sid = sessionStorage.getItem(inviteKey);
          const self = sid ? sessionStorage.getItem(`${SELF_STORAGE_PREFIX}${sid}`) : null;
          if (sid && self) {
            try {
              const full = await getDropSession(sid);
              applyGuestSession(full, self);
              return;
            } catch {
              /* show error below */
            }
          }
        }
        if (!cancelled) {
          setPhase("error");
          setErrorMsg(
            status === 409
              ? "This invite was already used."
              : "Could not join session (invalid or expired link).",
          );
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [joinSecretParam, router, applySessionRow]);

  /** Host or returning guest: load by ?sid= */
  useEffect(() => {
    if (joinSecretParam) {
      return;
    }
    if (!sessionIdParam) {
      setPhase("need_create");
      setErrorMsg(null);
      return;
    }

    const self = sessionStorage.getItem(`${SELF_STORAGE_PREFIX}${sessionIdParam}`);
    const storedJoin = sessionStorage.getItem(`${JOIN_STORAGE_PREFIX}${sessionIdParam}`);

    if (!self) {
      setPhase("error");
      setErrorMsg(
        "Missing session state. Start from home or open your invite link again.",
      );
      return;
    }

    let cancelled = false;
    const run = async () => {
      try {
        const row = await getDropSession(sessionIdParam);
        if (cancelled) return;
        applySessionRow(row, self, storedJoin);
      } catch {
        if (!cancelled) {
          setPhase("error");
          setErrorMsg("Could not load session (expired or unauthorized).");
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [joinSecretParam, sessionIdParam, applySessionRow]);

  /** Host polling until guest connects. */
  useEffect(() => {
    if (phase !== "host_poll" || !sessionIdParam || joinSecretParam) {
      return;
    }
    let cancelled = false;
    const poll = async () => {
      while (!cancelled) {
        try {
          const row = await getDropSession(sessionIdParam);
          if (cancelled) return;
          setExpiresAt(row.expires_at);
          if (row.peer_guest) {
            setRemotePeerId(row.peer_guest);
            setPhase("guest_ready");
            return;
          }
        } catch {
          if (!cancelled) {
            setPhase("error");
            setErrorMsg("Session polling failed or session expired.");
          }
          return;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, [phase, sessionIdParam, joinSecretParam]);

  const onCreateSession = useCallback(async () => {
    if (createdOnce.current) return;
    createdOnce.current = true;
    setErrorMsg(null);
    try {
      const row = await createDropSession();
      sessionStorage.setItem(`${JOIN_STORAGE_PREFIX}${row.session_id}`, row.join_secret);
      sessionStorage.setItem(`${SELF_STORAGE_PREFIX}${row.session_id}`, row.peer_id);
      setJoinSecret(row.join_secret);
      setSessionId(row.session_id);
      setPeerId(row.peer_id);
      setRemotePeerId(row.peer_guest ?? null);
      setRole("caller");
      setExpiresAt(row.expires_at);
      setPhase(row.peer_guest ? "guest_ready" : "host_poll");
      router.replace(`/session?sid=${encodeURIComponent(row.session_id)}`, { scroll: false });
    } catch {
      createdOnce.current = false;
      setPhase("error");
      setErrorMsg("Failed to create session.");
    }
  }, [router]);

  const { status, error: rtcError, dataChannel } = useP2PSignalingWhenReady({
    signalingBaseUrl,
    peerId: peerId ?? "",
    remotePeerId,
    role: role ?? "caller",
    rtcConfig,
    enabled:
      phase === "guest_ready" &&
      Boolean(peerId?.trim()) &&
      Boolean(remotePeerId?.trim()) &&
      Boolean(role),
  });

  useEffect(() => {
    if (!dataChannel) {
      detachReceiverRef.current?.();
      detachReceiverRef.current = null;
      return;
    }

    const detach = attachFileReceiver(dataChannel, {
      createStreamingSink: (_tid, meta) => createStreamSaverSinkIfLarge(meta),
      onMeta: (tid, meta) => {
        const now = performance.now();
        telemetryInRef.current.set(tid, initTelemetryState(now));
        setIncoming((prev) => {
          const n = new Map(prev);
          n.set(tid, {
            id: tid,
            direction: "in",
            name: meta.name,
            progress: 0,
            total: meta.size,
            currentSpeedBps: 0,
            averageSpeedBps: 0,
            etaSeconds: null,
            status: "receiving",
          });
          return n;
        });
      },
      onProgress: (tid, received, total) => {
        const now = performance.now();
        let prevState = telemetryInRef.current.get(tid);
        if (!prevState) {
          prevState = initTelemetryState(now);
          telemetryInRef.current.set(tid, prevState);
        }
        const { next, sample } = advanceTelemetry(prevState, received, total, now);
        telemetryInRef.current.set(tid, next);
        setIncoming((prev) => {
          const cur = prev.get(tid);
          if (!cur || cur.direction !== "in") return prev;
          const n = new Map(prev);
          n.set(tid, {
            ...cur,
            progress: received,
            total,
            currentSpeedBps: sample.currentSpeedBps,
            averageSpeedBps: sample.averageSpeedBps,
            etaSeconds: sample.etaSeconds,
            status: "receiving",
          });
          return n;
        });
      },
      onComplete: (tid, blob, meta) => {
        setIncoming((prev) => {
          const cur = prev.get(tid);
          if (!cur || cur.direction !== "in") return prev;
          const n = new Map(prev);
          n.set(tid, {
            ...cur,
            progress: cur.total,
            status: "done",
          });
          return n;
        });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = meta.name || "download";
        a.click();
        URL.revokeObjectURL(a.href);
      },
      onStreamComplete: (tid) => {
        setIncoming((prev) => {
          const cur = prev.get(tid);
          if (!cur || cur.direction !== "in") return prev;
          const n = new Map(prev);
          n.set(tid, {
            ...cur,
            progress: cur.total,
            status: "done",
          });
          return n;
        });
      },
      onAbort: (tid) => {
        telemetryInRef.current.delete(tid);
        setIncoming((prev) => {
          const cur = prev.get(tid);
          if (!cur || cur.direction !== "in") return prev;
          const n = new Map(prev);
          n.set(tid, { ...cur, status: "cancelled" });
          return n;
        });
      },
      onError: (tid, msg) => {
        if (tid) {
          setIncoming((prev) => {
            const cur = prev.get(tid);
            if (!cur || cur.direction !== "in") return prev;
            const n = new Map(prev);
            n.set(tid, { ...cur, status: "error" });
            return n;
          });
        }
        console.warn("file receiver", msg);
      },
    });
    detachReceiverRef.current = detach;
    return () => {
      detach();
      detachReceiverRef.current = null;
    };
  }, [dataChannel]);

  useEffect(() => {
    if (!dataChannel || fileQueue.length === 0) return;

    let cancelled = false;
    const q = [...fileQueue];
    setFileQueue([]);

    const run = async () => {
      const sendOne = async (file: File) => {
        if (cancelled) return;
        const wireId = generateTransferId();
        const tid = transferIdToHex(wireId);
        const now = performance.now();
        telemetryOutRef.current.set(tid, initTelemetryState(now));
        setOutgoing((prev) => {
          const n = new Map(prev);
          n.set(tid, {
            id: tid,
            direction: "out",
            name: file.name,
            progress: 0,
            total: file.size,
            currentSpeedBps: 0,
            averageSpeedBps: 0,
            etaSeconds: null,
            status: "sending",
          });
          return n;
        });
        try {
          await sendFileOverDataChannel(dataChannel, file, {
            transferId: wireId,
            isPaused: () => pauseSend,
            shouldCancel: () => cancelOutgoingIdsRef.current.has(tid),
            onProgress: (sent, total) => {
              const t = performance.now();
              let prevState = telemetryOutRef.current.get(tid);
              if (!prevState) {
                prevState = initTelemetryState(t);
                telemetryOutRef.current.set(tid, prevState);
              }
              const { next, sample } = advanceTelemetry(prevState, sent, total, t);
              telemetryOutRef.current.set(tid, next);
              setOutgoing((prev) => {
                const cur = prev.get(tid);
                if (!cur || cur.direction !== "out") return prev;
                const n = new Map(prev);
                n.set(tid, {
                  ...cur,
                  progress: sent,
                  total,
                  currentSpeedBps: sample.currentSpeedBps,
                  averageSpeedBps: sample.averageSpeedBps,
                  etaSeconds: sample.etaSeconds,
                  status: "sending",
                });
                return n;
              });
            },
          });
          cancelOutgoingIdsRef.current.delete(tid);
          setOutgoing((prev) => {
            const cur = prev.get(tid);
            if (!cur || cur.direction !== "out") return prev;
            const n = new Map(prev);
            n.set(tid, { ...cur, status: "done" });
            return n;
          });
        } catch (e) {
          cancelOutgoingIdsRef.current.delete(tid);
          const aborted = e instanceof DOMException && e.name === "AbortError";
          setOutgoing((prev) => {
            const cur = prev.get(tid);
            if (!cur || cur.direction !== "out") return prev;
            const n = new Map(prev);
            n.set(tid, { ...cur, status: aborted ? "cancelled" : "error" });
            return n;
          });
        }
      };

      await Promise.all(q.map((file) => sendOne(file)));
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [dataChannel, fileQueue, pauseSend]);

  const connectionLabel = useMemo(() => {
    if (phase === "host_poll") return "Waiting for guest";
    if (status === "connected" && dataChannel?.readyState === "open") {
      return "Data channel open";
    }
    if (status === "negotiating" || status === "signaling_open") return "Negotiating…";
    if (status === "connecting") return "Connecting…";
    if (status === "failed" || rtcError) return rtcError ?? "Connection failed";
    if (status === "closed") return "Closed";
    return "Idle";
  }, [phase, status, dataChannel?.readyState, rtcError]);

  const burnPct = useMemo(() => {
    if (!expiresAt) return 10;
    const end = new Date(expiresAt).getTime();
    const start = createdAt ? new Date(createdAt).getTime() : end - 3600_000;
    const now = Date.now();
    const span = Math.max(60_000, end - start);
    const left = Math.max(0, end - now);
    return Math.max(3, Math.min(100, (left / span) * 100));
  }, [expiresAt, createdAt]);

  const inviteUrl =
    typeof window !== "undefined" && joinSecret && sessionId
      ? `${window.location.origin}/session?k=${encodeURIComponent(joinSecret)}`
      : "";

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return;
    setFileQueue((q) => [...q, ...Array.from(files)]);
  };

  const terminate = async () => {
    detachReceiverRef.current?.();
    if (sessionId) {
      try {
        await closeDropSession(sessionId);
      } catch {
        /* ignore */
      }
      sessionStorage.removeItem(`${JOIN_STORAGE_PREFIX}${sessionId}`);
      sessionStorage.removeItem(`${SELF_STORAGE_PREFIX}${sessionId}`);
    }
    router.push("/");
  };

  if (phase === "need_create") {
    return (
      <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-8 bg-(--surface) px-6 py-20 font-(family-name:--font-inter) text-(--on-surface)">
        <h1 className="font-['Space_Grotesk'] text-3xl font-bold text-white">
          Start a transfer
        </h1>
        <p className="max-w-md text-center text-sm text-(--on-surface-variant)">
          Create an ephemeral session, then share the invite link with the recipient. Both sides
          must be signed in.
        </p>
        <button
          type="button"
          onClick={() => void onCreateSession()}
          className="bg-white px-8 py-3 text-xs font-bold tracking-widest text-(--on-primary) uppercase transition-all hover:bg-(--security-emerald) hover:text-(--on-primary)"
        >
          Create session
        </button>
        <Link
          href="/"
          className="text-xs tracking-widest text-(--on-surface-variant) uppercase underline"
        >
          Back home
        </Link>
        {errorMsg ? <p className="text-sm text-red-400">{errorMsg}</p> : null}
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-6 bg-(--surface) px-6 py-20">
        <p className="text-sm text-red-400">{errorMsg ?? "Something went wrong."}</p>
        <Link
          href="/session"
          className="text-xs font-bold tracking-widest text-(--security-emerald) uppercase underline"
        >
          Try again
        </Link>
      </div>
    );
  }

  if (phase === "loading" || !peerId || !role) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-(--surface) text-(--on-surface-variant)">
        Loading session…
      </div>
    );
  }

  const primaryOutgoing = outgoingList[outgoingList.length - 1];
  const primaryIncoming = incomingList[incomingList.length - 1];

  return (
    <div className="relative flex min-h-full w-full flex-1 flex-col bg-(--surface) pb-28 font-(family-name:--font-inter) text-(--on-surface) selection:bg-(--security-emerald) selection:text-(--on-primary)">
      <div className="pointer-events-none fixed top-18 left-0 z-40 w-full">
        <div
          className="drop-burn-progress transition-[width] duration-500"
          style={{ width: `${burnPct}%` }}
        />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <div className="flex w-full max-w-none flex-1 flex-col px-6 pt-10 md:px-10 lg:px-12 xl:px-16 2xl:px-20">
        <div className="grid w-full min-w-0 flex-1 grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-10 xl:gap-12">
          <aside className="flex flex-col gap-10 lg:col-span-2">
            <section>
              <h2 className="mb-4 font-['Space_Grotesk'] text-3xl font-bold tracking-tight text-white">
                Secure Hub
              </h2>
              <p className="text-sm leading-relaxed text-(--on-surface-variant)">
                Bidirectional P2P over WebRTC DataChannels. Signaling only exchanges ICE/SDP; file
                bytes go peer-to-peer (DTLS encrypted).
              </p>
            </section>

            <section className="space-y-6">
              <div>
                <span className="mb-2 block text-[10px] tracking-widest text-(--on-surface-variant) uppercase">
                  Protocol Status
                </span>
                <div className="flex items-center gap-3 bg-(--surface-container-lowest) p-4">
                  <div
                    className={`h-2 w-2 shrink-0 rounded-full bg-(--security-emerald) ${phase === "host_poll" ? "animate-pulse" : ""}`}
                    aria-hidden
                  />
                  <span className="text-xs tracking-wide text-white">{connectionLabel}</span>
                </div>
              </div>
              <div className="space-y-3 text-[10px] tracking-widest text-(--on-surface-variant) uppercase">
                <div className="flex justify-between">
                  <span>Signaling</span>
                  <span className="text-(--security-emerald)">
                    {signalingBaseUrl ? "configured" : "missing env"}
                  </span>
                </div>
                {wsMixedContentWarning ? (
                  <div className="text-[10px] tracking-wide text-(--on-surface-variant) uppercase">
                    {wsMixedContentWarning}
                  </div>
                ) : null}
                <div className="flex justify-between">
                  <span>Role</span>
                  <span className="text-(--security-emerald)">{role}</span>
                </div>
              </div>
            </section>

            <section>
              <span className="mb-4 block text-[10px] tracking-widest text-(--on-surface-variant) uppercase">
                Invite link
              </span>
              {inviteUrl ? (
                <div className="space-y-3 break-all bg-(--surface-container-low) p-4 font-mono text-[10px] leading-relaxed text-(--security-emerald)">
                  {inviteUrl}
                  <div className="flex justify-center rounded-lg bg-white p-3">
                    <QRCodeSVG
                      value={inviteUrl}
                      size={160}
                      level="M"
                      title="Scan to open the invite link on another device"
                    />
                  </div>
                  <button
                    type="button"
                    className="block w-full border border-(--outline-variant)/30 py-2 text-[9px] text-white uppercase hover:bg-(--surface-container-high)"
                    onClick={() => void navigator.clipboard.writeText(inviteUrl)}
                  >
                    Copy link
                  </button>
                </div>
              ) : (
                <p className="text-[10px] text-(--on-surface-variant)">
                  Invite links are shown for the host after creating a session.
                </p>
              )}
            </section>
          </aside>

          <div className="flex min-h-0 min-w-0 flex-col gap-8 lg:col-span-10">
            <div className="grid min-h-[min(58vh,36rem)] grid-cols-1 gap-4 md:grid-cols-2 md:min-h-[min(52vh,32rem)] lg:min-h-[min(62vh,40rem)] lg:auto-rows-fr">
              <div
                className="group relative flex h-full min-h-72 cursor-pointer md:min-h-0"
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onDragEnter={(e) => {
                  e.preventDefault();
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleFiles(e.dataTransfer.files);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
                }}
              >
                <div className="pointer-events-none absolute inset-0 bg-(--security-emerald)/5 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                <div className="relative flex h-full min-h-72 w-full flex-col items-center justify-center overflow-hidden border border-(--outline-variant)/10 bg-(--surface-container-lowest) p-8 text-center md:min-h-0">
                  <div
                    className="pointer-events-none absolute inset-0 opacity-5"
                    style={{
                      backgroundImage:
                        "radial-gradient(var(--security-emerald) 1px, transparent 1px)",
                      backgroundSize: "20px 20px",
                    }}
                  />
                  <div className="relative z-10 flex flex-col items-center">
                    <div className="mb-4 rounded-full bg-(--surface-container-high) p-4 transition-all duration-300 group-hover:bg-(--security-emerald) group-hover:text-(--on-primary)">
                      <MdUpload className="text-4xl" aria-hidden />
                    </div>
                    <h3 className="mb-2 font-['Space_Grotesk'] text-lg font-bold tracking-tighter text-white uppercase">
                      Local Transmit
                    </h3>
                    <p className="mx-auto max-w-md text-xs text-(--on-surface-variant) md:max-w-lg">
                      Drop files or click to queue. Sends when the data channel is open.
                    </p>
                    {fileQueue.length > 0 ? (
                      <div className="mt-3 w-full max-w-md space-y-2">
                        <p className="text-[10px] text-(--security-emerald)">
                          {fileQueue.length} file(s) queued — sends when the data channel opens
                        </p>
                        <ul className="max-h-32 space-y-1 overflow-y-auto text-left">
                          {fileQueue.map((f, i) => (
                            <li
                              key={`${f.name}-${f.size}-${i}`}
                              className="flex items-center justify-between gap-2 bg-(--surface-container-high)/40 px-2 py-1"
                            >
                              <span className="min-w-0 truncate font-mono text-[9px] text-white">
                                {f.name}
                              </span>
                              <button
                                type="button"
                                className="shrink-0 text-[9px] font-bold tracking-tighter text-(--on-surface-variant) uppercase underline-offset-2 hover:text-red-300 hover:underline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setFileQueue((q) => q.filter((_, j) => j !== i));
                                }}
                              >
                                Remove
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                  <div className="pointer-events-none absolute top-0 left-0 h-6 w-6 border-t-2 border-l-2 border-(--security-emerald)/20" />
                </div>
              </div>

              <div className="relative flex h-full min-h-72 md:min-h-0">
                <div className="relative flex h-full min-h-72 w-full flex-col items-center justify-center overflow-hidden border border-(--outline-variant)/10 bg-(--surface-container-lowest) p-8 text-center md:min-h-0">
                  <div
                    className="drop-scan-line pointer-events-none absolute inset-0 opacity-20"
                    aria-hidden
                  />
                  <div className="relative z-10 flex w-full max-h-[min(40vh,20rem)] flex-col items-center overflow-y-auto">
                    <div className="mb-4 shrink-0 rounded-full bg-(--security-emerald)/10 p-4 text-(--security-emerald)">
                      <MdDownload className="text-4xl" aria-hidden />
                    </div>
                    <h3 className="mb-2 shrink-0 font-['Space_Grotesk'] text-lg font-bold tracking-tighter text-white uppercase">
                      Remote Receive
                    </h3>
                    <div className="flex w-full max-w-md flex-col gap-2 md:max-w-none md:px-4">
                      {incomingList.length === 0 ? (
                        <p className="mt-2 text-[10px] tracking-widest text-(--on-surface-variant) uppercase">
                          Ready for incoming files
                        </p>
                      ) : (
                        incomingList.slice(-12).map((t) => (
                          <div
                            key={t.id}
                            className="flex items-center justify-between bg-(--surface-container-high)/50 p-3"
                          >
                            <span className="mr-4 truncate font-mono text-[10px] text-white uppercase">
                              {t.name}
                            </span>
                            <span className="text-[10px] font-bold text-(--security-emerald)">
                              {t.status === "done"
                                ? "DONE"
                                : t.status === "error"
                                  ? "ERR"
                                  : t.status === "cancelled"
                                    ? "STOPPED"
                                    : `${Math.round((t.progress / Math.max(t.total, 1)) * 100)}%`}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="pointer-events-none absolute right-0 bottom-0 h-6 w-6 border-r-2 border-b-2 border-(--security-emerald)/20" />
                </div>
              </div>
            </div>

            <div className="border border-(--outline-variant)/10 bg-(--surface-container-low) p-8">
              <div className="flex flex-col gap-8">
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <div>
                    <span className="mb-3 inline-block bg-(--primary-fixed) px-2 py-0.5 text-[9px] font-bold tracking-tighter text-white uppercase">
                      Outgoing transfers
                    </span>
                    <div
                      className="max-h-[min(50vh,28rem)] space-y-4 overflow-y-auto pr-1"
                      data-testid="outgoing-transfer-list"
                    >
                      {outgoingList.length === 0 ? (
                        <p className="text-[10px] text-(--on-surface-variant)">
                          No active uploads — queue files on the left.
                        </p>
                      ) : (
                        outgoingList.map((t: TransferSession) =>
                          t.direction === "out" ? (
                            <TransferCard
                              key={t.id}
                              transfer={t}
                              variant="upload"
                              onDismiss={() => removeTransfer("out", t.id)}
                              onStop={
                                t.status === "sending"
                                  ? () => requestCancelOutgoing(t.id)
                                  : undefined
                              }
                            />
                          ) : null,
                        )
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="mb-3 inline-block border border-(--outline-variant) px-2 py-0.5 text-[9px] font-bold tracking-tighter text-(--on-surface-variant) uppercase">
                      Incoming transfers
                    </span>
                    <div
                      className="max-h-[min(50vh,28rem)] space-y-4 overflow-y-auto pr-1"
                      data-testid="incoming-transfer-list"
                    >
                      {incomingList.length === 0 ? (
                        <p className="text-[10px] text-(--on-surface-variant)">
                          No incoming files yet.
                        </p>
                      ) : (
                        incomingList.map((t: TransferSession) =>
                          t.direction === "in" ? (
                            <TransferCard
                              key={t.id}
                              transfer={t}
                              variant="download"
                              onDismiss={() => removeTransfer("in", t.id)}
                            />
                          ) : null,
                        )
                      )}
                    </div>
                  </div>
                </div>

                <div className="border-t border-(--outline-variant)/10 pt-6 opacity-90">
                  <p className="mb-4 text-[10px] tracking-widest text-(--on-surface-variant) uppercase">
                    Latest activity
                  </p>
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div>
                      <h4 className="font-['Space_Grotesk'] text-sm font-bold text-white">
                        {primaryOutgoing?.name ?? "No active upload"}
                      </h4>
                      <p className="text-[10px] text-(--on-surface-variant)">
                        {primaryOutgoing && primaryOutgoing.direction === "out"
                          ? `${formatBytes(primaryOutgoing.progress)} / ${formatBytes(primaryOutgoing.total)}`
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <h4 className="font-['Space_Grotesk'] text-sm font-bold text-white">
                        {primaryIncoming?.name ?? "No active incoming file"}
                      </h4>
                      <p className="text-[10px] text-(--on-surface-variant)">
                        {primaryIncoming && primaryIncoming.direction === "in"
                          ? `${formatBytes(primaryIncoming.progress)} / ${formatBytes(primaryIncoming.total)}`
                          : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex flex-wrap gap-4">
                <button
                  type="button"
                  onClick={() => setPauseSend((p) => !p)}
                  className="bg-white px-8 py-3 text-xs font-bold tracking-widest text-(--on-primary) uppercase transition-all hover:bg-(--security-emerald) hover:text-(--on-primary) active:scale-95"
                >
                  {pauseSend ? "Resume uploads" : "Pause uploads"}
                </button>
                <button
                  type="button"
                  onClick={() => void terminate()}
                  className="border border-(--outline-variant)/20 px-8 py-3 text-xs font-bold tracking-widest text-white uppercase transition-all hover:bg-(--surface-container-high) active:scale-95"
                >
                  Terminate session
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex items-center gap-6 border border-(--outline-variant)/5 bg-(--surface-container-lowest) p-6">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center bg-(--surface-container-high)">
                  <MdComputer className="text-2xl text-(--security-emerald)" aria-hidden />
                </div>
                <div>
                  <span className="mb-1 block text-[10px] tracking-widest text-(--on-surface-variant) uppercase">
                    This peer
                  </span>
                  <span className="font-['Space_Grotesk'] font-bold text-white">
                    {peerId ? peerLabel(peerId) : "—"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-6 border border-(--outline-variant)/5 bg-(--surface-container-lowest) p-6">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center bg-(--security-emerald)/10">
                  <MdHub className="text-2xl text-(--security-emerald)" aria-hidden />
                </div>
                <div>
                  <span className="mb-1 block text-[10px] tracking-widest text-(--on-surface-variant) uppercase">
                    Remote peer
                  </span>
                  <span className="font-['Space_Grotesk'] font-bold text-white">
                    {remotePeerId ? peerLabel(remotePeerId) : phase === "host_poll" ? "Waiting…" : "—"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
