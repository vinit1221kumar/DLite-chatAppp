'use client';

import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { AppLogo } from '@/components/AppLogo';
import { cn } from '@/lib/utils';

export function ChatAppTopBar({
  showSpecialFriend = false,
  onSpecialFriendClick,
  specialFriendLaunching = false
}) {
  return (
    <header className="relative flex shrink-0 items-center justify-between gap-4 border-b border-ui-border bg-ui-shell px-4 py-3 sm:px-6">
      <Link href="/" className="flex items-center gap-2.5 no-underline">
        <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-[var(--ui-grad-from)] to-[var(--ui-grad-to)] shadow-md shadow-violet-900/15">
          <AppLogo variant="mark" className="h-6 w-6" />
        </span>
        <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">D-Lite</span>
      </Link>

      {showSpecialFriend ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4">
          <button
            type="button"
            onClick={onSpecialFriendClick}
            disabled={specialFriendLaunching}
            className={cn(
              'pointer-events-auto relative inline-flex items-center gap-2 overflow-hidden rounded-full border border-violet-300/45 bg-gradient-to-r from-violet-600 via-indigo-600 to-fuchsia-600 px-4 py-2 text-sm font-semibold text-white',
              'shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_12px_36px_-14px_rgba(99,102,241,0.75)] ring-1 ring-white/15 transition duration-200',
              'hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.12),0_16px_42px_-14px_rgba(99,102,241,0.9)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/70',
              specialFriendLaunching ? 'scale-95 opacity-90' : 'motion-safe:animate-pulse'
            )}
            style={{ animationDuration: '2.9s' }}
            aria-label="Open Special Friend"
          >
            <span className="absolute inset-0 bg-white/10 opacity-70 blur-xl" aria-hidden />
            <Sparkles className="relative z-10 h-4 w-4 shrink-0" aria-hidden />
            <span className="relative z-10">Special Friend</span>
          </button>
        </div>
      ) : null}

      <p className="hidden text-sm font-medium text-slate-500 sm:block dark:text-slate-400">Create memorable talks</p>
    </header>
  );
}
