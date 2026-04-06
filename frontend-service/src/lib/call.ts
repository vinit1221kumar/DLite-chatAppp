import {
  DataSnapshot,
  Unsubscribe,
  child,
  get,
  off,
  onChildAdded,
  onValue,
  push,
  ref,
  remove,
  set,
} from "firebase/database";
import { getFirebaseAuth, getRealtimeDb } from "@/services/firebaseClient";
import { AnswerPayload, IceCandidatePayload, OfferPayload } from "@/types/call";

function userCallRef(userId: string) {
  return ref(getRealtimeDb(), `calls/${userId}`);
}

function log(message: string, payload?: unknown) {
  console.log(`[call] ${message}`, payload ?? "");
}

function getAuthUidSafe() {
  try {
    return getFirebaseAuth()?.currentUser?.uid;
  } catch {
    return undefined;
  }
}

function logWriteAttempt(params: {
  op: "set" | "update" | "remove" | "push";
  dbRef: { toString?: () => string } | string;
  payload?: unknown;
}) {
  const uid = getAuthUidSafe();
  const dbPath = typeof params.dbRef === "string" ? params.dbRef : params.dbRef?.toString?.() ?? "unknown-path";
  console.log(`[call][WRITE] op=${params.op} path=${dbPath} authUid=${uid}`, {
    payload: params.payload ?? null,
    authenticated: Boolean(uid),
  });
}

function logPermissionHint(op: string, path: string) {
  const uid = getAuthUidSafe();
  console.error(`[call][WRITE] Permission denied suspected. op=${op} path=${path} authUid=${uid}`);
  console.error(
    `[call][WRITE] Rule hint: check Realtime DB security rules allow ${
      uid ? "authenticated user" : "unauthenticated"
    } to ${op} on ${path}. If using ownership-based rules, ensure userId in path matches auth.uid.`
  );
}

