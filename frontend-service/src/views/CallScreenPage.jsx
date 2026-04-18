'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { ChatAppShell } from '@/components/ChatAppShell';
import { ChatAppIconRail } from '@/components/ChatAppIconRail';
import { ChatAppTopBar } from '@/components/ChatAppTopBar';
import { useAuth } from '@/hooks/useAuth';
import { subscribeRecentDirectChats } from '@/services/chatClient';

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
        <div className="shrink-0 border-b border-ui-border px-4 pb-3 pt-3">
          <h2 className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-100">Calls</h2>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">Voice or video with another signed-in user.</p>
        </div>
      </aside>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden border-b border-ui-border bg-ui-panel lg:border-b-0">
        <CallUI
          defaultMode="audio"
          title="Voice and video"
          description="Pick a user and start a call."
          theme="enhanced"
        />
      </section>
    </ChatAppShell>
  );
}
