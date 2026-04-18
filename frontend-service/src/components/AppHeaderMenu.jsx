'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { LogOut, MessageCircle, Moon, MoreVertical, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/context/ThemeContext';
import { AppLogo } from '@/components/AppLogo';

const menuItemClass =
  'flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-slate-900 no-underline transition-colors duration-150 hover:bg-violet-50 dark:text-slate-50 dark:hover:bg-slate-800';

/**
 * Theme toggle + round Home + three-dot menu (Instagram-style).
 * Set collapseActionsInMenu to put theme, home, and Chats (with optional unread) inside the menu only.
 * @param {object} props
 * @param {boolean} [props.showHomeButton=true]
 * @param {{ href: string, label: string, icon: import('lucide-react').LucideIcon }[]} [props.menuLinks=[]]
 * @param {boolean} [props.showLogout=true]
 * @param {boolean} [props.collapseActionsInMenu=false]
 * @param {boolean} [props.showChatsInCollapsedMenu=true] — Chats row in the overflow menu when collapsed (set false if rail shows Chats)
 * @param {number} [props.chatsUnreadCount=0] — badge on Chats row when collapseActionsInMenu
 */
export function AppHeaderMenu({
  showHomeButton = true,
  menuLinks = [],
  showLogout = true,
  collapseActionsInMenu = false,
  showChatsInCollapsedMenu = true,
  chatsUnreadCount = 0,
}) {
  const { logout } = useAuth();
  const { mode, setMode, resolved } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const toggleThemeInMenu = () => {
    if (mode === 'system') {
      setMode(resolved === 'dark' ? 'light' : 'dark');
    } else {
      setMode(mode === 'light' ? 'dark' : 'light');
    }
  };

  const ThemeMenuIcon = resolved === 'dark' ? Moon : Sun;
  const themeMenuLabel = resolved === 'dark' ? 'Light mode' : 'Dark mode';

  useEffect(() => {
    const onDoc = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const hasInlineMenuBody = menuLinks.length > 0 || showLogout;
  const showMenuTrigger = collapseActionsInMenu || hasInlineMenuBody;

  return (
    <div className="flex items-center gap-1.5">
      {!collapseActionsInMenu && (
        <>
          <ThemeToggle />
          {showHomeButton && (
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="rounded-full p-0 hover:bg-transparent focus-visible:ring-2 focus-visible:ring-violet-500/50 dark:focus-visible:ring-sky-400/45"
              title="Home"
              aria-label="Home"
            >
              <Link href="/" onClick={() => setMenuOpen(false)}>
                <AppLogo variant="mark" className="h-9 w-9" />
              </Link>
            </Button>
          )}
        </>
      )}

      {showMenuTrigger && (
        <div ref={menuRef} className="relative">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="rounded-full"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label="Open menu"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <MoreVertical className="h-5 w-5" />
          </Button>
          {menuOpen && (
            <div
              role="menu"
              className="anim-pop absolute right-0 top-full z-50 mt-1.5 min-w-[200px] overflow-hidden rounded-2xl border border-slate-200/90 bg-white py-1.5 shadow-xl shadow-slate-900/10 dark:border-slate-700 dark:bg-slate-950 dark:shadow-black/40"
            >
              {collapseActionsInMenu && (
                <>
                  {showChatsInCollapsedMenu ? (
                    <Link
                      href="/dashboard"
                      role="menuitem"
                      className={menuItemClass}
                      onClick={() => setMenuOpen(false)}
                    >
                      <MessageCircle className="h-4 w-4 shrink-0 opacity-80" />
                      <span className="min-w-0 flex-1">Chats</span>
                      {chatsUnreadCount > 0 ? (
                        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                          {chatsUnreadCount > 99 ? '99+' : chatsUnreadCount}
                        </span>
                      ) : null}
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    role="menuitem"
                    className={menuItemClass}
                    onClick={() => {
                      toggleThemeInMenu();
                    }}
                  >
                    <ThemeMenuIcon className="h-4 w-4 shrink-0 opacity-80" />
                    {themeMenuLabel}
                  </button>
                  {showHomeButton && (
                    <Link
                      href="/"
                      role="menuitem"
                      className={menuItemClass}
                      onClick={() => setMenuOpen(false)}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-amber-100 ring-1 ring-amber-300/60 dark:bg-amber-950/50 dark:ring-amber-600/40">
                        <AppLogo variant="mark" className="h-6 w-6" />
                      </span>
                      Home
                    </Link>
                  )}
                </>
              )}
              {menuLinks.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href + label}
                  href={href}
                  role="menuitem"
                  className={menuItemClass}
                  onClick={() => setMenuOpen(false)}
                >
                  {Icon && <Icon className="h-4 w-4 shrink-0 opacity-80" />}
                  {label}
                </Link>
              ))}
              {showLogout && (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-red-700 transition-colors duration-150 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
                  onClick={() => {
                    setMenuOpen(false);
                    logout();
                  }}
                >
                  <LogOut className="h-4 w-4 shrink-0" />
                  Log out
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
