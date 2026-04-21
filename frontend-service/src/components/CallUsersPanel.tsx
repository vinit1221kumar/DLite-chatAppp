"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Clock, Phone, PhoneIncoming, PhoneOutgoing, Plus, Search, Trash2, Users, Video } from "lucide-react";
import { useAuthContext } from "@/context/AuthContext";
import { searchUsersByUsername } from "@/services/chatClient";
import { cn } from "@/lib/utils";
import { CallHistoryItem, clearCallHistory, readCallHistory } from "@/lib/callHistory";

type UserResult = { id: string; username: string };

function buildCallUrl(params: URLSearchParams, patch: Record<string, string | null>) {
  const next = new URLSearchParams(params.toString());
  Object.entries(patch).forEach(([k, v]) => {
    if (v == null || v === "") next.delete(k);
    else next.set(k, v);
  });
  const qs = next.toString();
  return qs ? `/call?${qs}` : "/call";
}

export function CallUsersPanel({ className }: { className?: string }) {
  const auth = useAuthContext();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentUserId = auth?.user?.id as string | undefined;

  const calleeId = (searchParams.get("callee") || "").trim();
  const mode = (searchParams.get("mode") || "").trim();
  const activeMode = mode === "audio" || mode === "video" ? mode : "audio";

  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<UserResult[]>([]);
  const [userLoading, setUserLoading] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [activeTab, setActiveTab] = useState<"users" | "history">("users");
  const [historyItems, setHistoryItems] = useState<CallHistoryItem[]>([]);
  const [searchOpen, setSearchOpen] = useState(true);

  const selectedUsername = useMemo(() => {
    const hit = userResults.find((u) => u.id === calleeId);
    return hit?.username || "";
  }, [calleeId, userResults]);

  useEffect(() => {
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

  const setCallee = (id: string) => {
    // Selecting a user should not reveal the call UI yet.
    router.push(buildCallUrl(searchParams, { callee: id, ready: null, mode: null }));
  };

  const clearSelectionAndSearch = () => {
    setUserQuery("");
    setUserResults([]);
    setUserLoading(false);
    setSearchOpen(true);
    router.push(buildCallUrl(searchParams, { callee: null, ready: null, mode: null }));
    setTimeout(() => searchInputRef.current?.focus(), 0);
  };

  useEffect(() => {
    if (!currentUserId) return;
    const load = () => setHistoryItems(readCallHistory(currentUserId));
    load();
    const t = window.setInterval(load, 1500);
    return () => window.clearInterval(t);
  }, [currentUserId]);

  function formatWhen(ts: number) {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function formatDuration(item: CallHistoryItem) {
    if (!item.endedAt) return "";
    const secs = Math.max(0, Math.floor((item.endedAt - item.startedAt) / 1000));
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  return (
    <aside className={cn("overflow-hidden rounded-2xl border border-ui-border bg-ui-sidebar", className)}>
      <div className="shrink-0 border-b border-ui-border px-3 pb-3 pt-2">
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {activeTab === "users" ? (
              <>
                <Users className="h-4 w-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                Users
              </>
            ) : (
              <>
                <Clock className="h-4 w-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                History
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={cn(
                "inline-flex h-9 items-center justify-center rounded-full border border-ui-border bg-ui-panel px-3 text-xs font-semibold text-slate-700 transition hover:bg-ui-muted dark:text-slate-100",
                activeTab === "history" && "ring-2 ring-[var(--ui-focus)]"
              )}
              onClick={() => setActiveTab((prev) => (prev === "history" ? "users" : "history"))}
            >
              History
            </button>
            {activeTab === "users" ? (
              <>
                <button
                  type="button"
                  className={cn(
                    "inline-flex h-9 w-9 items-center justify-center rounded-full border border-ui-border bg-ui-panel text-slate-700 transition hover:bg-ui-muted dark:text-slate-100",
                    searchOpen && "ring-2 ring-[var(--ui-focus)]"
                  )}
                  aria-label={searchOpen ? "Hide search" : "Show search"}
                  title="Search"
                  onClick={() => {
                    setSearchOpen((v) => !v);
                    setTimeout(() => searchInputRef.current?.focus(), 0);
                  }}
                >
                  <Search className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ui-border bg-ui-panel text-slate-700 transition hover:bg-ui-muted dark:text-slate-100"
                  aria-label="Add / New"
                  title="Add / New"
                  onClick={clearSelectionAndSearch}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </>
            ) : (
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ui-border bg-ui-panel text-slate-700 transition hover:bg-ui-muted disabled:opacity-50 dark:text-slate-100"
                aria-label="Clear history"
                title="Clear history"
                onClick={() => {
                  if (!currentUserId) return;
                  clearCallHistory(currentUserId);
                  setHistoryItems([]);
                }}
                disabled={!currentUserId || historyItems.length === 0}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {activeTab === "users" && searchOpen && (
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchInputRef}
              placeholder="Search username…"
              className="w-full rounded-2xl border border-ui-border bg-ui-panel py-2.5 pl-10 pr-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-ui-accent focus:ring-4 focus:ring-[var(--ui-focus)] dark:text-slate-100"
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-2">
        {activeTab === "users" ? (
          userLoading ? (
            <div className="flex items-center gap-2 px-2 py-3 text-xs text-slate-500">Searching…</div>
          ) : userResults.length === 0 ? (
            <div className="px-2 py-4 text-center text-xs text-slate-500 dark:text-slate-400">No users found.</div>
          ) : (
            <div className="space-y-1">
              {userResults.map((u) => {
                const selected = calleeId === u.id;
                return (
                  <div
                    key={u.id}
                    role="button"
                    tabIndex={0}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-transparent px-3 py-2 text-left transition outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]",
                      selected
                        ? "bg-ui-chat-active text-ui-chat-active-fg shadow-md"
                        : "text-slate-800 hover:border-ui-border hover:bg-ui-panel dark:text-slate-100 dark:hover:bg-ui-muted"
                    )}
                    onClick={() => setCallee(u.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setCallee(u.id);
                      }
                    }}
                  >
                    <Image
                      src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(u.username || u.id)}`}
                      alt=""
                      width={32}
                      height={32}
                      unoptimized
                      className={cn("h-9 w-9 shrink-0 rounded-full border object-cover", selected ? "border-white/35" : "border-ui-border")}
                    />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-sm font-semibold", selected ? "text-ui-chat-active-fg" : "")}>
                        {u.username}
                      </span>
                      <span className="block truncate font-mono text-[11px] opacity-60">{u.id.slice(0, 6)}…</span>
                    </span>

                    <span className="ml-1 flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        className={cn(
                          "inline-flex h-9 w-9 items-center justify-center rounded-xl border border-ui-border transition",
                          selected ? "border-white/25 bg-white/10 text-white hover:bg-white/15" : "bg-ui-panel text-slate-700 hover:bg-ui-muted dark:text-slate-100"
                        )}
                        aria-label={`Voice call ${u.username}`}
                        title="Voice call"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          router.push(buildCallUrl(searchParams, { callee: u.id, mode: "audio", ready: "1" }));
                        }}
                      >
                        <Phone className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className={cn(
                          "inline-flex h-9 w-9 items-center justify-center rounded-xl border border-ui-border transition",
                          selected ? "border-white/25 bg-white/10 text-white hover:bg-white/15" : "bg-ui-panel text-slate-700 hover:bg-ui-muted dark:text-slate-100"
                        )}
                        aria-label={`Video call ${u.username}`}
                        title="Video call"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          router.push(buildCallUrl(searchParams, { callee: u.id, mode: "video", ready: "1" }));
                        }}
                      >
                        <Video className="h-4 w-4" />
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <>
            {historyItems.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-slate-500 dark:text-slate-400">No calls yet.</p>
            ) : (
              <div className="space-y-1.5">
                {historyItems.slice(0, 20).map((it) => {
                  const DirectionIcon = it.direction === "incoming" ? PhoneIncoming : PhoneOutgoing;
                  const ModeIcon = it.mode === "video" ? Video : Phone;
                  const tone =
                    it.outcome === "rejected" || it.outcome === "missed" || it.outcome === "failed"
                      ? "text-rose-600 dark:text-rose-300"
                      : it.outcome === "connected"
                        ? "text-emerald-600 dark:text-emerald-300"
                        : "text-slate-600 dark:text-slate-300";
                  return (
                    <div key={it.id} className="flex items-center gap-3 rounded-2xl border border-ui-border bg-ui-panel px-3 py-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-ui-border bg-ui-muted">
                        <DirectionIcon className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {it.peerName || it.peerId}
                        </p>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                          {formatWhen(it.startedAt)}
                          {it.endedAt ? ` · ${formatDuration(it)}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <ModeIcon className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                        <span className={cn("text-xs font-semibold capitalize", tone)}>{it.outcome}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      <div className="shrink-0 border-t border-ui-border bg-ui-sidebar px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
        Selected:{" "}
        <span className="font-semibold text-slate-900 dark:text-slate-100">
          {selectedUsername || (calleeId ? "User selected" : "None")}
        </span>
        <span className="ml-2 opacity-70">·</span>
        <span className="ml-2 opacity-70">{activeMode === "video" ? "Video" : "Voice"}</span>
      </div>
    </aside>
  );
}

