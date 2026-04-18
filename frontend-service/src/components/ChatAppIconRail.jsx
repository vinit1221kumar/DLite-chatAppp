'use client';

import Link from 'next/link';
import { Mail, MessageCircle, Phone, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AppHeaderMenu } from '@/components/AppHeaderMenu';
import { ProfileMenu } from '@/components/ProfileMenu';

const linkInactive =
  'flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition hover:bg-white hover:text-violet-600 dark:text-slate-400 dark:hover:bg-slate-800';

const linkActive =
  'flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm shadow-violet-600/25';

export function ChatAppIconRail({ active: activeNav = 'dm', dmUnreadCount = 0, menuLinks = [] }) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200/80 px-3 py-2.5 dark:border-slate-800">
      <div className="flex items-center gap-0.5 sm:gap-1">
        <Link
          href="/dashboard"
          className={cn('relative', activeNav === 'dm' ? linkActive : linkInactive)}
          title="Chats"
          aria-current={activeNav === 'dm' ? 'page' : undefined}
        >
          <MessageCircle className="h-5 w-5" />
          {dmUnreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
              {dmUnreadCount > 9 ? '9+' : dmUnreadCount}
            </span>
          ) : null}
        </Link>
        <Link
          href="/call"
          className={activeNav === 'call' ? linkActive : linkInactive}
          title="Calls"
          aria-current={activeNav === 'call' ? 'page' : undefined}
        >
          <Phone className="h-5 w-5" />
        </Link>
        <span
          className="relative flex h-10 w-10 cursor-not-allowed items-center justify-center rounded-xl text-slate-300 dark:text-slate-600"
          title="Mail — coming soon"
        >
          <Mail className="h-5 w-5" />
          <span className="absolute -right-0.5 top-0.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-[#F9FAFB] dark:ring-slate-900" />
        </span>
        <Link
          href="/groups"
          className={activeNav === 'groups' ? linkActive : linkInactive}
          title="Groups"
          aria-current={activeNav === 'groups' ? 'page' : undefined}
        >
          <Users className="h-5 w-5" />
        </Link>
      </div>
      <div className="flex items-center gap-0.5">
        <AppHeaderMenu menuLinks={menuLinks} />
        <ProfileMenu />
      </div>
    </div>
  );
}
