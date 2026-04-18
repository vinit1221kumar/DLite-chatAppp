import { IceCandidatePayload } from "@/types/call";

const FALLBACK_STUN: RTCIceServer = { urls: "stun:stun.l.google.com:19302" };

function normalizeIceServers(parsed: unknown[]): RTCIceServer[] {
  const out: RTCIceServer[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") continue;
    const o = entry as Record<string, unknown>;
    let urls = o.urls;
    if (typeof urls === "string") {
      const t = urls.trim();
      if (!t) continue;
      urls = t;
    } else if (Array.isArray(urls)) {
      const list = urls
        .filter((u): u is string => typeof u === "string")
        .map((u) => u.trim())
        .filter(Boolean);
      if (list.length === 0) continue;
      urls = list;
    } else {
      continue;
    }
    const server: RTCIceServer = { urls: urls as string | string[] };
    if (typeof o.username === "string" && o.username) server.username = o.username;
    if (typeof o.credential === "string" && o.credential) server.credential = o.credential;
    out.push(server);
  }
  return out;
}

function configHasStun(servers: RTCIceServer[]): boolean {
  for (const s of servers) {
    const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
    for (const url of urls) {
      if (typeof url === "string" && /^stun:/i.test(url)) return true;
    }
  }
  return false;
}

function readIceServersFromEnv(): RTCIceServer[] | null {
  // Accept JSON to support TURN credentials without complex parsing.
  // Example:
  // NEXT_PUBLIC_ICE_SERVERS_JSON='[{"urls":["stun:stun.l.google.com:19302"]},{"urls":["turn:turn.example.com:3478"],"username":"u","credential":"p"}]'
  const raw = process.env.NEXT_PUBLIC_ICE_SERVERS_JSON;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const normalized = normalizeIceServers(parsed);
    return normalized.length ? normalized : null;
  } catch {
    return null;
  }
}

export const DEFAULT_ICE_SERVERS: RTCIceServer[] = (() => {
  const fromEnv = readIceServersFromEnv();
  if (!fromEnv?.length) return [FALLBACK_STUN];
  if (!configHasStun(fromEnv)) return [FALLBACK_STUN, ...fromEnv];
  return fromEnv;
})();

/** True if at least one entry uses TURN/TURNS (relay). STUN-only often fails across strict NATs. */
export function iceConfigHasRelayServer(servers: RTCIceServer[]): boolean {
  for (const s of servers) {
    const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
    for (const url of urls) {
      if (typeof url === "string" && /^(turn|turns):/i.test(url)) return true;
    }
  }
  return false;
}

interface CreatePeerConnectionArgs {
  onIceCandidate?: (candidate: IceCandidatePayload) => void;
  onTrack?: (event: RTCTrackEvent) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  senderUserId: string;
}

export function createPeerConnection({
  onIceCandidate,
  onTrack,
  onConnectionStateChange,
  senderUserId,
}: CreatePeerConnectionArgs): RTCPeerConnection {
  const peerConnection = new RTCPeerConnection({
    iceServers: DEFAULT_ICE_SERVERS,
    iceCandidatePoolSize: 10,
  });

  peerConnection.onicecandidate = (event) => {
    if (!event.candidate || !onIceCandidate) return;
    const c = event.candidate;
    onIceCandidate({
      fromUserId: senderUserId,
      candidate: c.candidate,
      sdpMid: c.sdpMid,
      sdpMLineIndex: c.sdpMLineIndex,
      usernameFragment: c.usernameFragment,
      createdAt: Date.now(),
    });
  };

  peerConnection.ontrack = (event) => {
    onTrack?.(event);
  };

  peerConnection.onconnectionstatechange = () => {
    onConnectionStateChange?.(peerConnection.connectionState);
  };

  return peerConnection;
}

export async function createOffer(peerConnection: RTCPeerConnection) {
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  return offer;
}

export async function createAnswer(peerConnection: RTCPeerConnection) {
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  return answer;
}

export async function setRemoteDescription(
  peerConnection: RTCPeerConnection,
  description: RTCSessionDescriptionInit
) {
  if (!description.sdp || !description.type) return;
  await peerConnection.setRemoteDescription(new RTCSessionDescription(description));
}

export async function addIceCandidate(
  peerConnection: RTCPeerConnection,
  candidate: Pick<
    IceCandidatePayload,
    "candidate" | "sdpMid" | "sdpMLineIndex" | "usernameFragment"
  >
) {
  await peerConnection.addIceCandidate(
    new RTCIceCandidate({
      candidate: candidate.candidate,
      sdpMid: candidate.sdpMid,
      sdpMLineIndex: candidate.sdpMLineIndex,
      usernameFragment: candidate.usernameFragment ?? undefined,
    })
  );
}

export function attachLocalTracks(
  peerConnection: RTCPeerConnection,
  stream: MediaStream
) {
  stream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, stream);
  });
}

export function cleanupPeerConnection(peerConnection: RTCPeerConnection | null) {
  if (!peerConnection) return;
  peerConnection.onicecandidate = null;
  peerConnection.ontrack = null;
  peerConnection.onconnectionstatechange = null;
  peerConnection.close();
}
