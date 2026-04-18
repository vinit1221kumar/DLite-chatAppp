'use client';

import { AppHeaderMenu } from '@/components/AppHeaderMenu';
import { AppNavIcons } from '@/components/AppNavIcons';
import { ProfileMenu } from '@/components/ProfileMenu';

/**
 * Shared shell header: avatar + username, labeled nav panel, theme/home/⋮ menu (same as dashboard).
 */
export function AppMainHeader() {
  return (
    <header className="z-20 shrink-0 border-b border-ui-border bg-ui-shell/95 backdrop-blur-xl dark:bg-ui-shell/95">
      <div className="flex w-full flex-wrap items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-5 sm:py-3">
        <ProfileMenu />

        <div className="min-w-0 flex-1">
          <div className="card flex min-h-0 w-full items-center justify-center border-ui-border bg-ui-muted/80 px-1.5 py-2 sm:px-3 dark:bg-ui-muted/50">
            <AppNavIcons showLabels className="w-full max-w-2xl justify-center" />
          </div>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <AppHeaderMenu menuLinks={[]} />
        </div>
      </div>
    </header>
  );
}
