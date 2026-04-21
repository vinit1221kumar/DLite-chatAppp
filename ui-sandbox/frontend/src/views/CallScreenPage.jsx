'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { ChatAppShell } from '@/components/ChatAppShell';
import { ChatAppIconRail } from '@/components/ChatAppIconRail';
import { ChatAppTopBar } from '@/components/ChatAppTopBar';
import { CallUsersPanel } from '@/components/CallUsersPanel';
import { useAuth } from '@/hooks/useAuth';
import { subscribeRecentDirectChats } from '@/services/chatClient';
import { Video } from 'lucide-react';

const CallUI = dynamic(() => import('@/components/CallUI'), {
  loading: () => (
    <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-500 dark:text-slate-400">
      Loading call…
    </div>
  ),
});

export default function CallScreenPage() {
  const { user } = useAuth();
  const [dmRecentChats, setDmRecentChats] = useState([]);
  const dmUnreadTotal = useMemo(
    () => dmRecentChats.reduce((s, c) => s + Number(c.unreadCount || 0), 0),
    [dmRecentChats],
  );

  useEffect(() => {
    let unsubscribe = () => undefined;
    try {
      unsubscribe = subscribeRecentDirectChats(user?.id, (items) => {
        setDmRecentChats(items);
      });
    } catch {
      /* ignore */
    }
    return () => unsubscribe();
  }, [user?.id]);

  return (
    <ChatAppShell
      topBar={<ChatAppTopBar />}
      gridClassName="grid-cols-1 lg:grid-cols-[minmax(300px,360px)_minmax(0,1fr)]"
    >
      <aside className="flex max-h-[40vh] min-h-0 flex-col border-b border-ui-border bg-ui-sidebar lg:max-h-none lg:border-b-0 lg:border-r">
        <div className="shrink-0 border-b border-ui-border">
          <ChatAppIconRail active="call" dmUnreadCount={dmUnreadTotal} />
        </div>
        <div className="shrink-0 border-b border-ui-border px-3 pb-3 pt-3">
          <div className="relative overflow-hidden rounded-3xl border border-slate-200/70 bg-white/90 px-4 py-4 shadow-[0_18px_60px_-38px_rgba(15,23,42,0.22)] dark:border-white/10 dark:bg-[#0b0f19]/65">
            <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gradient-to-br from-fuchsia-500/18 via-violet-500/12 to-orange-400/10 blur-2xl" />
            <div className="pointer-events-none absolute -left-14 -bottom-14 h-56 w-56 rounded-full bg-gradient-to-tr from-orange-400/10 via-pink-500/10 to-fuchsia-500/10 blur-3xl" />
            <div className="relative flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="badge mb-2 inline-flex border-slate-200 bg-white/80 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
                  Live voice
                </div>
                <h2 className="text-lg font-bold tracking-tight text-slate-950 dark:text-slate-50">
                  Voice and video
                </h2>
                <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300/80">
                  Pick a user and start a call.
                </p>
              </div>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/80 text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
                <Video className="h-5 w-5" />
              </div>
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <CallUsersPanel />
        </div>
      </aside>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden border-b border-ui-border bg-ui-panel lg:border-b-0">
        <CallUI
          defaultMode="audio"
          title="Voice and video"
          description="Pick a user and start a call."
          theme="enhanced"
          showUserPanel={false}
          requireExplicitStart
          showHero={false}
        />
      </section>
    </ChatAppShell>
  );
}
