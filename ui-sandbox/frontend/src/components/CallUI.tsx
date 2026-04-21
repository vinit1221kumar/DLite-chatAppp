"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Monitor,
  MonitorOff,
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneOff,
  Radio,
  UserRound,
  Video,
  VideoOff,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthContext } from "@/context/AuthContext";
import { getUserProfileById, searchUsersByUsername } from "@/services/chatClient";
import {
  acceptCall,
  clearIceCandidates,
  endCall,
  listenForAnswer,
  listenForCallEnded,
  listenForIceCandidates,
  listenForIncomingCall,
  listenForRejection,
  publishIceCandidate,
  rejectCall,
  startCall,
} from "@/lib/call";
import {
  addIceCandidate,
  attachLocalTracks,
  cleanupPeerConnection,
  createAnswer,
  createOffer,
  createPeerConnection,
  DEFAULT_ICE_SERVERS,
  iceConfigHasRelayServer,
  setRemoteDescription,
} from "@/lib/webrtc";
import { CallMode, ConnectionStatus, OfferPayload } from "@/types/call";
import { cn } from "@/lib/utils";
import { CallHistoryItem, createCallHistoryId, upsertCallHistoryItem } from "@/lib/callHistory";

type UnsubscribeFn = () => void;
type CallUITheme = "default" | "enhanced";

interface CallUIProps {
  defaultMode?: CallMode;
  title?: string;
  description?: string;
  theme?: CallUITheme;
  showUserPanel?: boolean;
  requireExplicitStart?: boolean;
  showHero?: boolean;
}

function createRingtonePlayer() {
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let audioContext: AudioContext | null = null;

  function beep() {
    if (!audioContext) audioContext = new AudioContext();
    if (audioContext.state === "suspended") {
      audioContext.resume().catch(() => undefined);
    }
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 840;
    gainNode.gain.value = 0.08;
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.18);
  }

  return {
    start() {
      if (intervalId) return;
      beep();
      intervalId = setInterval(beep, 1200);
    },
    stop() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },
  };
}

function getStatusLabel(status: ConnectionStatus) {
  switch (status) {
    case "requesting-media":
      return "Requesting microphone/camera access";
    case "calling":
      return "Calling";
    case "ringing":
      return "Incoming call";
    case "connecting":
      return "Connecting";
    case "connected":
      return "Connected";
    case "ended":
      return "Call ended";
    case "failed":
      return "Call failed";
    default:
      return "Ready";
  }
}

