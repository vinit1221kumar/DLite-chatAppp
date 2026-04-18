'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ChatAppShell } from '@/components/ChatAppShell';
import { ChatAppIconRail } from '@/components/ChatAppIconRail';
import { useAuth } from '@/hooks/useAuth';
import { subscribeRecentDirectChats } from '@/services/chatClient';

const CallUI = dynamic(() => import('@/components/CallUI'), {
  loading: () => (
    <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-500 dark:text-slate-400">Loading call…</div>
  ),
});

export default function CallScreenPage() {
  const { user } = useAuth();
  const [dmRecentChats, setDmRecentChats] = useState([]);
  const dmUnreadTotal = useMemo(
    () => dmRecentChats.reduce((s, c) => s + Number(c.unreadCount || 0), 0),
    [dmRecentChats]
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
    <ChatAppShell gridClassName="grid-cols-1 lg:grid-cols-[minmax(300px,360px)_1fr]">
      <aside className="flex max-h-[42vh] min-h-0 flex-col border-b border-slate-200/80 bg-[#F9FAFB] dark:border-slate-800 dark:bg-slate-900/80 lg:max-h-none lg:border-b-0 lg:border-r">
        <ChatAppIconRail active="call" dmUnreadCount={dmUnreadTotal} />

        <div className="shrink-0 border-b border-slate-200/80 px-3 pb-3 pt-2 dark:border-slate-800">
          <h2 className="text-lg font-bold tracking-tight text-slate-800 dark:text-slate-100">Calls</h2>
          <div className="mb-3 mt-3 flex gap-4 border-b border-slate-200/80 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:text-slate-500">
            <Link href="/dashboard" className="transition hover:text-violet-600 dark:hover:text-violet-400">
              Direct
            </Link>
            <Link href="/groups" className="transition hover:text-violet-600 dark:hover:text-violet-400">
              Groups
            </Link>
            <span className="relative text-violet-600 dark:text-violet-400">
              Calls
              <span className="absolute -right-2.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-red-500" />
            </span>
          </div>
          <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            Start a direct call with another signed-in user. Choose audio or video in the panel.
          </p>
        </div>
      </aside>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden border-b border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 lg:border-b-0">
        <CallUI
          defaultMode="audio"
          title="Voice and video calls"
          description="Start a direct call with another signed-in user and choose audio or video on the same page."
          theme="enhanced"
        />
      </section>
    </ChatAppShell>
  );
}
