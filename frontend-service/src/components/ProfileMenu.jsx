'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { createPortal } from 'react-dom';
import { Camera, KeyRound, Pencil, Trash2, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { clearUserProfilePhoto, setUserProfilePhoto } from '@/services/firebaseChat';

/**
 * Portals to document.body so modals are not clipped by app-shell overflow-hidden.
 */
function Modal({ title, titleId = 'profile-modal-title', children, onClose, className }) {
  const node = (
    <div
      className="fixed inset-0 z-[200] overflow-y-auto overflow-x-hidden bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      {/* Scrollable wrapper: full viewport; centers panel when short, scrolls when tall */}
      <div className="flex min-h-[100dvh] w-full items-center justify-center px-4 py-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
        <div
          className={cn(
            'card relative my-auto w-full max-w-md border-amber-200/90 p-5 shadow-2xl dark:border-navy-700/60 sm:p-6',
            'max-h-[min(90dvh,calc(100dvh-2rem))] overflow-y-auto overscroll-contain',
            'animate-in fade-in zoom-in-95 slide-in-from-bottom-6 duration-300',
            className
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <h2 id={titleId} className="text-lg font-bold text-amber-950 dark:text-slate-50">
              {title}
            </h2>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose} aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(node, document.body);
}

/**
 * Avatar → account menu. Edit profile / Change photo / Password → same slide-in Modal (portal).
 */

export function ProfileMenu() {
  const { user } = useAuth();
  const initial = (user?.username || '?').slice(0, 1).toUpperCase();
  const [menuOpen, setMenuOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const wrapRef = useRef(null);
  const anchorRef = useRef(null);
  const menuRef = useRef(null);
  const fileInputRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState({ top: 0, left: 0, maxHeight: 280 });

  const [avatarUrl, setAvatarUrl] = useState(null);
  const [displayName, setDisplayName] = useState(user?.username || '');
  const [pwdCurrent, setPwdCurrent] = useState('');
  const [pwdNew, setPwdNew] = useState('');
  const [pwdConfirm, setPwdConfirm] = useState('');
  const [pwdMsg, setPwdMsg] = useState('');
  const [editMsg, setEditMsg] = useState('');
  const [photoMsg, setPhotoMsg] = useState('');

  useEffect(() => {
    // FIX: Never use a shared/global localStorage avatar key (it causes photo mix-ups between users).
    // Source of truth is users/{uid}/photoURL via auth snapshot.
    setAvatarUrl(user?.photoURL || null);
  }, [user?.uid, user?.photoURL]);

  useEffect(() => {
    setDisplayName(user?.username || '');
  }, [user?.username]);

  useLayoutEffect(() => {
    if (!menuOpen) return;

    const positionMenu = () => {
      const anchor = anchorRef.current;
      const menu = menuRef.current;
      if (!anchor || !menu) return;

      const rect = anchor.getBoundingClientRect();
      const pad = 8;
      const gap = 8;
      const mw = menu.offsetWidth || 220;
      const mh = menu.offsetHeight;
      const vh = window.innerHeight;
      const vw = window.innerWidth;

      let left = rect.left + rect.width / 2 - mw / 2;
      left = Math.max(pad, Math.min(left, vw - mw - pad));

      let top = rect.bottom + gap;
      if (top + mh > vh - pad) {
        const aboveTop = rect.top - gap - mh;
        if (aboveTop >= pad) {
          top = aboveTop;
        } else {
          top = pad;
        }
      }

      const maxH = Math.max(100, vh - top - pad);
      setMenuStyle({ top, left, maxHeight: maxH });
    };

    positionMenu();
    const raf1 = requestAnimationFrame(() => {
      positionMenu();
    });

    const menuEl = menuRef.current;
    const ro = menuEl ? new ResizeObserver(() => positionMenu()) : null;
    if (menuEl && ro) ro.observe(menuEl);

    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, true);

    return () => {
      cancelAnimationFrame(raf1);
      ro?.disconnect();
      window.removeEventListener('resize', positionMenu);
      window.removeEventListener('scroll', positionMenu, true);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  const handleEditSave = (e) => {
    e.preventDefault();
    setEditMsg('Display name is stored locally for this session only. Connect a profile API to save permanently.');
    setTimeout(() => setEditMsg(''), 4000);
  };

  const handlePwdSubmit = (e) => {
    e.preventDefault();
    setPwdMsg('');
    if (pwdNew.length < 6) {
      setPwdMsg('New password must be at least 6 characters.');
      return;
    }
    if (pwdNew !== pwdConfirm) {
      setPwdMsg('New passwords do not match.');
      return;
    }
    setPwdMsg('Password change requires your auth service. This demo does not call a real API.');
    setPwdCurrent('');
    setPwdNew('');
    setPwdConfirm('');
  };

  const handleHiddenFileChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user?.uid) return;
    // FIX: Upload to cloud storage + persist photoURL per UID so all clients see the correct image.
    (async () => {
      try {
        const url = await setUserProfilePhoto({ userId: user.uid, file });
        setAvatarUrl(url);
        setPhotoOpen(false);
      } catch {
        // Minimal UX: silently ignore for now (existing UI has no toast system).
      }
    })();
  };

  const handleDeletePhoto = () => {
    if (!user?.uid) return;
    (async () => {
      try {
        await clearUserProfilePhoto({ userId: user.uid, photoURL: avatarUrl });
        setAvatarUrl(null);
        setPhotoMsg('');
        setPhotoOpen(false);
      } catch {
        setPhotoMsg('Could not delete photo right now. Please try again.');
      }
    })();
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={handleHiddenFileChange}
      />

      <div ref={wrapRef} className="relative flex shrink-0 flex-col items-center gap-1">
        <button
          ref={anchorRef}
          type="button"
          className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-lg font-bold text-white shadow-lg shadow-amber-600/30 outline-none ring-amber-400/50 transition hover:opacity-95 focus-visible:ring-2"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-label="Account menu"
          onClick={() => setMenuOpen((o) => !o)}
        >
          {avatarUrl ? (
            <Image src={avatarUrl} alt="" fill unoptimized className="h-full w-full object-cover" />
          ) : (
            initial
          )}
        </button>
        <p className="max-w-[9rem] truncate text-center text-sm font-semibold leading-tight text-amber-950 dark:text-slate-100">
          {user?.username || 'Guest'}
        </p>

        {menuOpen && (
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: 'fixed',
              top: menuStyle.top,
              left: menuStyle.left,
              zIndex: 70,
              maxHeight: menuStyle.maxHeight
            }}
            className="min-w-[220px] overflow-y-auto overscroll-contain rounded-2xl border border-amber-200/90 bg-white py-1.5 shadow-xl shadow-amber-900/10 dark:border-navy-700/60 dark:bg-navy-950 dark:shadow-black/40"
          >
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-amber-950 hover:bg-amber-100 dark:text-slate-50 dark:hover:bg-navy-800/60"
              onClick={() => {
                setMenuOpen(false);
                setEditOpen(true);
                setEditMsg('');
              }}
            >
              <Pencil className="h-4 w-4 shrink-0 opacity-80" />
              Edit profile
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-amber-950 hover:bg-amber-100 dark:text-slate-50 dark:hover:bg-navy-800/60"
              onClick={() => {
                setMenuOpen(false);
                setPhotoOpen(true);
                setPhotoMsg('');
              }}
            >
              <Camera className="h-4 w-4 shrink-0 opacity-80" />
              Change photo
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-amber-950 hover:bg-amber-100 dark:text-slate-50 dark:hover:bg-navy-800/60"
              onClick={() => {
                setMenuOpen(false);
                setPwdOpen(true);
                setPwdMsg('');
              }}
            >
              <KeyRound className="h-4 w-4 shrink-0 opacity-80" />
              Change password
            </button>
          </div>
        )}
      </div>

      {photoOpen && (
        <Modal title="Profile photo" titleId="photo-modal-title" onClose={() => setPhotoOpen(false)}>
          <div className="space-y-5">
            <div className="flex flex-col items-center">
              <div className="relative flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-amber-200/90 bg-gradient-to-br from-amber-400 to-amber-600 text-4xl font-bold text-white shadow-inner dark:border-navy-600/50">
                {avatarUrl ? (
                  <Image src={avatarUrl} alt="" fill unoptimized className="h-full w-full object-cover" />
                ) : (
                  <span aria-hidden>{initial}</span>
                )}
              </div>
              <p className="mt-3 text-center text-sm font-medium text-amber-700 dark:text-sky-400">
                {avatarUrl ? 'Current photo' : 'No photo yet'}
              </p>
            </div>

            <div className="flex flex-col gap-2 border-t border-amber-200/80 pt-4 dark:border-navy-700/50">
              <Button
                type="button"
                variant="secondary"
                className="w-full justify-start gap-2 font-medium"
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera className="h-4 w-4 shrink-0 opacity-80" />
                Change the photo
              </Button>
              {avatarUrl && (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full justify-start gap-2 font-medium text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40"
                  onClick={handleDeletePhoto}
                >
                  <Trash2 className="h-4 w-4 shrink-0 opacity-80" />
                  Delete the photo
                </Button>
              )}
              {photoMsg && (
                <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-800 dark:text-red-200">
                  {photoMsg}
                </p>
              )}
            </div>
          </div>
        </Modal>
      )}

      {editOpen && (
        <Modal title="Edit profile" titleId="edit-profile-modal-title" onClose={() => setEditOpen(false)}>
          <form onSubmit={handleEditSave} className="space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-sky-400">
                Username
              </label>
              <input
                className="input mt-1"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Display name"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-sky-400">
                Email
              </label>
              <input className="input mt-1 opacity-80" value={user?.email || '—'} readOnly disabled />
            </div>
            {editMsg && (
              <p className="rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-navy-600/50 dark:bg-navy-900/40 dark:text-slate-100">
                {editMsg}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </div>
          </form>
        </Modal>
      )}

      {pwdOpen && (
        <Modal title="Change password" titleId="pwd-modal-title" onClose={() => setPwdOpen(false)}>
          <form onSubmit={handlePwdSubmit} className="space-y-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-sky-400">
                Current password
              </label>
              <input
                className="input mt-1"
                type="password"
                autoComplete="current-password"
                value={pwdCurrent}
                onChange={(e) => setPwdCurrent(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-sky-400">
                New password
              </label>
              <input
                className="input mt-1"
                type="password"
                autoComplete="new-password"
                value={pwdNew}
                onChange={(e) => setPwdNew(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-sky-400">
                Confirm new password
              </label>
              <input
                className="input mt-1"
                type="password"
                autoComplete="new-password"
                value={pwdConfirm}
                onChange={(e) => setPwdConfirm(e.target.value)}
              />
            </div>
            {pwdMsg && (
              <p
                className={cn(
                  'rounded-xl px-3 py-2 text-xs',
                  pwdMsg.includes('requires')
                    ? 'border border-amber-300/60 bg-amber-50 text-amber-900 dark:border-navy-600/50 dark:bg-navy-900/40 dark:text-slate-100'
                    : 'border border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-200'
                )}
              >
                {pwdMsg}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setPwdOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Update password</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
