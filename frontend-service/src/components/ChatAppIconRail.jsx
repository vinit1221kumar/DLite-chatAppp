'use client';

import Link from 'next/link';
import {
  BarChart2,
  Database,
  Gift,
  LayoutGrid,
  Megaphone,
  MessageCircle,
  Phone,
  Settings,
  Sparkles,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AppHeaderMenu } from '@/components/AppHeaderMenu';
import { ProfileMenu } from '@/components/ProfileMenu';

const linkInactiveH =
  'flex min-h-[3.25rem] w-[4.25rem] flex-col items-center justify-center gap-0.5 rounded-2xl px-1.5 py-1.5 text-slate-600 transition hover:bg-ui-muted hover:text-ui-accent dark:text-slate-300';

const linkActiveH =
  'flex min-h-[3.25rem] w-[4.25rem] flex-col items-center justify-center gap-0.5 rounded-2xl bg-ui-accent px-1.5 py-1.5 text-ui-on-accent shadow-sm shadow-violet-900/15 dark:shadow-black/25';

const linkInactiveV =
  'flex h-10 w-10 items-center justify-center rounded-xl text-ui-rail-fg-muted transition hover:bg-ui-muted hover:text-ui-accent dark:hover:bg-white/10 dark:hover:text-ui-rail-fg';

const linkActiveV =
  'flex h-10 w-10 items-center justify-center rounded-xl bg-ui-accent text-ui-on-accent shadow-sm dark:shadow-inner dark:ring-1 dark:ring-white/15';

const iconBtnGhost =
  'flex h-10 w-10 cursor-not-allowed items-center justify-center rounded-xl text-ui-rail-fg-muted opacity-45';

/**
 * @param {'horizontal' | 'vertical'} [props.variant]
 */
export function ChatAppIconRail({
  active: activeNav = 'dm',
  dmUnreadCount = 0,
  menuLinks = [],
  variant = 'horizontal',
}) {
  if (variant === 'vertical') {
    return (
      <div className="flex h-full min-h-0 w-[64px] shrink-0 flex-col items-center border-r border-ui-border bg-ui-rail py-3">
        <div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto">
          <Link
            href="/dashboard"
            className={activeNav === 'dm' ? linkActiveV : linkInactiveV}
            title="Chats"
            aria-current={activeNav === 'dm' ? 'page' : undefined}
          >
            <MessageCircle className="h-5 w-5" />
          </Link>
          <Link href="/groups" className={activeNav === 'groups' ? linkActiveV : linkInactiveV} title="Groups">
            <Users className="h-5 w-5" />
          </Link>
          <Link href="/call" className={activeNav === 'call' ? linkActiveV : linkInactiveV} title="Calls">
            <Phone className="h-5 w-5" />
          </Link>
          <div className="my-1 h-px w-7 bg-ui-border" aria-hidden />
          <Link href="/" className={linkInactiveV} title="Home">
            <LayoutGrid className="h-5 w-5" />
          </Link>
          <span className={iconBtnGhost} title="Analytics — coming soon">
            <BarChart2 className="h-5 w-5" />
          </span>
          <span className={iconBtnGhost} title="Campaigns — coming soon">
            <Megaphone className="h-5 w-5" />
          </span>
          <span className={iconBtnGhost} title="Data — coming soon">
            <Database className="h-5 w-5" />
          </span>
        </div>
        <div className="mt-auto flex flex-col items-center gap-2 border-t border-ui-border pt-3">
          <span className={iconBtnGhost} title="Rewards — coming soon">
            <Gift className="h-5 w-5" />
          </span>
          <span className={iconBtnGhost} title="Settings — use profile menu">
            <Settings className="h-5 w-5" />
          </span>
          <div className="flex flex-col items-center gap-1 [&_button]:text-ui-rail-fg [&_button:hover]:bg-ui-muted dark:[&_button:hover]:bg-white/10">
            <AppHeaderMenu
              collapseActionsInMenu
              showChatsInCollapsedMenu={false}
              chatsUnreadCount={dmUnreadCount}
              menuLinks={menuLinks}
            />
            <ProfileMenu />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex shrink-0 items-center gap-2 border-b border-ui-border bg-ui-sidebar px-3 py-2.5">
      {/* Centered nav (like Special Friend) */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="pointer-events-auto flex max-w-[calc(100%-7.5rem)] items-center gap-1 sm:gap-1.5">
          <Link
            href="/dashboard"
            className={cn('relative', activeNav === 'dm' ? linkActiveH : linkInactiveH)}
            title="Messages"
            aria-current={activeNav === 'dm' ? 'page' : undefined}
          >
            <MessageCircle className="h-5 w-5" />
            <span className={cn('text-[10px] font-semibold leading-tight', activeNav === 'dm' ? 'text-ui-on-accent' : 'text-slate-600 dark:text-slate-300')}>
              Messages
            </span>
            {dmUnreadCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-ui-shell">
                {dmUnreadCount > 99 ? '99+' : dmUnreadCount}
              </span>
            ) : null}
          </Link>
          <Link
            href="/groups"
            className={activeNav === 'groups' ? linkActiveH : linkInactiveH}
            title="Groups"
            aria-current={activeNav === 'groups' ? 'page' : undefined}
          >
            <Users className="h-5 w-5" />
            <span className={cn('text-[10px] font-semibold leading-tight', activeNav === 'groups' ? 'text-ui-on-accent' : 'text-slate-600 dark:text-slate-300')}>
              Groups
            </span>
          </Link>
          <Link
            href="/call"
            className={activeNav === 'call' ? linkActiveH : linkInactiveH}
            title="Calls"
            aria-current={activeNav === 'call' ? 'page' : undefined}
          >
            <Phone className="h-5 w-5" />
            <span className={cn('text-[10px] font-semibold leading-tight', activeNav === 'call' ? 'text-ui-on-accent' : 'text-slate-600 dark:text-slate-300')}>
              Calls
            </span>
          </Link>

          {/* Special Friend: premium pill button */}
          <Link
            href="/special-friend"
            className={cn(
              // Use the same icon+label vertical layout as others (fixes cramped pill).
              'relative flex min-h-[3.25rem] w-[4.25rem] flex-col items-center justify-center gap-0.5 overflow-hidden rounded-2xl border border-violet-300/45',
              'bg-gradient-to-r from-violet-600 via-indigo-600 to-fuchsia-600 px-1.5 py-1.5 text-white',
              'shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_12px_36px_-20px_rgba(99,102,241,0.7)] ring-1 ring-white/15 transition duration-200',
              'hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.12),0_16px_42px_-18px_rgba(99,102,241,0.85)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/70 motion-safe:animate-pulse'
            )}
            aria-label="Open Special Friend"
            style={{ animationDuration: '2.9s' }}
            title="Special Friend"
          >
            <span className="absolute inset-0 bg-white/10 opacity-70 blur-xl" aria-hidden="true" />
            <Sparkles className="relative z-10 h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="relative z-10 max-w-full truncate text-center text-[10px] font-semibold leading-tight">
              Special
            </span>
          </Link>
        </div>
      </div>

      {/* Right-side actions */}
      <div className="ml-auto flex items-center gap-0.5">
        <AppHeaderMenu
          collapseActionsInMenu
          showChatsInCollapsedMenu={false}
          chatsUnreadCount={dmUnreadCount}
          menuLinks={menuLinks}
        />
        <ProfileMenu />
      </div>
    </div>
  );
}