function getErrorField(e: unknown, key: "code" | "message") {
  if (!e || typeof e !== "object") return undefined;
  const value = (e as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function isPermissionDeniedError(e: unknown) {
  const code = getErrorField(e, "code");
  const message = String(getErrorField(e, "message") || "").toLowerCase();
  // SDKs commonly use codes like: "permission-denied" / "PERMISSION_DENIED"
  return code === "permission-denied" || code === "PERMISSION_DENIED" || message.includes("permission denied");
}

async function clearPeerSignalState(userId: string, peerUserId: string) {
  // FIX: disambiguate which Promise.all is running (useful when stack shows only index).
  console.log('[call][WRITE] clearPeerSignalState start', {
    userId,
    peerUserId,
    authUid: getAuthUidSafe()
  });
  const offerRef = child(userCallRef(userId), "offer");
  const answerRef = child(userCallRef(userId), "answer");
  const rejectedRef = child(userCallRef(userId), "rejected");
  const candidatesRef = child(userCallRef(userId), `candidates/${peerUserId}`);

  await Promise.all([
    (async () => {
      const path = offerRef.toString();
      logWriteAttempt({ op: "remove", dbRef: offerRef, payload: null });
      try {
        await remove(offerRef);
      } catch (e) {
        console.error(`[call][WRITE-FAIL] remove offer failed path=${path}`, e);
        logPermissionHint("remove", path);
        // FIX: cleanup is best-effort; permission denied should not abort call flow.
        if (isPermissionDeniedError(e)) return;
        throw e;
      }
    })(),
    (async () => {
      const path = answerRef.toString();
      logWriteAttempt({ op: "remove", dbRef: answerRef, payload: null });
      try {
        await remove(answerRef);
      } catch (e) {
        console.error(`[call][WRITE-FAIL] remove answer failed path=${path}`, e);
        logPermissionHint("remove", path);
        // FIX: cleanup is best-effort; permission denied should not abort call flow.
        if (isPermissionDeniedError(e)) return;
        throw e;
      }
    })(),
    (async () => {
      const path = rejectedRef.toString();
      logWriteAttempt({ op: "remove", dbRef: rejectedRef, payload: null });
      try {
        await remove(rejectedRef);
      } catch (e) {
        console.error(`[call][WRITE-FAIL] remove rejected failed path=${path}`, e);
        logPermissionHint("remove", path);
        // FIX: cleanup is best-effort; permission denied should not abort call flow.
        if (isPermissionDeniedError(e)) return;
        throw e;
      }
    })(),
    (async () => {
      const path = candidatesRef.toString();
      logWriteAttempt({ op: "remove", dbRef: candidatesRef, payload: null });
      try {
        await remove(candidatesRef);
      } catch (e) {
        console.error(`[call][WRITE-FAIL] remove candidates failed path=${path}`, e);
        logPermissionHint("remove", path);
        // FIX: cleanup is best-effort; permission denied should not abort call flow.
        if (isPermissionDeniedError(e)) return;
        throw e;
      }
    })(),
  ]);
}

export async function startCall(params: {
  callerId: string;
  calleeId: string;
  offer: RTCSessionDescriptionInit;
  mode: "audio" | "video";
}) {
  const { callerId, calleeId, offer, mode } = params;
  const offerPayload: OfferPayload = {
    type: offer.type as RTCSdpType,
    sdp: offer.sdp ?? "",
    fromUserId: callerId,
    mode,
    createdAt: Date.now(),
  };
  log("startCall -> write offer", { callerId, calleeId, mode });
  await Promise.all([
    clearPeerSignalState(callerId, calleeId),
    clearPeerSignalState(calleeId, callerId),
  ]);
  const offerOutRef = child(userCallRef(calleeId), "offer");
  const offerOutPath = offerOutRef.toString();
  logWriteAttempt({ op: "set", dbRef: offerOutRef, payload: offerPayload });
  try {
    await set(offerOutRef, offerPayload);
  } catch (e) {
    console.error(`[call][WRITE-FAIL] set offer failed path=${offerOutPath}`, e);
    logPermissionHint("set", offerOutPath);
    throw e;
  }
}

export function listenForIncomingCall(
  userId: string,
  onIncoming: (payload: OfferPayload | null) => void
): Unsubscribe {
  const offerRef = child(userCallRef(userId), "offer");
  const unsubscribe = onValue(offerRef, (snapshot) => {
    onIncoming(snapshot.exists() ? (snapshot.val() as OfferPayload) : null);
  });
  return () => {
    off(offerRef);
    unsubscribe();
  };
}

export async function acceptCall(params: {
  userId: string;
  callerId: string;
  answer: RTCSessionDescriptionInit;
}) {
  const { userId, callerId, answer } = params;
  const payload: AnswerPayload = {
    type: answer.type as RTCSdpType,
    sdp: answer.sdp ?? "",
    fromUserId: userId,
    createdAt: Date.now(),
  };
  log("acceptCall -> write answer", { userId, callerId });
  // FIX: disambiguate which Promise.all is running (useful when stack shows only index).
  console.log('[call][WRITE] acceptCall clear removals start', {
    userId,
    callerId,
    authUid: getAuthUidSafe()
  });
  const rejectedRef = child(userCallRef(callerId), "rejected");
  const candRef = child(userCallRef(callerId), `candidates/${userId}`);
  await Promise.all([
    (async () => {
      const path = rejectedRef.toString();
      logWriteAttempt({ op: "remove", dbRef: rejectedRef, payload: null });
      try {
        await remove(rejectedRef);
      } catch (e) {
        console.error(`[call][WRITE-FAIL] remove rejected failed path=${path}`, e);
        logPermissionHint("remove", path);
        // FIX: cleanup is best-effort; permission denied should not abort call flow.
        if (isPermissionDeniedError(e)) return;
        throw e;
      }
    })(),
    (async () => {
      const path = candRef.toString();
      logWriteAttempt({ op: "remove", dbRef: candRef, payload: null });
      try {
        await remove(candRef);
      } catch (e) {
        console.error(`[call][WRITE-FAIL] remove candidates failed path=${path}`, e);
        logPermissionHint("remove", path);
        // FIX: cleanup is best-effort; permission denied should not abort call flow.
        if (isPermissionDeniedError(e)) return;
        throw e;
      }
    })(),
  ]);
  const answerRef = child(userCallRef(callerId), "answer");
  const answerPath = answerRef.toString();
  logWriteAttempt({ op: "set", dbRef: answerRef, payload });
  try {
    await set(answerRef, payload);
  } catch (e) {
    console.error(`[call][WRITE-FAIL] set answer failed path=${answerPath}`, e);
    logPermissionHint("set", answerPath);
    throw e;
  }
  const offerRef = child(userCallRef(userId), "offer");
  const offerPath = offerRef.toString();
  logWriteAttempt({ op: "remove", dbRef: offerRef, payload: null });
  try {
    await remove(offerRef);
  } catch (e) {
    console.error(`[call][WRITE-FAIL] remove offer failed path=${offerPath}`, e);
    logPermissionHint("remove", offerPath);
    throw e;
  }

  const rejRef = child(userCallRef(userId), "rejected");
  const rejPath = rejRef.toString();
  logWriteAttempt({ op: "remove", dbRef: rejRef, payload: null });
  try {
    await remove(rejRef);
  } catch (e) {
    console.error(`[call][WRITE-FAIL] remove rejected failed path=${rejPath}`, e);
    logPermissionHint("remove", rejPath);
    throw e;
  }
}

export function listenForAnswer(
  userId: string,
  onAnswer: (payload: AnswerPayload | null) => void
): Unsubscribe {
  const answerRef = child(userCallRef(userId), "answer");
  const unsubscribe = onValue(answerRef, (snapshot: DataSnapshot) => {
    onAnswer(snapshot.exists() ? (snapshot.val() as AnswerPayload) : null);
  });
  return () => {
    off(answerRef);
    unsubscribe();
  };
}

export async function publishIceCandidate(params: {
  targetUserId: string;
  fromUserId: string;
  candidate: IceCandidatePayload;
}) {
  const { targetUserId, fromUserId, candidate } = params;
  const candidatesRef = child(userCallRef(targetUserId), `candidates/${fromUserId}`);
  const outRef = push(candidatesRef);
  const path = outRef.toString();
  logWriteAttempt({ op: "set", dbRef: outRef, payload: candidate });
  try {
    await set(outRef, candidate);
  } catch (e) {
    console.error(`[call][WRITE-FAIL] set ice candidate failed path=${path}`, e);
    logPermissionHint("set", path);
    throw e;
  }
}

export async function clearIceCandidates(userId: string, fromUserId: string) {
  const cRef = child(userCallRef(userId), `candidates/${fromUserId}`);
  const path = cRef.toString();
  logWriteAttempt({ op: "remove", dbRef: cRef, payload: null });
  try {
    await remove(cRef);
  } catch (e) {
    console.error(`[call][WRITE-FAIL] remove ice candidates failed path=${path}`, e);
    logPermissionHint("remove", path);
    throw e;
  }
}

export function listenForIceCandidates(params: {
  userId: string;
  fromUserId: string;
  onCandidate: (payload: IceCandidatePayload) => void;
}): Unsubscribe {
  const { userId, fromUserId, onCandidate } = params;
  const candidatesRef = child(userCallRef(userId), `candidates/${fromUserId}`);
  const unsubscribe = onChildAdded(candidatesRef, (snapshot) => {
    if (!snapshot.exists()) return;
    onCandidate(snapshot.val() as IceCandidatePayload);
  });
  return () => {
    off(candidatesRef);
    unsubscribe();
  };
}

export async function rejectCall(params: { userId: string; callerId: string }) {
  const { userId, callerId } = params;
  log("rejectCall", { userId, callerId });
  const offerRef = child(userCallRef(userId), "offer");
  const offerPath = offerRef.toString();
  logWriteAttempt({ op: "remove", dbRef: offerRef, payload: null });
  try {
    await remove(offerRef);
  } catch (e) {
    console.error(`[call][WRITE-FAIL] remove offer failed path=${offerPath}`, e);
    logPermissionHint("remove", offerPath);
    throw e;
  }

  const candRef = child(userCallRef(userId), `candidates/${callerId}`);
  const candPath = candRef.toString();
  logWriteAttempt({ op: "remove", dbRef: candRef, payload: null });
  try {
    await remove(candRef);
  } catch (e) {
    console.error(`[call][WRITE-FAIL] remove candidates failed path=${candPath}`, e);
    logPermissionHint("remove", candPath);
    throw e;
  }

  const rejRef = child(userCallRef(callerId), "rejected");
  const rejPath = rejRef.toString();
  const rejectedPayload = {
    byUserId: userId,
    createdAt: Date.now(),
  };
  logWriteAttempt({ op: "set", dbRef: rejRef, payload: rejectedPayload });
  try {
    await set(rejRef, rejectedPayload);
  } catch (e) {
    console.error(`[call][WRITE-FAIL] set rejected failed path=${rejPath}`, e);
    logPermissionHint("set", rejPath);
    throw e;
  }
}

export function listenForRejection(
  userId: string,
  onRejected: (payload: { byUserId: string; createdAt: number } | null) => void
): Unsubscribe {
  const rejectedRef = child(userCallRef(userId), "rejected");
  const unsubscribe = onValue(rejectedRef, (snapshot) => {
    onRejected(
      snapshot.exists()
        ? (snapshot.val() as { byUserId: string; createdAt: number })
        : null
    );
  });
  return () => {
    off(rejectedRef);
    unsubscribe();
  };
}

export async function endCall(params: { userId: string; peerUserId?: string | null }) {
  const { userId, peerUserId } = params;
  log("endCall", { userId, peerUserId });
  const tasks: Promise<void>[] = [
    (async () => {
      const outRef = userCallRef(userId);
      const path = outRef.toString();
      logWriteAttempt({ op: "remove", dbRef: outRef, payload: null });
      try {
        await remove(outRef);
      } catch (e) {
        console.error(`[call][WRITE-FAIL] remove calls/${userId} failed path=${path}`, e);
        logPermissionHint("remove", path);
        // FIX: cleanup is best-effort; permission denied should not abort call cleanup.
        if (isPermissionDeniedError(e)) return;
        throw e;
      }
    })(),
  ];
  if (peerUserId) {
    const pUserRef = userCallRef(peerUserId);
    tasks.push(
      (async () => {
        const outRef = child(pUserRef, "offer");
        const path = outRef.toString();
        logWriteAttempt({ op: "remove", dbRef: outRef, payload: null });
        try {
          await remove(outRef);
        } catch (e) {
          console.error(`[call][WRITE-FAIL] remove offer failed path=${path}`, e);
          logPermissionHint("remove", path);
          // FIX: cleanup is best-effort; permission denied should not abort call cleanup.
          if (isPermissionDeniedError(e)) return;
          throw e;
        }
      })(),
      (async () => {
        const outRef = child(pUserRef, "answer");
        const path = outRef.toString();
        logWriteAttempt({ op: "remove", dbRef: outRef, payload: null });
        try {
          await remove(outRef);
        } catch (e) {
          console.error(`[call][WRITE-FAIL] remove answer failed path=${path}`, e);
          logPermissionHint("remove", path);
          // FIX: cleanup is best-effort; permission denied should not abort call cleanup.
          if (isPermissionDeniedError(e)) return;
          throw e;
        }
      })(),
      (async () => {
        const outRef = child(pUserRef, `candidates/${userId}`);
        const path = outRef.toString();
        logWriteAttempt({ op: "remove", dbRef: outRef, payload: null });
        try {
          await remove(outRef);
        } catch (e) {
          console.error(`[call][WRITE-FAIL] remove candidates failed path=${path}`, e);
          logPermissionHint("remove", path);
          // FIX: cleanup is best-effort; permission denied should not abort call cleanup.
          if (isPermissionDeniedError(e)) return;
          throw e;
        }
      })(),
      (async () => {
        const outRef = child(pUserRef, "rejected");
        const path = outRef.toString();
        logWriteAttempt({ op: "remove", dbRef: outRef, payload: null });
        try {
          await remove(outRef);
        } catch (e) {
          console.error(`[call][WRITE-FAIL] remove rejected failed path=${path}`, e);
          logPermissionHint("remove", path);
          // FIX: cleanup is best-effort; permission denied should not abort call cleanup.
          if (isPermissionDeniedError(e)) return;
          throw e;
        }
      })()
    );
  }
  await Promise.all(tasks);
}

export async function hasActiveIncomingOffer(userId: string) {
  const snapshot = await get(child(userCallRef(userId), "offer"));
  return snapshot.exists();
}
