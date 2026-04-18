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
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AppHeaderMenu } from '@/components/AppHeaderMenu';
import { ProfileMenu } from '@/components/ProfileMenu';

const linkInactiveH =
  'flex h-10 w-10 items-center justify-center rounded-xl text-stone-500 transition hover:bg-ui-muted hover:text-ui-accent dark:text-stone-400';

const linkActiveH =
  'flex h-10 w-10 items-center justify-center rounded-xl bg-ui-accent text-ui-on-accent shadow-sm shadow-amber-900/15 dark:shadow-black/30';

const linkInactiveV =
  'flex h-10 w-10 items-center justify-center rounded-xl text-ui-rail-fg-muted transition hover:bg-white/10 hover:text-ui-rail-fg';

const linkActiveV =
  'flex h-10 w-10 items-center justify-center rounded-xl bg-ui-rail-active text-ui-on-accent shadow-inner ring-1 ring-white/20';

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
      <div className="flex h-full min-h-0 w-[64px] shrink-0 flex-col items-center border-r border-white/10 bg-ui-rail py-3">
        <div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto">
          <Link
            href="/dashboard"
            className={activeNav === 'dm' ? linkActiveV : linkInactiveV}
            title="Chats"
            aria-current={activeNav === 'dm' ? 'page' : undefined}
          >
            <MessageCircle className="h-5 w-5" />
          </Link>
          <Link href="/call" className={activeNav === 'call' ? linkActiveV : linkInactiveV} title="Calls">
            <Phone className="h-5 w-5" />
          </Link>
          <Link href="/groups" className={activeNav === 'groups' ? linkActiveV : linkInactiveV} title="Groups">
            <Users className="h-5 w-5" />
          </Link>
          <div className="my-1 h-px w-7 bg-white/10" aria-hidden />
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
        <div className="mt-auto flex flex-col items-center gap-2 border-t border-white/10 pt-3">
          <span className={iconBtnGhost} title="Rewards — coming soon">
            <Gift className="h-5 w-5" />
          </span>
          <span className={iconBtnGhost} title="Settings — use profile menu">
            <Settings className="h-5 w-5" />
          </span>
          <div className="flex flex-col items-center gap-1 [&_button]:text-slate-200 [&_button:hover]:bg-white/10">
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
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-ui-border bg-ui-sidebar px-3 py-2.5">
      <div className="flex items-center gap-0.5 sm:gap-1">
        <Link
          href="/call"
          className={activeNav === 'call' ? linkActiveH : linkInactiveH}
          title="Calls"
          aria-current={activeNav === 'call' ? 'page' : undefined}
        >
          <Phone className="h-5 w-5" />
        </Link>
        <Link
          href="/dashboard"
          className={cn('relative', activeNav === 'dm' ? linkActiveH : linkInactiveH)}
          title="Chats"
          aria-current={activeNav === 'dm' ? 'page' : undefined}
        >
          <MessageCircle className="h-5 w-5" />
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
        </Link>
      </div>
      <div className="flex items-center gap-0.5">
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
