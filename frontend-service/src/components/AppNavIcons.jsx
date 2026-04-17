'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageSquare, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const items = [
  { href: '/dashboard', label: 'Chat', caption: 'Messages', icon: MessageSquare },
  { href: '/groups', label: 'Groups', caption: 'Groups', icon: Users }
];

/**
 * Horizontal icon nav (Chat, Groups, Calls). Optional captions under icons.
 */
export function AppNavIcons({ className, showLabels = false }) {
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        'flex flex-shrink-0 items-center gap-1 rounded-2xl border border-amber-200/70 bg-amber-50/80 p-1 dark:border-navy-700/50 dark:bg-navy-950/50',
        showLabels && 'gap-0.5 border-0 bg-transparent p-0 dark:bg-transparent',
        className
      )}
      aria-label="Main navigation"
    >
      {items.map(({ href, label, caption, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Button
            key={href}
            asChild
            variant={active ? 'default' : 'ghost'}
            {...(showLabels ? {} : { size: 'icon' })}
            className={cn(
              'rounded-xl',
              showLabels
                ? 'h-auto min-h-[3.5rem] w-[4.25rem] flex-col gap-0.5 px-1.5 py-1.5 sm:w-[4.75rem] sm:py-2'
                : 'h-10 w-10',
              !active && 'text-amber-800 hover:bg-amber-100/90 dark:text-slate-200 dark:hover:bg-navy-800/50'
            )}
          >
            <Link
              href={href}
              title={label}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              className={cn(showLabels && 'flex flex-col items-center justify-center gap-0.5 no-underline')}
            >
              <Icon className={cn('shrink-0', showLabels ? 'h-5 w-5' : 'h-5 w-5')} />
              {showLabels && (
                <span
                  className={cn(
                    'max-w-full truncate text-center text-[10px] font-semibold leading-tight sm:text-[11px]',
                    active
                      ? 'text-amber-50 dark:text-white'
                      : 'text-amber-800 dark:text-slate-200'
                  )}
                >
                  {caption}
                </span>
              )}
            </Link>
          </Button>
        );
      })}
    </nav>
  );
}
