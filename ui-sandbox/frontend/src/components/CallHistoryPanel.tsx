"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock, Phone, PhoneIncoming, PhoneOutgoing, Trash2, Video } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { CallHistoryItem, clearCallHistory, readCallHistory } from "@/lib/callHistory";
import { Button } from "@/components/ui/button";

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

export function CallHistoryPanel({ className }: { className?: string }) {
  const { user } = useAuth();
  const userId = user?.id || "";
  const [items, setItems] = useState<CallHistoryItem[]>([]);

  useEffect(() => {
    if (!userId) return;
    const load = () => setItems(readCallHistory(userId));
    load();
    const onStorage = (e: StorageEvent) => {
      if (e.key && e.key.startsWith("dlite-call-history:")) load();
    };
    window.addEventListener("storage", onStorage);
    const t = window.setInterval(load, 1500);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.clearInterval(t);
    };
  }, [userId]);

  const hasItems = items.length > 0;

  const headerLabel = useMemo(() => {
    if (!hasItems) return "No recent calls yet";
    return `${items.length} recent`;
  }, [hasItems, items.length]);

  return (
    <div className={cn("card overflow-hidden border-ui-border bg-ui-panel/70", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-ui-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-ui-accent" />
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Call history</p>
          <span className="text-xs text-slate-500 dark:text-slate-400">{headerLabel}</span>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          disabled={!userId || !hasItems}
          title="Clear history"
          aria-label="Clear history"
          onClick={() => {
            if (!userId) return;
            clearCallHistory(userId);
            setItems([]);
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="max-h-[40vh] overflow-y-auto p-2">
        {!hasItems ? (
          <p className="px-3 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
            Start a call and it will appear here.
          </p>
        ) : (
          <div className="space-y-1.5">
            {items.slice(0, 20).map((it) => {
              const isVideo = it.mode === "video";
              const DirectionIcon = it.direction === "incoming" ? PhoneIncoming : PhoneOutgoing;
              const ModeIcon = isVideo ? Video : Phone;
              const tone =
                it.outcome === "rejected" || it.outcome === "missed" || it.outcome === "failed"
                  ? "text-rose-600 dark:text-rose-300"
                  : it.outcome === "connected"
                    ? "text-emerald-600 dark:text-emerald-300"
                    : "text-slate-600 dark:text-slate-300";
              return (
                <div
                  key={it.id}
                  className="flex items-center gap-3 rounded-2xl border border-ui-border bg-ui-muted px-3 py-2"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border border-ui-border bg-ui-panel">
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
      </div>
    </div>
  );
}