export default function CallUI({
  defaultMode = "video",
  title = "Direct voice and video calls",
  description = "Call another signed-in user. The receiver can accept or reject from the same page.",
  theme = "default",
  showUserPanel = true,
  requireExplicitStart = false,
  showHero = true,
}: CallUIProps) {
  const auth = useAuthContext();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentUserId = auth?.user?.id as string | undefined;
  const explicitReady = searchParams.get("ready") === "1";

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  // FIX: Voice calls need a real audio element to play the remote audio track.
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const currentUserIdRef = useRef<string | undefined>(currentUserId);
  const peerIdRef = useRef<string | null>(null);
  const pendingIceCandidatesRef = useRef<Parameters<typeof addIceCandidate>[1][]>([]);
  const remoteDescriptionSetRef = useRef(false);
  const sessionUnsubRefs = useRef<UnsubscribeFn[]>([]);
  const incomingCallUnsubRef = useRef<UnsubscribeFn | null>(null);
  const ringtoneRef = useRef(createRingtonePlayer());
  const callHistoryRef = useRef<CallHistoryItem | null>(null);
  const persistCallHistoryRef = useRef<(patch: Partial<CallHistoryItem>) => void>(() => undefined);

  const calleeParam = searchParams.get("callee")?.trim() ?? "";
  const queryMode = searchParams.get("mode");
  const initialMode = queryMode === "audio" || queryMode === "video" ? queryMode : defaultMode;
  const callModeRef = useRef<CallMode>(initialMode);

  const screenStreamRef = useRef<MediaStream | null>(null);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const overlayVideoRef = useRef<HTMLVideoElement>(null);
  const callScreenRef = useRef<HTMLDivElement>(null);
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(false);

  const [calleeId, setCalleeId] = useState(calleeParam);
  const [calleeUsername, setCalleeUsername] = useState<string>("");
  const [peerDisplayName, setPeerDisplayName] = useState<string>("");
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<{ id: string; username: string }[]>([]);
  const [userLoading, setUserLoading] = useState(false);
  const [peerId, setPeerId] = useState<string | null>(null);
  const [callMode, setCallMode] = useState<CallMode>(initialMode);
  const [incomingOffer, setIncomingOffer] = useState<OfferPayload | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>("new");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(defaultMode === "video");
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  // Fullscreen UI is handled via the browser Fullscreen API (callScreenRef).

  useEffect(() => {
    setCalleeId(calleeParam);
  }, [calleeParam]);

  useEffect(() => {
    if (!showUserPanel) return;
    if (!currentUserId) return;
    const term = userQuery.trim();
    if (!term) {
      setUserResults([]);
      setUserLoading(false);
      return;
    }

    let cancelled = false;
    setUserLoading(true);
    const t = setTimeout(async () => {
      try {
        const results = await searchUsersByUsername(term, currentUserId);
        if (!cancelled) setUserResults(results);
      } catch {
        if (!cancelled) setUserResults([]);
      } finally {
        if (!cancelled) setUserLoading(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [currentUserId, userQuery]);

  useEffect(() => {
    // If user types/changes calleeId manually, clear the username label.
    setCalleeUsername("");
  }, [calleeId]);

  useEffect(() => {
    setCallMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    callModeRef.current = callMode;
  }, [callMode]);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    peerIdRef.current = peerId;
  }, [peerId]);

  useEffect(() => {
    // FIX: Show display name/email instead of raw userId in call UI.
    const id = incomingOffer?.fromUserId || peerId;
    if (!id) {
      setPeerDisplayName("");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const profile = await getUserProfileById(id);
        if (cancelled) return;
        const next =
          profile?.username ||
          (profile?.email ? profile.email.split("@")[0] : "") ||
          "";
        setPeerDisplayName(next);
      } catch {
        if (!cancelled) setPeerDisplayName("");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [incomingOffer?.fromUserId, peerId]);

  // Call duration timer
  useEffect(() => {
    if (status === "connected") {
      setCallDuration(0);
      durationIntervalRef.current = setInterval(() => setCallDuration((prev) => prev + 1), 1000);
    } else {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
      if (status === "idle" || status === "ended" || status === "failed") {
        setCallDuration(0);
      }
    }
    return () => {
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
    };
  }, [status]);

  const clearSessionListeners = useCallback(() => {
    sessionUnsubRefs.current.forEach((unsubscribe) => unsubscribe());
    sessionUnsubRefs.current = [];
  }, []);

  const stopAllTracks = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
  }, []);

  const clearMediaElements = useCallback(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
  }, []);

  const resetLocalState = useCallback(() => {
    setIncomingOffer(null);
    setPeerId(null);
    setConnectionState("new");
    setMicEnabled(true);
    setCameraEnabled(callModeRef.current === "video");
  }, []);

  const hardCleanup = useCallback(async () => {
    ringtoneRef.current.stop();
    clearSessionListeners();
    cleanupPeerConnection(peerConnectionRef.current);
    peerConnectionRef.current = null;
    pendingIceCandidatesRef.current = [];
    remoteDescriptionSetRef.current = false;
    stopAllTracks();
    clearMediaElements();
    resetLocalState();
  }, [clearMediaElements, clearSessionListeners, resetLocalState, stopAllTracks]);

  const setupMedia = useCallback(async (mode: CallMode): Promise<MediaStream | null> => {
    setStatus("requesting-media");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: mode === "video",
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      setCameraEnabled(mode === "video");
      setMicEnabled(true);
      return stream;
    } catch (mediaError) {
      console.error("Failed to get user media", mediaError);
      const msg =
        mode === "video"
          ? "Could not access microphone/camera. Please verify permissions."
          : "Could not access microphone. Please verify permissions.";
      setError(msg);
      setStatus("failed");
      return null;
    }
  }, []);

  const persistCallHistory = useCallback(
    (patch: Partial<CallHistoryItem>) => {
      if (!currentUserId) return;
      if (typeof window === "undefined") return;

      const now = Date.now();
      const existing = callHistoryRef.current;
      const base: CallHistoryItem =
        existing ||
        ({
          id: createCallHistoryId(),
          userId: currentUserId,
          peerId: String(patch.peerId || peerIdRef.current || calleeId || "").trim(),
          peerName: patch.peerName,
          mode: (patch.mode as "audio" | "video") || (callModeRef.current as "audio" | "video"),
          direction: patch.direction || "outgoing",
          outcome: patch.outcome || "calling",
          startedAt: patch.startedAt || now,
        } as CallHistoryItem);

      const next: CallHistoryItem = {
        ...base,
        ...patch,
        peerId: String(patch.peerId ?? base.peerId ?? "").trim(),
        peerName: patch.peerName ?? base.peerName,
        mode: (patch.mode as "audio" | "video") ?? base.mode,
        direction: patch.direction ?? base.direction,
        outcome: patch.outcome ?? base.outcome,
      };

      callHistoryRef.current = next;
      upsertCallHistoryItem(currentUserId, next);
    },
    [calleeId, currentUserId]
  );

  // Avoid capturing persistCallHistory in other callbacks (TDZ-safe).
  useEffect(() => {
    persistCallHistoryRef.current = persistCallHistory;
  }, [persistCallHistory]);

  const setupPeerConnection = useCallback((userId: string, targetPeerId: string) => {
    pendingIceCandidatesRef.current = [];
    remoteDescriptionSetRef.current = false;
    const remoteStream = new MediaStream();
    remoteStreamRef.current = remoteStream;
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
    // FIX: Voice calls require attaching remote stream to an <audio> element.
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = remoteStream;
    }

    const peerConnection = createPeerConnection({
      senderUserId: userId,
      onIceCandidate: async (candidate) => {
        try {
          await publishIceCandidate({
            targetUserId: targetPeerId,
            fromUserId: userId,
            candidate,
          });
        } catch (candidateError) {
          console.error("Failed to publish ICE candidate", candidateError);
        }
      },
      onTrack: (event) => {
        event.streams[0]?.getTracks().forEach((track) => remoteStream.addTrack(track));
      },
      onConnectionStateChange: (nextState) => {
        setConnectionState(nextState);
        if (nextState === "connected") {
          setStatus("connected");
          setError(null);
          persistCallHistoryRef.current({ outcome: "connected" });
        } else if (nextState === "failed") {
          setStatus("failed");
          const hasTurn = iceConfigHasRelayServer(DEFAULT_ICE_SERVERS);
          setError(
            hasTurn
              ? "WebRTC ICE failed and the browser could not use your TURN relay. Check: turn: vs turns: (TLS cert must be valid), username/password match coturn, ports 3478 UDP/TCP (and 5349 for TLS) open, and Vercel env NEXT_PUBLIC_ICE_SERVERS_JSON matches production. Use about:webrtc → Connection log for relay errors."
              : "Connection failed — this network usually needs TURN. Set NEXT_PUBLIC_ICE_SERVERS_JSON with STUN + TURN on Vercel, redeploy, then retry (see docs/ENVIRONMENT_VARIABLES.md).",
          );
          persistCallHistoryRef.current({ outcome: "failed", endedAt: Date.now() });
        } else if (nextState === "disconnected" || nextState === "closed") {
          setStatus("ended");
          persistCallHistoryRef.current({ outcome: "ended", endedAt: Date.now() });
        }
      },
    });

    peerConnectionRef.current = peerConnection;
    return peerConnection;
  }, []);

  const flushPendingIceCandidates = useCallback(async () => {
    if (!peerConnectionRef.current || !remoteDescriptionSetRef.current) return;
    const pendingCandidates = pendingIceCandidatesRef.current.splice(0);
    for (const candidate of pendingCandidates) {
      try {
        await addIceCandidate(peerConnectionRef.current, candidate);
      } catch (addError) {
        console.error("Failed to flush remote ICE candidate", addError);
      }
    }
  }, []);

  const applyRemoteDescription = useCallback(
    async (description: RTCSessionDescriptionInit) => {
      if (!peerConnectionRef.current) return;
      await setRemoteDescription(peerConnectionRef.current, description);
      remoteDescriptionSetRef.current = true;
      await flushPendingIceCandidates();
    },
    [flushPendingIceCandidates]
  );

  const subscribeForRemoteIce = useCallback((userId: string, fromUserId: string) => {
    const unsubscribe = listenForIceCandidates({
      userId,
      fromUserId,
      onCandidate: async (candidate) => {
        try {
          if (!peerConnectionRef.current) return;
          if (!remoteDescriptionSetRef.current) {
            pendingIceCandidatesRef.current.push(candidate);
            return;
          }
          await addIceCandidate(peerConnectionRef.current, candidate);
        } catch (addError) {
          console.error("Failed to add remote ICE candidate", addError);
        }
      },
    });
    sessionUnsubRefs.current.push(unsubscribe);
  }, []);

  const beginCall = useCallback(async () => {
    if (!currentUserId) {
      setError("You must be logged in to start a call.");
      return;
    }

    const targetUserId = calleeId.trim();
    if (!targetUserId) {
      setError("Choose a user to call.");
      return;
    }
    if (targetUserId === currentUserId) {
      setError("You cannot call yourself.");
      return;
    }

    setError(null);
    setIsBusy(true);
    clearSessionListeners();

    try {
      const mode = callModeRef.current;
      const stream = await setupMedia(mode);
      if (!stream) return;
      persistCallHistory({
        peerId: targetUserId,
        peerName: calleeUsername || undefined,
        mode,
        direction: "outgoing",
        outcome: "calling",
        startedAt: Date.now(),
      });
      const peerConnection = setupPeerConnection(currentUserId, targetUserId);
      attachLocalTracks(peerConnection, stream);

      const offer = await createOffer(peerConnection);
      await startCall({
        callerId: currentUserId,
        calleeId: targetUserId,
        offer,
        mode,
      });

      const unsubscribeAnswer = listenForAnswer(
        currentUserId,
        async (answer) => {
          if (!answer || !peerConnectionRef.current) return;
          await applyRemoteDescription({ type: answer.type, sdp: answer.sdp });
          // Avoid overriding "connected" if ICE/DTLS finishes quickly.
          setStatus((prev) => (prev === "connected" ? prev : "connecting"));
        },
        { fromUserId: targetUserId }
      );

      const unsubscribeRejected = listenForRejection(
        currentUserId,
        async (rejected) => {
          if (!rejected) return;
          setError(`Call rejected by ${rejected.byUserId}.`);
          await endCall({ userId: currentUserId, peerUserId: targetUserId });
          await hardCleanup();
          setStatus("ended");
          persistCallHistory({ outcome: "rejected", endedAt: Date.now() });
        },
        { fromUserId: targetUserId }
      );

      const unsubscribeEnded = listenForCallEnded(
        currentUserId,
        async (payload) => {
          if (!payload) return;
          await hardCleanup();
          setStatus("ended");
          persistCallHistory({ outcome: "ended", endedAt: Date.now() });
        },
        { fromUserId: targetUserId }
      );

      sessionUnsubRefs.current.push(unsubscribeAnswer, unsubscribeRejected, unsubscribeEnded);
      subscribeForRemoteIce(currentUserId, targetUserId);
      setPeerId(targetUserId);
      setStatus("calling");
    } catch (startError) {
      console.error("Failed to start call", startError);
      setError(startError instanceof Error ? startError.message : "Failed to start call.");
      await hardCleanup();
      setStatus("failed");
      persistCallHistory({ outcome: "failed", endedAt: Date.now() });
    } finally {
      setIsBusy(false);
    }
  }, [
    calleeId,
    clearSessionListeners,
    currentUserId,
    hardCleanup,
    applyRemoteDescription,
    setupMedia,
    setupPeerConnection,
    subscribeForRemoteIce,
    persistCallHistory,
    calleeUsername,
  ]);

  const startCallWithMode = useCallback(
    async (mode: CallMode) => {
      callModeRef.current = mode;
      setCallMode(mode);
      await beginCall();
    },
    [beginCall]
  );

  const acceptIncomingCall = useCallback(async () => {
    if (!currentUserId || !incomingOffer) return;

    setError(null);
    setIsBusy(true);
    ringtoneRef.current.stop();
    clearSessionListeners();

    try {
      const callerId = incomingOffer.fromUserId;
      const stream = await setupMedia(incomingOffer.mode);
      if (!stream) return;
      persistCallHistory({
        peerId: callerId,
        peerName: peerDisplayName || undefined,
        mode: incomingOffer.mode,
        direction: "incoming",
        outcome: "connecting",
        startedAt: Date.now(),
      });
      const peerConnection = setupPeerConnection(currentUserId, callerId);
      attachLocalTracks(peerConnection, stream);
      await applyRemoteDescription(incomingOffer);

      const answer = await createAnswer(peerConnection);
      await acceptCall({ userId: currentUserId, callerId, answer });
      subscribeForRemoteIce(currentUserId, callerId);

      const unsubscribeEndedCallee = listenForCallEnded(
        currentUserId,
        async (payload) => {
          if (!payload) return;
          await hardCleanup();
          setStatus("ended");
          persistCallHistory({ outcome: "ended", endedAt: Date.now() });
        },
        { fromUserId: callerId }
      );
      sessionUnsubRefs.current.push(unsubscribeEndedCallee);

      setPeerId(callerId);
      setIncomingOffer(null);
      setCallMode(incomingOffer.mode);
      // Avoid overriding "connected" if onConnectionStateChange already fired.
      setStatus((prev) => (prev === "connected" ? prev : "connecting"));
    } catch (acceptError) {
      console.error("Failed to accept call", acceptError);
      setError(acceptError instanceof Error ? acceptError.message : "Failed to accept call.");
      await hardCleanup();
      setStatus("failed");
      persistCallHistory({ outcome: "failed", endedAt: Date.now() });
    } finally {
      setIsBusy(false);
    }
  }, [
    clearSessionListeners,
    currentUserId,
    hardCleanup,
    incomingOffer,
    applyRemoteDescription,
    setupMedia,
    setupPeerConnection,
    subscribeForRemoteIce,
    persistCallHistory,
    peerDisplayName,
  ]);

  const rejectIncomingCall = useCallback(async () => {
    if (!currentUserId || !incomingOffer) return;
    try {
      await rejectCall({ userId: currentUserId, callerId: incomingOffer.fromUserId });
      ringtoneRef.current.stop();
      setIncomingOffer(null);
      setStatus("ended");
      persistCallHistory({
        peerId: incomingOffer.fromUserId,
        peerName: peerDisplayName || undefined,
        mode: incomingOffer.mode,
        direction: "incoming",
        outcome: "rejected",
        startedAt: Date.now(),
        endedAt: Date.now(),
      });
    } catch (rejectError) {
      console.error("Failed to reject incoming call", rejectError);
      setError("Could not reject incoming call.");
    }
  }, [currentUserId, incomingOffer, peerDisplayName, persistCallHistory]);

  const clearExplicitReady = useCallback(
    (opts?: { keepCallee?: boolean }) => {
      const next = new URLSearchParams(searchParams.toString());
      next.delete("ready");
      next.delete("mode");
      if (!opts?.keepCallee) next.delete("callee");
      const qs = next.toString();
      router.replace(qs ? `/call?${qs}` : "/call");
    },
    [router, searchParams]
  );

  const leaveCall = useCallback(async () => {
    if (!currentUserId) return;
    try {
      await endCall({ userId: currentUserId, peerUserId: peerId });
      if (peerId) {
        await clearIceCandidates(currentUserId, peerId);
      }
    } catch (endError) {
      console.error("Failed to end call", endError);
    } finally {
      await hardCleanup();
      setStatus("ended");
      persistCallHistory({ outcome: "ended", endedAt: Date.now() });
      // UX: once a call ends, hide call workspace until user explicitly starts again.
      if (explicitReady) clearExplicitReady({ keepCallee: true });
    }
  }, [clearExplicitReady, currentUserId, explicitReady, hardCleanup, peerId, persistCallHistory]);

  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const nextEnabled = !micEnabled;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = nextEnabled;
    });
    setMicEnabled(nextEnabled);
  }, [micEnabled]);

  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const videoTracks = stream.getVideoTracks();
    if (!videoTracks.length) return;
    const nextEnabled = !cameraEnabled;
    videoTracks.forEach((track) => {
      track.enabled = nextEnabled;
    });
    setCameraEnabled(nextEnabled);
  }, [cameraEnabled]);

  const toggleScreenShare = useCallback(async () => {
    const pc = peerConnectionRef.current;
    if (!pc) return;
    if (isScreenSharing) {
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      const camTrack = localStreamRef.current?.getVideoTracks()[0];
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender && camTrack) {
        sender.replaceTrack(camTrack).catch(() => undefined);
      }
      if (localVideoRef.current && localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
      setIsScreenSharing(false);
    } else {
      try {
        const screen = await (navigator.mediaDevices as MediaDevices & {
          getDisplayMedia: (c: DisplayMediaStreamOptions) => Promise<MediaStream>;
        }).getDisplayMedia({ video: true, audio: false });
        screenStreamRef.current = screen;
        const screenTrack = screen.getVideoTracks()[0];
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) sender.replaceTrack(screenTrack).catch(() => undefined);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = new MediaStream([screenTrack]);
        }
        screenTrack.onended = () => {
          screenStreamRef.current = null;
          const camTrack2 = localStreamRef.current?.getVideoTracks()[0];
          const sender2 = peerConnectionRef.current?.getSenders().find((s) => s.track?.kind === "video");
          if (sender2 && camTrack2) sender2.replaceTrack(camTrack2).catch(() => undefined);
          if (localVideoRef.current && localStreamRef.current) {
            localVideoRef.current.srcObject = localStreamRef.current;
          }
          setIsScreenSharing(false);
        };
        setIsScreenSharing(true);
      } catch {
        /* user cancelled or permission denied */
      }
    }
  }, [isScreenSharing]);

  function formatDuration(secs: number) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  // Sync remote stream to overlay video element when connected
  useEffect(() => {
    if (status === "connected" && overlayVideoRef.current && remoteStreamRef.current) {
      overlayVideoRef.current.srcObject = remoteStreamRef.current;
    }
  }, [status]);

  // If launched with ?share=1, auto-start screen share once connected (video mode).
  useEffect(() => {
    const wantsShare = searchParams.get("share") === "1";
    if (!wantsShare) return;
    if (status !== "connected") return;
    if (callModeRef.current !== "video") return;
    if (isScreenSharing) return;
    toggleScreenShare().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, isScreenSharing]);

  // Track browser fullscreen state for the in-section call UI
  useEffect(() => {
    const onFs = () => setIsBrowserFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    onFs();
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleBrowserFullscreen = useCallback(async () => {
    const el = callScreenRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await el.requestFullscreen();
    } catch {
      /* ignore */
    }
  }, []);

  // Auto-accept call when navigated from global incoming call overlay
  useEffect(() => {
    if (status !== "ringing" || !incomingOffer || isBusy) return;
    try {
      const autoFrom = sessionStorage.getItem("dlite-auto-accept-from");
      if (autoFrom && autoFrom === incomingOffer.fromUserId) {
        sessionStorage.removeItem("dlite-auto-accept-from");
        acceptIncomingCall();
      }
    } catch { /* ignore */ }
  }, [status, incomingOffer, isBusy, acceptIncomingCall]);

  useEffect(() => {
    if (!currentUserId) return;

    const unsubscribeIncoming = listenForIncomingCall(currentUserId, (offer) => {
      if (!offer) {
        setIncomingOffer(null);
        return;
      }

      setIncomingOffer((currentOffer) => {
        if (currentOffer?.createdAt === offer.createdAt && currentOffer.fromUserId === offer.fromUserId) {
          return currentOffer;
        }
        return offer;
      });
      setPeerId(offer.fromUserId);
      setStatus((currentStatus) => {
        if (currentStatus === "connected" || currentStatus === "connecting" || currentStatus === "calling") {
          return currentStatus;
        }
        return "ringing";
      });
      ringtoneRef.current.start();
    });

    incomingCallUnsubRef.current = unsubscribeIncoming;

    return () => {
      const activeUserId = currentUserIdRef.current;
      const activePeerId = peerIdRef.current;
      incomingCallUnsubRef.current?.();
      incomingCallUnsubRef.current = null;
      if (activeUserId) {
        endCall({ userId: activeUserId, peerUserId: activePeerId }).catch(() => undefined);
      }
      hardCleanup().catch(() => undefined);
    };
  }, [currentUserId, hardCleanup]);

  // If the peer disconnects / call ends remotely, ensure we stop camera/mic too.
  useEffect(() => {
    if (status === "ended" || status === "failed") {
      hardCleanup().catch(() => undefined);
      // Also clear ready flag so the fullscreen call screen doesn't persist.
      if (explicitReady) clearExplicitReady({ keepCallee: true });
    }
  }, [status, hardCleanup, explicitReady, clearExplicitReady]);

  const canToggleCamera = Boolean(localStreamRef.current?.getVideoTracks().length);
  const hasIncomingCall = Boolean(incomingOffer);
  const activeMode = incomingOffer?.mode ?? callMode;
  const isEnhanced = theme === "enhanced";
  const isVideoMode = activeMode === "video";
  const hasSelectedCallee = Boolean(calleeId.trim());
  const canShowCallWorkspace = !requireExplicitStart || explicitReady;
  const showWhatsAppCallScreen =
    canShowCallWorkspace &&
    (explicitReady ||
      hasIncomingCall ||
      status === "calling" ||
      status === "connecting" ||
      status === "connected" ||
      status === "ringing");
  const heroIcon = isVideoMode ? Video : PhoneCall;
  const HeroIcon = heroIcon;
  const statusToneClass =
    status === "connected"
      ? "text-emerald-700 dark:text-emerald-300"
      : status === "failed"
        ? "text-rose-700 dark:text-rose-300"
        : status === "ringing"
          ? "text-fuchsia-700 dark:text-sky-300"
          : "text-slate-900 dark:text-slate-100";
  const panelClassName = isEnhanced
    ? "card relative overflow-hidden border-slate-200/70 bg-white/90 p-5 shadow-xl shadow-slate-200/40 dark:border-white/10 dark:bg-[#0b0f19]/80"
    : "rounded-lg border border-slate-200 p-4 dark:border-navy-700";
  const fieldClassName = isEnhanced
    ? "h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-fuchsia-300 focus:ring-2 focus:ring-fuchsia-200/60 dark:border-white/10 dark:bg-white/5 dark:text-slate-50 dark:placeholder:text-slate-400 dark:focus:border-fuchsia-400/60 dark:focus:ring-fuchsia-500/20"
    : "rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 dark:border-navy-600 dark:bg-navy-950 dark:text-slate-50";
  const videoFrameClassName = isEnhanced
    ? "aspect-video w-full rounded-[1.4rem] bg-black object-cover ring-1 ring-black/10 dark:ring-white/10"
    : "aspect-video w-full rounded bg-slate-900 object-cover";
  const audioFrameClassName = isEnhanced
    ? "flex aspect-video items-center justify-center rounded-[1.4rem] bg-[radial-gradient(circle_at_top,rgba(236,72,153,0.18),transparent_44%),radial-gradient(circle_at_bottom,rgba(249,115,22,0.12),transparent_46%),linear-gradient(145deg,#0b0f19,#000)] text-sm text-slate-100 ring-1 ring-black/10 dark:ring-white/10"
    : "flex aspect-video items-center justify-center rounded bg-slate-900 text-sm text-slate-200";

  return (
    <>
    {/* WhatsApp-style in-section call screen (voice + video) */}
    {showWhatsAppCallScreen ? (
      <div
        ref={callScreenRef}
        className={cn(
          "relative flex w-full flex-col overflow-hidden rounded-[1.75rem] bg-black shadow-2xl shadow-black/35",
          isBrowserFullscreen ? "h-[100vh] rounded-none" : "min-h-[70vh]"
        )}
      >
        {/* Background */}
        {activeMode === "video" ? (
          <video ref={overlayVideoRef} autoPlay playsInline className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950 to-black" />
        )}
        <div className="absolute inset-0 bg-black/15" />

        {/* Header */}
        <div className="relative z-10 flex items-start justify-between gap-3 px-5 pt-6 sm:pt-8">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-white drop-shadow">{peerDisplayName || peerId || "Call"}</p>
            <p className="mt-1 text-sm text-white/75">
              {status === "connected" ? formatDuration(callDuration) : getStatusLabel(status)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleBrowserFullscreen}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm hover:bg-white/20"
              aria-label={isBrowserFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              title={isBrowserFullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {isBrowserFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Voice call center avatar */}
        {activeMode !== "video" && (
          <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center px-6">
            <div className="flex flex-col items-center gap-4">
              <div className="flex h-28 w-28 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/10">
                <span className="text-5xl font-bold">{(peerDisplayName || peerId || "?").slice(0, 1).toUpperCase()}</span>
              </div>
              <p className="text-lg font-semibold text-white">{peerDisplayName || peerId || "Waiting"}</p>
              <p className="text-sm text-white/70">{status === "connected" ? "Voice call" : getStatusLabel(status)}</p>
            </div>
          </div>
        )}

        {/* PiP self video */}
        {activeMode === "video" && (
          <div className="absolute bottom-28 right-4 z-20 h-28 w-20 overflow-hidden rounded-2xl border border-white/20 bg-black shadow-2xl sm:bottom-32 sm:h-36 sm:w-24">
            <video ref={localVideoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
          </div>
        )}

        {/* Bottom controls (WhatsApp-like) */}
        <div className="relative z-10 mt-auto flex items-center justify-center px-6 pb-10 pt-6">
          <div className="flex items-center justify-center gap-4 rounded-full bg-black/45 px-4 py-3 backdrop-blur">
            {status === "idle" && (
              <button
                type="button"
                onClick={beginCall}
                disabled={isBusy || !currentUserId}
                className={cn(
                  "flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition",
                  isBusy ? "bg-white/15" : "bg-emerald-500 hover:bg-emerald-600"
                )}
                aria-label="Start call"
              >
                <PhoneCall className="h-6 w-6" />
              </button>
            )}

            {status !== "idle" && (
              <>
                <button
                  type="button"
                  onClick={toggleMic}
                  className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-full text-white transition-colors",
                    micEnabled ? "bg-white/15 hover:bg-white/25" : "bg-red-500 hover:bg-red-600"
                  )}
                  aria-label={micEnabled ? "Mute" : "Unmute"}
                >
                  {micEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
                </button>
                {activeMode === "video" && (
                  <button
                    type="button"
                    onClick={toggleCamera}
                    disabled={!canToggleCamera}
                    className={cn(
                      "flex h-12 w-12 items-center justify-center rounded-full text-white transition-colors",
                      cameraEnabled ? "bg-white/15 hover:bg-white/25" : "bg-slate-600 hover:bg-slate-700"
                    )}
                    aria-label={cameraEnabled ? "Camera off" : "Camera on"}
                  >
                    {cameraEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
                  </button>
                )}
                {activeMode === "video" && (
                  <button
                    type="button"
                    onClick={toggleScreenShare}
                    className={cn(
                      "flex h-12 w-12 items-center justify-center rounded-full text-white transition-colors",
                      isScreenSharing ? "bg-ui-accent hover:brightness-110" : "bg-white/15 hover:bg-white/25",
                    )}
                    aria-label={isScreenSharing ? "Stop sharing" : "Share screen"}
                  >
                    {isScreenSharing ? <MonitorOff className="h-5 w-5" /> : <Monitor className="h-5 w-5" />}
                  </button>
                )}
              </>
            )}

            {status === "ringing" && hasIncomingCall && (
              <>
                <button
                  type="button"
                  onClick={acceptIncomingCall}
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg hover:bg-emerald-600"
                  aria-label="Accept"
                >
                  <PhoneIncoming className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={rejectIncomingCall}
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-500 text-white shadow-lg hover:bg-rose-600"
                  aria-label="Reject"
                >
                  <PhoneOff className="h-5 w-5" />
                </button>
              </>
            )}

            {status !== "idle" && (
              <button
                type="button"
                onClick={leaveCall}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white shadow-lg hover:bg-red-600"
                aria-label="End call"
              >
                <PhoneOff className="h-6 w-6" />
              </button>
            )}
          </div>
        </div>
      </div>
    ) : (
      <section className={cn("mx-auto flex w-full flex-col gap-6 p-4 sm:p-8", showUserPanel ? "max-w-5xl" : "max-w-4xl")}>
      {showHero && (
        <div
          className={cn(
            "space-y-2",
            isEnhanced &&
              "relative overflow-hidden rounded-[1.75rem] border border-slate-200/70 bg-white/90 px-5 py-5 shadow-[0_24px_80px_-40px_rgba(15,23,42,0.25)] dark:border-white/10 dark:bg-[#0b0f19]/75"
          )}
        >
          {isEnhanced ? (
            <>
              <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gradient-to-br from-fuchsia-500/20 via-violet-500/15 to-orange-400/10 blur-2xl" />
              <div className="pointer-events-none absolute -left-14 -bottom-14 h-56 w-56 rounded-full bg-gradient-to-tr from-orange-400/12 via-pink-500/12 to-fuchsia-500/12 blur-3xl" />
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="badge mb-2 inline-flex border-slate-200 bg-white/80 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
                    {isVideoMode ? "Live video" : "Live voice"}
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-slate-50 sm:text-3xl">
                    {title}
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-200/80">
                    {description}
                  </p>
                </div>
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/80 text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
                  <HeroIcon className="h-5 w-5" />
                </div>
              </div>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">{title}</h1>
              <p className="text-sm text-slate-600 dark:text-slate-300">{description}</p>
            </>
          )}
        </div>
      )}

      {showWhatsAppCallScreen ? null : !canShowCallWorkspace ? (
        <div className="card border-slate-200/70 bg-white/90 p-6 text-center shadow-xl shadow-slate-200/40 dark:border-white/10 dark:bg-[#0b0f19]/80">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Select a user to start a call</p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Tap the <span className="font-semibold">phone</span> or <span className="font-semibold">video</span> button next to a user.
          </p>
        </div>
      ) : (
        <div className={cn("grid gap-5", showUserPanel ? "lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]" : "grid-cols-1")}>
          {/* Right: existing controls + streams */}
          <div className="min-w-0">

      <div
        className={cn(
          "flex flex-wrap gap-3",
          isEnhanced &&
            "rounded-[1.5rem] border border-slate-200/70 bg-white/80 p-3 shadow-lg shadow-slate-200/30 dark:border-white/10 dark:bg-white/[0.04]"
        )}
      >
        <Button
          type="button"
          onClick={beginCall}
          disabled={isBusy || !currentUserId}
          className={cn(
            isEnhanced &&
              "rounded-full px-5 bg-gradient-to-r from-fuchsia-600 via-violet-600 to-orange-500 text-white hover:brightness-110"
          )}
        >
          <PhoneCall className="mr-2 h-4 w-4" />
          {isBusy ? "Connecting..." : "Start call"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={acceptIncomingCall}
          disabled={isBusy || !hasIncomingCall}
          className={cn(isEnhanced && "rounded-full px-5")}
        >
          <PhoneIncoming className="mr-2 h-4 w-4" />
          Accept
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={rejectIncomingCall}
          disabled={isBusy || !hasIncomingCall}
          className={cn(isEnhanced && "rounded-full px-5")}
        >
          <PhoneOff className="mr-2 h-4 w-4" />
          Reject
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={leaveCall}
          disabled={!peerId && !hasIncomingCall}
          className={cn(isEnhanced && "rounded-full px-5")}
        >
          <Phone className="mr-2 h-4 w-4" />
          End
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={toggleMic}
          disabled={!localStreamRef.current}
          className={cn(isEnhanced && "rounded-full px-5")}
        >
          {micEnabled ? <Mic className="mr-2 h-4 w-4" /> : <MicOff className="mr-2 h-4 w-4" />}
          {micEnabled ? "Mute mic" : "Unmute mic"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={toggleCamera}
          disabled={!canToggleCamera}
          className={cn(isEnhanced && "rounded-full px-5")}
        >
          {cameraEnabled ? (
            <>
              <VideoOff className="mr-2 h-4 w-4" />
              Camera off
            </>
          ) : (
            <>
              <Video className="mr-2 h-4 w-4" />
              Camera on
            </>
          )}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={toggleScreenShare}
          disabled={status !== "connected" || !isVideoMode}
          className={cn(
            isEnhanced && "rounded-full px-5",
            isScreenSharing && "border-ui-accent/35 bg-ui-accent-subtle text-ui-accent-text dark:text-ui-accent-text",
          )}
        >
          {isScreenSharing ? <MonitorOff className="mr-2 h-4 w-4" /> : <Monitor className="mr-2 h-4 w-4" />}
          {isScreenSharing ? "Stop share" : "Share screen"}
        </Button>
        {status === "connected" && (
          <div
            className={cn(
              "flex items-center gap-2 rounded-full border border-emerald-200/70 bg-emerald-50/70 px-4 py-2 text-sm font-semibold text-emerald-700 dark:border-emerald-700/40 dark:bg-emerald-900/20 dark:text-emerald-300",
              isEnhanced && "rounded-full"
            )}
          >
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            {formatDuration(callDuration)}
          </div>
        )}
      </div>

      <div className={panelClassName}>
        {isEnhanced && (
          <div className="pointer-events-none absolute right-0 top-0 h-20 w-20 rounded-full bg-fuchsia-500/10 blur-2xl" />
        )}
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-200/70 bg-slate-50/70 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Status
            </div>
            <div className={cn("mt-1 text-sm font-semibold", statusToneClass)}>{getStatusLabel(status)}</div>
          </div>
          <div className="rounded-2xl border border-slate-200/70 bg-slate-50/70 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Connection
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-50">{connectionState}</div>
          </div>
          <div className="rounded-2xl border border-slate-200/70 bg-slate-50/70 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Mode
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-50">
              {activeMode === "video" ? "Video" : "Voice"}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200/70 bg-slate-50/70 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Peer
            </div>
            <div className="mt-1 truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
              {peerDisplayName || incomingOffer?.fromUserId || peerId || "Waiting"}
            </div>
          </div>
        </div>
        {error ? <p className="mt-4 text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className={panelClassName}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Local stream</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isVideoMode ? "Your camera preview" : "Your microphone is live"}
              </p>
            </div>
            {isEnhanced && (
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100/90 text-amber-700 dark:bg-navy-900/80 dark:text-sky-300">
                {isVideoMode ? <UserRound className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </div>
            )}
          </div>
          {activeMode === "video" ? (
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className={videoFrameClassName}
            />
          ) : (
            <div className={audioFrameClassName}>
              <div className="space-y-3 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/5">
                  <Mic className="h-7 w-7" />
                </div>
                <div className="text-sm font-medium text-slate-100">Microphone active for voice call</div>
              </div>
            </div>
          )}
        </div>
        <div className={panelClassName}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Remote stream</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isVideoMode ? "Remote camera appears here" : "Waiting for remote audio"}
              </p>
            </div>
            {isEnhanced && (
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100/90 text-amber-700 dark:bg-navy-900/80 dark:text-sky-300">
                {isVideoMode ? <Video className="h-4 w-4" /> : <Radio className="h-4 w-4" />}
              </div>
            )}
          </div>
          {/* FIX: keep audio element mounted so voice calls reliably play remote audio */}
          <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
          {activeMode === "video" ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className={videoFrameClassName}
            />
          ) : (
            <div className={audioFrameClassName}>
              <div className="space-y-3 text-center text-slate-100">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/5">
                  <Radio className="h-7 w-7" />
                </div>
                <div className="text-sm font-medium">Waiting for remote audio</div>
              </div>
            </div>
          )}
        </div>
      </div>
        </div>
      </div>
      )}
      </section>
    )}
    </>
  );
}
