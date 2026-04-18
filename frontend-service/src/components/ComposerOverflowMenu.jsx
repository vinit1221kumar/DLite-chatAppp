'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { LogOut, Moon, MoreVertical, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppLogo } from '@/components/AppLogo';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/context/ThemeContext';

const menuItemClass =
  'flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-slate-900 no-underline transition-colors duration-150 hover:bg-sky-50 dark:text-slate-50 dark:hover:bg-slate-800';

/**
 * Theme, Home, Log out — opens upward for use beside the Send button in the composer.
 */
export function ComposerOverflowMenu() {
  const { logout } = useAuth();
  const { mode, setMode, resolved } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const toggleTheme = () => {
    if (mode === 'system') {
      setMode(resolved === 'dark' ? 'light' : 'dark');
    } else {
      setMode(mode === 'light' ? 'dark' : 'light');
    }
  };

  const ThemeIcon = resolved === 'dark' ? Moon : Sun;
  const themeLabel = resolved === 'dark' ? 'Light mode' : 'Dark mode';

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div ref={ref} className="relative shrink-0">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-10 w-10 shrink-0 rounded-full text-slate-600 hover:bg-slate-200/90 dark:text-slate-300 dark:hover:bg-slate-700/80"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="More"
        onClick={() => setOpen((o) => !o)}
      >
        <MoreVertical className="h-4 w-4" />
      </Button>
      {open ? (
        <div
          role="menu"
          className="anim-pop absolute bottom-full right-0 z-[80] mb-1.5 min-w-[200px] overflow-hidden rounded-2xl border border-slate-200/90 bg-white py-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-950"
        >
          <button type="button" role="menuitem" className={menuItemClass} onClick={() => toggleTheme()}>
            <ThemeIcon className="h-4 w-4 shrink-0 opacity-80" />
            {themeLabel}
          </button>
          <Link
            href="/"
            role="menuitem"
            className={menuItemClass}
            onClick={() => setOpen(false)}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-amber-100 ring-1 ring-amber-300/60 dark:bg-amber-950/50 dark:ring-amber-600/40">
              <AppLogo variant="mark" className="h-6 w-6" />
            </span>
            Home
          </Link>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-red-700 transition-colors duration-150 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
            onClick={() => {
              setOpen(false);
              logout();
            }}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Log out
          </button>
        </div>
      ) : null}
    </div>
  );
}
