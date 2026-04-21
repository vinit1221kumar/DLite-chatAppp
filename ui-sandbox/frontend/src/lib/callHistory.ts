export type CallDirection = "incoming" | "outgoing";
export type CallOutcome = "calling" | "ringing" | "connected" | "rejected" | "ended" | "failed" | "missed";

export type CallHistoryItem = {
  id: string;
  userId: string;
  peerId: string;
  peerName?: string;
  mode: "audio" | "video";
  direction: CallDirection;
  outcome: CallOutcome;
  startedAt: number;
  endedAt?: number;
};

const MAX_ITEMS = 60;

function keyFor(userId: string) {
  return `dlite-call-history:${userId}`;
}

export function readCallHistory(userId: string): CallHistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(keyFor(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(Boolean);
  } catch {
    return [];
  }
}

export function writeCallHistory(userId: string, items: CallHistoryItem[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(keyFor(userId), JSON.stringify(items.slice(0, MAX_ITEMS)));
  } catch {
    /* ignore */
  }
}

export function upsertCallHistoryItem(userId: string, item: CallHistoryItem) {
  const items = readCallHistory(userId);
  const idx = items.findIndex((x) => x.id === item.id);
  const next = idx >= 0 ? [...items.slice(0, idx), item, ...items.slice(idx + 1)] : [item, ...items];
  writeCallHistory(userId, next);
  return next;
}

export function clearCallHistory(userId: string) {
  writeCallHistory(userId, []);
}

export function createCallHistoryId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

