"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ZegoExpressEngine } from "zego-express-engine-webrtc";
import { useAuth } from "@/hooks/useAuth";

/**
 * ZEGOCLOUD low-level call page.
 *
 * URL:
 * - /call/<roomId>?mode=video|audio
 *
 * Notes:
 * - This route does not use a prebuilt UI kit.
 * - Keep UI minimal here; you can wire the streams into your existing Call UI.
 */
export default function ZegoCallRoomPage() {
  const { user } = useAuth();
  const params = useParams();
  const searchParams = useSearchParams();

  const roomId = String((params as any)?.roomId || "").trim();
  const mode = String(searchParams?.get("mode") || "video").toLowerCase() === "audio" ? "audio" : "video";

  const userId = String(user?.id || "").trim();
  const userName = String(user?.username || userId || "User").trim();

  const localRef = useRef<HTMLDivElement | null>(null);
  const remoteRef = useRef<HTMLDivElement | null>(null);

  const engineRef = useRef<ZegoExpressEngine | null>(null);
  const localStreamRef = useRef<any>(null);
  const publishedStreamIdRef = useRef<string>("");
  const playingStreamIdRef = useRef<string>("");

  const [status, setStatus] = useState<
    "idle" | "getting_token" | "initializing" | "logging_in" | "publishing" | "waiting_remote" | "connected" | "error"
  >("idle");
  const [error, setError] = useState<string>("");
  const [remoteJoined, setRemoteJoined] = useState(false);
  const [needsUserGesture, setNeedsUserGesture] = useState(false);

  const server = useMemo(() => "wss://webliveroom-api.zego.im/ws", []);

  useEffect(() => {
    if (!roomId) return;
    if (!userId) return;

    let cancelled = false;

    const cleanup = async () => {
      const zg = engineRef.current;
      engineRef.current = null;

      try {
        if (zg && playingStreamIdRef.current) {
          zg.stopPlayingStream(playingStreamIdRef.current);
          playingStreamIdRef.current = "";
        }
      } catch {
        /* ignore */
      }

      try {
        if (zg) {
          // Some SDK typings require the channel param.
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
        setRemoteJoined(false);
        setNeedsUserGesture(false);
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

        // Some browsers require an explicit user gesture to start audio.
        try {
          const r = await (zg as unknown as { resumeAudioContext?: () => Promise<boolean> | boolean }).resumeAudioContext?.();
          if (r === false) setNeedsUserGesture(true);
        } catch {
          // ignore
        }

        // Room stream updates: play remote streams.
        const onRoomStreamUpdate = async (_roomID: string, updateType: "ADD" | "DELETE", streamList: any[]) => {
          if (cancelled) return;
          if (!Array.isArray(streamList) || streamList.length === 0) return;
          if (updateType === "DELETE") {
            // If the currently playing stream disappears, stop it and go back to waiting.
            const deletedIds = streamList
              .map((s) => String(s?.streamID || s?.streamId || "").trim())
              .filter(Boolean);
            if (playingStreamIdRef.current && deletedIds.includes(playingStreamIdRef.current)) {
              try {
                zg.stopPlayingStream(playingStreamIdRef.current);
              } catch {
                /* ignore */
              }
              playingStreamIdRef.current = "";
              setRemoteJoined(false);
              setStatus("waiting_remote");
            }
            return;
          }

          // ADD: play the first remote stream that isn't ours.
          for (const s of streamList) {
            const remoteStreamId = String(s?.streamID || s?.streamId || "").trim();
            if (!remoteStreamId) continue;
            if (remoteStreamId === publishedStreamIdRef.current) continue;
            if (playingStreamIdRef.current === remoteStreamId) continue;
            try {
              const remoteStream = await zg.startPlayingStream(remoteStreamId);
              const remoteView = zg.createRemoteStreamView(remoteStream);
              const mountId = "dlite-zego-remote";
              remoteView.play(mountId);
              playingStreamIdRef.current = remoteStreamId;
              setRemoteJoined(true);
              setStatus("connected");
              break;
            } catch {
              // keep trying the next stream
            }
          }
        };

        const onRoomStateChanged = async (_roomID: string, reason: string, errorCode: number) => {
          if (cancelled) return;
          // Best-effort reconnection: if disconnected, re-login with a fresh token.
          if (String(reason).toUpperCase() === "DISCONNECTED") {
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
                await zg.renewToken(roomId, nextToken);
              }
            } catch {
              /* ignore */
            }
          }
          if (errorCode && errorCode !== 0) {
            // Surface a hint, but don't kill the page.
            setError(`Room state: ${reason} (code ${errorCode})`);
          }
        };

        zg.on("roomStreamUpdate", onRoomStreamUpdate);
        zg.on("roomStateChanged", onRoomStateChanged);

        // Extra hooks (best-effort; depends on SDK build).
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
        // Create local stream. Audio-only mode disables camera but keeps mic.
        const localStream =
          mode === "audio"
            ? await zg.createZegoStream({ camera: { audio: true, video: false } })
            : await zg.createZegoStream({ camera: { audio: true, video: true } });
        localStreamRef.current = localStream;

        // Preview local video (if any).
        const mountLocalId = "dlite-zego-local";
        try {
          localStream.playVideo?.(document.getElementById(mountLocalId));
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
  }, [mode, roomId, server, userId, userName]);

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
              Room: <span className="font-mono">{roomId}</span> · Mode:{" "}
              <span className="font-semibold">{mode === "audio" ? "Audio" : "Video"}</span>
            </p>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Status: <span className="font-semibold text-slate-700 dark:text-slate-200">{status}</span>
          </div>
        </div>
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-ui-border bg-ui-panel p-3">
          <p className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">Local</p>
          <div
            id="dlite-zego-local"
            ref={localRef}
            className="aspect-video w-full overflow-hidden rounded-xl bg-black/90"
          />
          {mode === "audio" ? <p className="mt-2 text-[11px] text-slate-500">Audio-only: camera disabled.</p> : null}
        </div>

        <div className="rounded-2xl border border-ui-border bg-ui-panel p-3">
          <p className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">Remote</p>
          <div
            id="dlite-zego-remote"
            ref={remoteRef}
            className="aspect-video w-full overflow-hidden rounded-xl bg-black/90"
          />
          {!remoteJoined && (status === "waiting_remote" || status === "publishing" || status === "logging_in") ? (
            <p className="mt-2 text-[11px] text-slate-500">Waiting for the other user to join…</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

