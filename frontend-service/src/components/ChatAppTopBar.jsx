'use client';

import Link from 'next/link';
import { AppLogo } from '@/components/AppLogo';

export function ChatAppTopBar() {
  return (
    <header className="flex shrink-0 items-center justify-between gap-4 border-b border-ui-border bg-ui-shell px-4 py-3 sm:px-6">
      <Link href="/" className="flex items-center gap-2.5 no-underline">
        <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-[var(--ui-grad-from)] to-[var(--ui-grad-to)] shadow-md shadow-violet-900/15">
          <AppLogo variant="mark" className="h-6 w-6" />
        </span>
        <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">D-Lite</span>
      </Link>
      <p className="hidden text-sm font-medium text-slate-500 sm:block dark:text-slate-400">Create memorable talks</p>
    </header>
  );
}
