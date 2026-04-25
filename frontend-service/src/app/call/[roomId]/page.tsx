"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ZegoExpressEngine } from "zego-express-engine-webrtc";
import { useAuth } from "@/hooks/useAuth";
import { buildHostedCallUrl, getInviteCodeFromRoomId } from "@/lib/callRoom";
import { cn } from "@/lib/utils";

type RemoteTile = { streamId: string };

/**
 * ZEGOCLOUD hosted room page.
 *
 * URL:
 * - /call/<roomId>?mode=video|audio
 */
export default function ZegoCallRoomPage() {
  const { user } = useAuth();
  const params = useParams();
  const searchParams = useSearchParams();

  const roomId = String((params as any)?.roomId || "").trim();
  const mode = String(searchParams?.get("mode") || "video").toLowerCase() === "audio" ? "audio" : "video";

  const userId = String(user?.id || "").trim();
  const userName = String(user?.username || userId || "User").trim();
  const inviteCode = useMemo(() => getInviteCodeFromRoomId(roomId), [roomId]);

  const localRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<ZegoExpressEngine | null>(null);
  const localStreamRef = useRef<any>(null);
  const publishedStreamIdRef = useRef<string>("");
  const remoteStreamsRef = useRef<Record<string, any>>({});

  const [status, setStatus] = useState<
    "idle" | "getting_token" | "initializing" | "logging_in" | "publishing" | "waiting_remote" | "connected" | "error"
  >("idle");
  const [error, setError] = useState<string>("");
  const [needsUserGesture, setNeedsUserGesture] = useState(false);
  const [remoteTiles, setRemoteTiles] = useState<RemoteTile[]>([]);
  const [copiedState, setCopiedState] = useState<"" | "code" | "link">("");
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [isCameraEnabled, setIsCameraEnabled] = useState(mode === "video");
  const reconnectingRef = useRef(false);

  const server = useMemo(() => "wss://webliveroom-api.zego.im/ws", []);
  const hostedCallPath = useMemo(() => buildHostedCallUrl(roomId, mode), [mode, roomId]);
  const statusLabel = useMemo(() => {
    switch (status) {
      case "getting_token":
        return "Preparing call…";
      case "initializing":
        return "Starting media engine…";
      case "logging_in":
        return "Connecting to room…";
      case "publishing":
        return "Starting your stream…";
      case "waiting_remote":
        return "Waiting for others to join";
      case "connected":
        return "Live";
      case "error":
        return "Connection issue";
      default:
        return "Ready";
    }
  }, [status]);

  const statusTone = useMemo(() => {
    if (status === "connected") return "text-emerald-700 dark:text-emerald-300";
    if (status === "error") return "text-rose-700 dark:text-rose-300";
    if (status === "logging_in" || status === "publishing" || status === "getting_token" || status === "initializing") {
      return "text-amber-700 dark:text-amber-300";
    }
    return "text-slate-700 dark:text-slate-200";
  }, [status]);

  const applyLocalTrackState = useMemo(
    () => (stream: any) => {
      if (!stream) return;
      try {
        const audioTracks = stream.getAudioTracks?.() || [];
        audioTracks.forEach((track: MediaStreamTrack) => {
          track.enabled = isMicEnabled;
        });
      } catch {
        /* ignore */
      }

      try {
        const videoTracks = stream.getVideoTracks?.() || [];
        const shouldEnableVideo = mode === "video" && isCameraEnabled;
        videoTracks.forEach((track: MediaStreamTrack) => {
          track.enabled = shouldEnableVideo;
        });
      } catch {
        /* ignore */
      }
    },
    [isCameraEnabled, isMicEnabled, mode]
  );

  const toggleMic = () => {
    const next = !isMicEnabled;
    setIsMicEnabled(next);
    const stream = localStreamRef.current;
    if (!stream) return;
    try {
      const audioTracks = stream.getAudioTracks?.() || [];
      audioTracks.forEach((track: MediaStreamTrack) => {
        track.enabled = next;
      });
    } catch {
      /* ignore */
    }
  };

  const toggleCamera = () => {
    if (mode !== "video") return;
    const next = !isCameraEnabled;
    setIsCameraEnabled(next);
    const stream = localStreamRef.current;
    if (!stream) return;
    try {
      const videoTracks = stream.getVideoTracks?.() || [];
      videoTracks.forEach((track: MediaStreamTrack) => {
        track.enabled = next;
      });
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (mode !== "video") {
      setIsCameraEnabled(false);
    } else {
      setIsCameraEnabled(true);
    }
  }, [mode]);

  useEffect(() => {
    if (!roomId) return;
    if (!userId) return;

    let cancelled = false;

    const stopRemoteStreams = (zg: ZegoExpressEngine | null) => {
      const remoteIds = Object.keys(remoteStreamsRef.current);
      remoteIds.forEach((streamId) => {
        try {
          zg?.stopPlayingStream(streamId);
        } catch {
          /* ignore */
        }
      });
      remoteStreamsRef.current = {};
      setRemoteTiles([]);
    };

    const cleanup = async () => {
      const zg = engineRef.current;
      engineRef.current = null;

      stopRemoteStreams(zg);

      try {
        if (zg) {
          zg.stopPublishingStream(undefined as any);
        }
      } catch {
        /* ignore */
      }

      try {
        if (zg && localStreamRef.current) {
          zg.destroyStream(localStreamRef.current);
          localStreamRef.current = null;
        }
      } catch {
        /* ignore */
      }

      try {
        if (zg) {
          zg.logoutRoom(roomId);
        }
      } catch {
        /* ignore */
      }

      try {
        if (zg) {
          zg.destroyEngine();
        }
      } catch {
        /* ignore */
      }
    };

    const run = async () => {
      try {
        setError("");
        setNeedsUserGesture(false);
        setRemoteTiles([]);
        setStatus("getting_token");

        const tokenRes = await fetch("/api/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, roomId }),
        });
        const tokenJson = await tokenRes.json().catch(() => ({}));
        if (!tokenRes.ok || tokenJson?.success === false) {
          throw new Error(tokenJson?.message || "Could not get ZEGO token");
        }
        const appId = Number(tokenJson?.appId);
        const token = String(tokenJson?.token || "");
        if (!appId || Number.isNaN(appId) || !token) throw new Error("Invalid token response");
        if (cancelled) return;

        setStatus("initializing");
        const zg = new ZegoExpressEngine(appId, server);
        engineRef.current = zg;

        try {
          const resumed = await (zg as unknown as { resumeAudioContext?: () => Promise<boolean> | boolean }).resumeAudioContext?.();
          if (resumed === false) setNeedsUserGesture(true);
        } catch {
          /* ignore */
        }

        const upsertRemoteTile = (streamId: string, remoteStream: any) => {
          remoteStreamsRef.current[streamId] = remoteStream;
          setRemoteTiles((current) => {
            if (current.some((tile) => tile.streamId === streamId)) return current;
            return [...current, { streamId }];
          });
          setStatus("connected");
        };

        const removeRemoteTiles = (streamIds: string[]) => {
          streamIds.forEach((streamId) => {
            try {
              zg.stopPlayingStream(streamId);
            } catch {
              /* ignore */
            }
            delete remoteStreamsRef.current[streamId];
          });
          setRemoteTiles((current) => {
            const next = current.filter((tile) => !streamIds.includes(tile.streamId));
            if (next.length === 0) {
              setStatus("waiting_remote");
            }
            return next;
          });
        };

        const onRoomStreamUpdate = async (_roomID: string, updateType: "ADD" | "DELETE", streamList: any[]) => {
          if (cancelled) return;
          if (!Array.isArray(streamList) || streamList.length === 0) return;

          if (updateType === "DELETE") {
            const deletedIds = streamList
              .map((s) => String(s?.streamID || s?.streamId || "").trim())
              .filter(Boolean);
            removeRemoteTiles(deletedIds);
            return;
          }

          for (const s of streamList) {
            const remoteStreamId = String(s?.streamID || s?.streamId || "").trim();
            if (!remoteStreamId) continue;
            if (remoteStreamId === publishedStreamIdRef.current) continue;
            if (remoteStreamsRef.current[remoteStreamId]) continue;
            try {
              const remoteStream = await zg.startPlayingStream(remoteStreamId);
              upsertRemoteTile(remoteStreamId, remoteStream);
            } catch {
              /* ignore and continue */
            }
          }
        };

        const onRoomStateChanged = async (_roomID: string, reason: string, errorCode: number) => {
          if (cancelled) return;
          if (String(reason).toUpperCase() === "DISCONNECTED") {
            if (!reconnectingRef.current) {
              reconnectingRef.current = true;
              setStatus("logging_in");
              try {
                const r = await fetch("/api/token", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ userId, roomId }),
                });
                const j = await r.json().catch(() => ({}));
                const nextToken = String(j?.token || "");
                if (nextToken) {
                  try {
                    await zg.renewToken(roomId, nextToken);
                  } catch {
                    /* ignore */
                  }
                  try {
                    zg.logoutRoom(roomId);
                  } catch {
                    /* ignore */
                  }
                  await zg.loginRoom(roomId, nextToken, { userID: userId, userName }, { userUpdate: true });
                  if (localStreamRef.current && publishedStreamIdRef.current) {
                    try {
                      await zg.startPublishingStream(publishedStreamIdRef.current, localStreamRef.current);
                    } catch {
                      /* ignore */
                    }
                  }
                }
              } catch {
                /* ignore */
              } finally {
                reconnectingRef.current = false;
              }
            }
          }
          if (errorCode && errorCode !== 0) {
            setError(`Room state: ${reason} (code ${errorCode})`);
          }
        };

        zg.on("roomStreamUpdate", onRoomStreamUpdate);
        zg.on("roomStateChanged", onRoomStateChanged);

        try {
          (zg as unknown as { on?: (event: string, cb: (...args: unknown[]) => void) => void }).on?.(
            "playerStateUpdate",
            (_roomID: string, streamID: string, state: { errorCode?: number } | undefined) => {
              if (cancelled) return;
              const code = Number(state?.errorCode || 0);
              if (code) setError(`Play failed (${streamID}): code ${code}`);
            }
          );
          (zg as unknown as { on?: (event: string, cb: (...args: unknown[]) => void) => void }).on?.(
            "publisherStateUpdate",
            (_roomID: string, streamID: string, state: { errorCode?: number } | undefined) => {
              if (cancelled) return;
              const code = Number(state?.errorCode || 0);
              if (code) setError(`Publish failed (${streamID}): code ${code}`);
            }
          );
        } catch {
          /* ignore */
        }

        setStatus("logging_in");
        const ok = await zg.loginRoom(roomId, token, { userID: userId, userName }, { userUpdate: true });
        if (!ok) throw new Error("loginRoom failed");
        if (cancelled) return;

        setStatus("publishing");
        const localStream =
          mode === "audio"
            ? await zg.createZegoStream({ camera: { audio: true, video: false } })
            : await zg.createZegoStream({ camera: { audio: true, video: true } });
        localStreamRef.current = localStream;
        applyLocalTrackState(localStream);

        try {
          localStream.playVideo?.(document.getElementById("dlite-zego-local"));
        } catch {
          /* ignore */
        }

        const streamId = `${roomId}-${userId}-${Date.now()}`;
        publishedStreamIdRef.current = streamId;
        await zg.startPublishingStream(streamId, localStream);

        setStatus("waiting_remote");
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setError(e instanceof Error ? e.message : "Call failed");
        await cleanup();
      }
    };

    run();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [applyLocalTrackState, mode, roomId, server, userId, userName]);

  useEffect(() => {
    applyLocalTrackState(localStreamRef.current);
  }, [applyLocalTrackState]);

  useEffect(() => {
    if (!engineRef.current) return;
    const zg = engineRef.current;
    remoteTiles.forEach(({ streamId }) => {
      const remoteStream = remoteStreamsRef.current[streamId];
      const mountId = `dlite-zego-remote-${streamId}`;
      const mountNode = document.getElementById(mountId);
      if (!remoteStream || !mountNode || mountNode.childElementCount > 0) return;
      try {
        const remoteView = zg.createRemoteStreamView(remoteStream);
        remoteView.play(mountId);
      } catch {
        /* ignore */
      }
    });
  }, [remoteTiles]);

  useEffect(() => {
    if (!copiedState) return;
    const t = window.setTimeout(() => setCopiedState(""), 1800);
    return () => window.clearTimeout(t);
  }, [copiedState]);

  if (!roomId) {
    return <div className="p-6 text-sm text-slate-600">Missing roomId.</div>;
  }
  if (!userId) {
    return <div className="p-6 text-sm text-slate-600">Please login to join the call.</div>;
  }

  return (
    <div className="flex min-h-[calc(100vh-56px)] flex-col gap-4 p-4">
      <div className="rounded-2xl border border-ui-border bg-ui-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Call room</p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Mode:{" "}
              <span className="font-semibold">{mode === "audio" ? "Audio" : "Video"}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-full border border-ui-border bg-ui-muted px-3 py-1.5 text-xs">
              Status: <span className={`font-semibold ${statusTone}`}>{statusLabel}</span>
            </div>
            <Link
              href="/call"
              className="anim-shimmer relative inline-flex items-center justify-center overflow-hidden rounded-full bg-gradient-to-r from-fuchsia-600 via-violet-600 to-orange-500 px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-fuchsia-500/15 ring-1 ring-white/15 transition hover:-translate-y-0.5 hover:brightness-110"
            >
              Leave
            </Link>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleMic}
            className={cn(
              "anim-shimmer relative inline-flex items-center justify-center overflow-hidden rounded-full px-3 py-1.5 text-xs font-semibold text-white shadow-lg ring-1 ring-white/15 transition hover:-translate-y-0.5 hover:brightness-110",
              isMicEnabled
                ? "bg-gradient-to-r from-fuchsia-600 via-violet-600 to-orange-500 shadow-fuchsia-500/15"
                : "bg-gradient-to-r from-slate-600 via-slate-700 to-slate-800 shadow-black/10"
            )}
          >
            {isMicEnabled ? "Mute mic" : "Unmute mic"}
          </button>
          {mode === "video" ? (
            <button
              type="button"
              onClick={toggleCamera}
              className={cn(
                "anim-shimmer relative inline-flex items-center justify-center overflow-hidden rounded-full px-3 py-1.5 text-xs font-semibold text-white shadow-lg ring-1 ring-white/15 transition hover:-translate-y-0.5 hover:brightness-110",
                isCameraEnabled
                  ? "bg-gradient-to-r from-fuchsia-600 via-violet-600 to-orange-500 shadow-fuchsia-500/15"
                  : "bg-gradient-to-r from-slate-600 via-slate-700 to-slate-800 shadow-black/10"
              )}
            >
              {isCameraEnabled ? "Turn camera off" : "Turn camera on"}
            </button>
          ) : null}
        </div>
        {inviteCode ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-ui-border bg-ui-muted px-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Invite code
              </p>
              <p className="mt-1 font-mono text-base font-bold tracking-[0.26em] text-slate-900 dark:text-slate-50">
                {inviteCode}
              </p>
            </div>
            <button
              type="button"
              className="anim-shimmer relative inline-flex items-center justify-center overflow-hidden rounded-full bg-gradient-to-r from-fuchsia-600 via-violet-600 to-orange-500 px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-fuchsia-500/15 ring-1 ring-white/15 transition hover:-translate-y-0.5 hover:brightness-110"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(inviteCode);
                  setCopiedState("code");
                } catch {
                  /* ignore */
                }
              }}
            >
              {copiedState === "code" ? "Copied code" : "Copy code"}
            </button>
            <button
              type="button"
              className="anim-shimmer relative inline-flex items-center justify-center overflow-hidden rounded-full bg-gradient-to-r from-fuchsia-600 via-violet-600 to-orange-500 px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-fuchsia-500/15 ring-1 ring-white/15 transition hover:-translate-y-0.5 hover:brightness-110"
              onClick={async () => {
                try {
                  const absoluteLink =
                    typeof window === "undefined" ? hostedCallPath : `${window.location.origin}${hostedCallPath}`;
                  await navigator.clipboard.writeText(absoluteLink);
                  setCopiedState("link");
                } catch {
                  /* ignore */
                }
              }}
            >
              {copiedState === "link" ? "Copied link" : "Copy link"}
            </button>
            <Link
              href="/call"
              className="rounded-full border border-ui-border bg-ui-panel px-3 py-1.5 text-xs font-semibold text-slate-800 transition hover:bg-white dark:text-slate-100 dark:hover:bg-white/10"
            >
              Back to call home
            </Link>
          </div>
        ) : null}
        {error ? <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700">{error}</p> : null}
        {needsUserGesture ? (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-ui-border bg-ui-muted px-3 py-2">
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Browser blocked audio autoplay. Click to enable audio.
            </p>
            <button
              type="button"
              className="rounded-full bg-gradient-to-r from-ui-grad-from to-ui-grad-to px-3 py-1 text-[11px] font-semibold text-white shadow-sm hover:brightness-110"
              onClick={async () => {
                try {
                  await (engineRef.current as unknown as { resumeAudioContext?: () => Promise<boolean> | boolean })?.resumeAudioContext?.();
                  setNeedsUserGesture(false);
                } catch {
                  /* ignore */
                }
              }}
            >
              Enable
            </button>
          </div>
        ) : null}
      </div>

      <div className="grid min-h-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col rounded-2xl border border-ui-border bg-ui-panel p-3">
          <div className="mb-2 flex items-center justify-between gap-2 shrink-0">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">You</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Mic {isMicEnabled ? "on" : "off"}
              {mode === "video" ? ` · Camera ${isCameraEnabled ? "on" : "off"}` : ""}
            </p>
          </div>
          <div
            id="dlite-zego-local"
            ref={localRef}
            className="aspect-video w-full overflow-hidden rounded-xl bg-black/90"
          />
          {mode === "audio" ? <p className="mt-2 text-[11px] text-slate-500">Audio-only: camera disabled.</p> : null}
        </div>

        <div className="flex min-h-0 flex-col rounded-2xl border border-ui-border bg-ui-panel p-3">
          <div className="mb-2 flex items-center justify-between gap-3 shrink-0">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Participants</p>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {remoteTiles.length} remote · {remoteTiles.length + 1} total
            </span>
          </div>
          {remoteTiles.length > 0 ? (
            <div className="grid min-h-0 w-full flex-1 grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2">
              {remoteTiles.map(({ streamId }) => (
                <div key={streamId} className="rounded-xl border border-ui-border bg-ui-muted p-2">
                  <div id={`dlite-zego-remote-${streamId}`} className="aspect-video w-full overflow-hidden rounded-xl bg-black/90" />
                </div>
              ))}
            </div>
          ) : null}
          {remoteTiles.length === 0 && (status === "waiting_remote" || status === "publishing" || status === "logging_in") ? (
            <div className="rounded-xl border border-ui-border bg-ui-muted px-3 py-3 text-[11px] text-slate-500 dark:text-slate-400">
              Waiting for others to join with the invite code. Share code or call link above.
            </div>
          ) : null}
        </div>
      </div>

      <div className="sticky bottom-3 z-20 rounded-2xl border border-ui-border bg-ui-panel/95 p-2 shadow-lg backdrop-blur lg:hidden">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleMic}
            className="flex-1 rounded-xl border border-ui-border bg-ui-panel px-3 py-2 text-xs font-semibold text-slate-800 transition hover:bg-white dark:text-slate-100 dark:hover:bg-white/10"
          >
            {isMicEnabled ? "Mute mic" : "Unmute mic"}
          </button>
          {mode === "video" ? (
            <button
              type="button"
              onClick={toggleCamera}
              className="flex-1 rounded-xl border border-ui-border bg-ui-panel px-3 py-2 text-xs font-semibold text-slate-800 transition hover:bg-white dark:text-slate-100 dark:hover:bg-white/10"
            >
              {isCameraEnabled ? "Camera off" : "Camera on"}
            </button>
          ) : null}
          <Link
            href="/call"
            className="rounded-xl border border-ui-border bg-ui-panel px-3 py-2 text-xs font-semibold text-slate-800 transition hover:bg-white dark:text-slate-100 dark:hover:bg-white/10"
          >
            Leave
          </Link>
        </div>
      </div>
    </div>
  );
}
