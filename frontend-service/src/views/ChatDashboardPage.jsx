'use client';
/* eslint-disable @next/next/no-img-element */

import { memo, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { formatPeerPresence } from '@/lib/formatPresence';
import { cn } from '@/lib/utils';
import { useAuth } from '../hooks/useAuth';
import {
  deleteDirectMessage,
  editDirectMessage,
  hideDirectMessageForMe,
  listDirectMessages,
  deleteRecentDirectChat,
  exportDirectChatHistory,
  importDirectChatHistory,
  markDirectThreadRead,
  markRecentDirectChatRead,
  searchUsersByUsername,
  sendDirectMedia,
  sendDirectMessage,
  setRecentDirectChatArchived,
  setRecentDirectChatLocked,
  subscribeDirectMessages,
  subscribeRecentDirectChats,
  subscribeUserPresence,
  toggleDmReaction,
  setDmTyping,
  subscribeDmTyping,
  pinDmMessage,
  unpinDmMessage,
  subscribePinnedDmMessages
} from '../services/chatClient';
import { motion } from 'framer-motion';
import {
  Loader2,
  Lock,
  Archive,
  Download,
  Mail,
  MessageCircle,
  Mic,
  MicOff,
  Phone,
  Plus,
  Upload,
  Pin,
  PinOff,
  MoreVertical,
  Pencil,
  Paperclip,
  Search,
  Send,
  SmilePlus,
  Trash2,
  Users,
  Video,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProfileMenu } from '@/components/ProfileMenu';
import { AppHeaderMenu } from '@/components/AppHeaderMenu';

function sameCalendarDay(aMs, bMs) {
  const da = new Date(aMs);
  const db = new Date(bMs);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

function formatDaySeparator(ts) {
  if (!ts) return '';
  const d = new Date(Number(ts));
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const isToday = sameCalendarDay(d.getTime(), now.getTime());
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const isYesterday = sameCalendarDay(d.getTime(), y.getTime());
  const timeStr = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (isToday) return `Today ${timeStr}`;
  if (isYesterday) return `Yesterday ${timeStr}`;
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}

function formatListTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

const ChatMessageRow = memo(function ChatMessageRow({
  m,
  idx,
  mine,
  senderLabel,
  canEditDelete,
  isPinned,
  peerKey,
  userId,
  openMessageMenuId,
  deletingMessageId,
  toggleMessageMenu,
  handleEditMessage,
  handleDeleteMessage,
  handleDeleteForMe,
  handlePinDmMessage,
  handleUnpinDmMessage,
  openReactionPickerId,
  setOpenReactionPickerId,
  EMOJI_OPTIONS,
  handleToggleDmReaction,
}) {
  const reactionEntries = Object.entries(m.reactions || {});
  return (
    <div className={cn('group flex w-full flex-col', mine ? 'items-end' : 'items-start')}>
      <div className="relative flex items-end">
        <div
          className={cn(
            'relative max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm sm:max-w-[70%]',
            mine
              ? 'rounded-br-lg bg-violet-600 text-white shadow-sm shadow-violet-600/20 dark:bg-violet-600 dark:text-white'
              : 'rounded-bl-lg border border-slate-200/90 bg-slate-100 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <div
              className={cn(
                'truncate text-[11px] font-semibold tracking-wide',
                mine ? 'text-violet-100' : 'text-slate-500 dark:text-slate-400'
              )}
            >
              {senderLabel}
              {isPinned && <Pin className="ml-1 inline h-2.5 w-2.5 opacity-70" />}
              {mine && (
                <div
                  className={cn(
                    'mt-0.5 text-[10px] font-semibold tracking-wide',
                    m.readBy?.[peerKey]
                      ? 'text-violet-100'
                      : m.deliveredBy?.[peerKey]
                        ? 'text-violet-200/90'
                        : 'text-violet-200/80'
                  )}
                >
                  {m.readBy?.[peerKey] ? 'Read' : m.deliveredBy?.[peerKey] ? 'Delivered' : 'Sent'}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className={cn(
                  'rounded-md p-1.5 transition',
                  mine
                    ? 'text-violet-100 hover:bg-white/15'
                    : 'text-slate-500 hover:bg-slate-200/80 dark:text-slate-400 dark:hover:bg-slate-700/80'
                )}
                onClick={() => setOpenReactionPickerId((prev) => (prev === m._id ? null : m._id))}
                aria-label="React to message"
                title="React"
              >
                <SmilePlus className="h-4 w-4" />
              </button>

              <div className="relative -mr-1" data-message-menu>
              <button
                type="button"
                className={cn(
                  'rounded-md p-1.5 transition',
                  mine
                    ? 'text-violet-100 hover:bg-white/15'
                    : 'text-slate-500 hover:bg-slate-200/80 dark:text-slate-400 dark:hover:bg-slate-700/80'
                )}
                onClick={() => toggleMessageMenu(m._id)}
                aria-label="Message actions"
              >
                <MoreVertical className="h-4 w-4" />
              </button>

              {openMessageMenuId === m._id && (
                <div
                  role="menu"
                  className="anim-pop absolute right-0 top-full z-50 mt-1.5 min-w-[170px] overflow-hidden rounded-2xl border border-slate-200/90 bg-white py-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-slate-800 transition-colors duration-150 hover:bg-violet-50 dark:text-slate-100 dark:hover:bg-slate-800"
                    onClick={() => {
                      toggleMessageMenu(m._id);
                      setOpenReactionPickerId((prev) => (prev === m._id ? null : m._id));
                    }}
                  >
                    <SmilePlus className="h-4 w-4 shrink-0 opacity-80" />
                    React
                  </button>
                  {mine && (
                    <>
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-slate-800 transition-colors duration-150 hover:bg-violet-50 disabled:pointer-events-none disabled:opacity-60 dark:text-slate-100 dark:hover:bg-slate-800"
                        onClick={() => handleEditMessage(m)}
                        disabled={!canEditDelete}
                      >
                        <Pencil className="h-4 w-4 shrink-0 opacity-80" />
                        Edit message
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-red-600 transition-colors duration-150 hover:bg-red-50 disabled:pointer-events-none disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-950/40"
                        onClick={() => {
                          if (!canEditDelete) return;
                          toggleMessageMenu(m._id);
                          handleDeleteMessage(m._id);
                        }}
                        disabled={!canEditDelete || deletingMessageId === m._id}
                      >
                        <Trash2 className="h-4 w-4 shrink-0" />
                        {deletingMessageId === m._id ? 'Unsending…' : 'Unsend message'}
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-slate-800 transition-colors duration-150 hover:bg-violet-50 dark:text-slate-100 dark:hover:bg-slate-800"
                    onClick={
                      isPinned
                        ? () => {
                            handleUnpinDmMessage(m._id);
                            toggleMessageMenu(m._id);
                          }
                        : () => {
                            handlePinDmMessage(m);
                            toggleMessageMenu(m._id);
                          }
                    }
                  >
                    {isPinned ? <PinOff className="h-4 w-4 shrink-0 opacity-80" /> : <Pin className="h-4 w-4 shrink-0 opacity-80" />}
                    {isPinned ? 'Unpin message' : 'Pin message'}
                  </button>
                  {mine && (
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-slate-800 transition-colors duration-150 hover:bg-violet-50 dark:text-slate-100 dark:hover:bg-slate-800"
                      onClick={() => handleDeleteForMe(m._id)}
                    >
                      <Trash2 className="h-4 w-4 shrink-0 opacity-80" />
                      Delete for me
                    </button>
                  )}
                </div>
              )}
              </div>
            </div>
          </div>
          {m.mediaType === 'image' && m.mediaUrl ? (
            <a href={m.mediaUrl} target="_blank" rel="noreferrer" className="mt-2 block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.mediaUrl} alt={m.fileName || 'Shared image'} className="max-h-72 w-auto rounded-xl object-cover" />
            </a>
          ) : null}
          {m.mediaType === 'video' && m.mediaUrl ? (
            <video src={m.mediaUrl} controls className="mt-2 max-h-72 w-full rounded-xl bg-black" />
          ) : null}
          {m.mediaType === 'audio' && m.mediaUrl ? <audio src={m.mediaUrl} controls className="mt-2 w-full" /> : null}
          {m.mediaType === 'file' && m.mediaUrl ? (
            <a
              href={m.mediaUrl}
              target="_blank"
              rel="noreferrer"
              className={cn(
                'mt-2 block rounded-xl border px-3 py-2 text-sm no-underline transition hover:brightness-[1.02]',
                mine
                  ? 'border-white/25 bg-white/10 text-white hover:bg-white/15'
                  : 'border-slate-200/90 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800'
              )}
            >
              <div className="truncate font-semibold">{m.fileName || 'Download file'}</div>
              <div className={cn('mt-0.5 text-xs opacity-80', mine ? 'text-violet-100' : 'text-slate-500')}>Open / download</div>
            </a>
          ) : null}
          {(m.content || m.isDeleted) ? (
            <p
              className={cn(
                'mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed',
                m.isDeleted ? 'italic opacity-80' : mine ? 'text-white' : 'text-slate-800 dark:text-slate-100'
              )}
            >
              {m.content}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          data-reaction-picker
          className={cn(
            'absolute bottom-1 flex h-7 w-7 items-center justify-center rounded-full border border-slate-200/90 bg-white text-base shadow-sm transition',
            'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100',
            'dark:border-slate-600 dark:bg-slate-900',
            mine ? 'left-[-36px]' : 'right-[-36px]'
          )}
          onClick={() => setOpenReactionPickerId((prev) => (prev === m._id ? null : m._id))}
          title="React"
        >
          <SmilePlus className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
        </button>
      </div>

      {openReactionPickerId === m._id && (
        <div
          data-reaction-picker
          className={cn(
            'mt-1 flex gap-1 rounded-full border border-slate-200/90 bg-white px-2 py-1 shadow-md dark:border-slate-700 dark:bg-slate-900',
            mine ? 'mr-8' : 'ml-8'
          )}
        >
          {EMOJI_OPTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="rounded-full px-1 py-0.5 text-base transition hover:scale-125"
              onClick={() => handleToggleDmReaction(m._id, emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {reactionEntries.length > 0 && (
        <div className={cn('mt-1 flex flex-wrap gap-1', mine ? 'mr-8 justify-end' : 'ml-8')}>
          {reactionEntries.map(([emoji, users]) => {
            const count = Object.keys(users || {}).length;
            if (!count) return null;
            const reacted = !!(users || {})[userId];
            return (
              <button
                key={emoji}
                type="button"
                className={cn(
                  'flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition',
                  reacted
                    ? 'border-violet-400 bg-violet-50 dark:border-violet-500 dark:bg-violet-950/50'
                    : 'border-slate-200/90 bg-white dark:border-slate-700 dark:bg-slate-900'
                )}
                onClick={() => handleToggleDmReaction(m._id, emoji)}
              >
                <span>{emoji}</span>
                <span className={reacted ? 'text-violet-700 dark:text-violet-300' : 'text-slate-600 dark:text-slate-400'}>{count}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});

export default function ChatDashboardPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messageLoadError, setMessageLoadError] = useState('');
  const [deletingMessageId, setDeletingMessageId] = useState('');
  const [input, setInput] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [actionError, setActionError] = useState('');
  const [chatTransferBusy, setChatTransferBusy] = useState(false);
  const importChatFileRef = useRef(null);
  const [activeUserId, setActiveUserId] = useState('');
  const [peerUsername, setPeerUsername] = useState('');
  const [recentChats, setRecentChats] = useState([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [recentLoadError, setRecentLoadError] = useState('');
  const [recentRefreshTick, setRecentRefreshTick] = useState(0);
  const [historyRefreshTick, setHistoryRefreshTick] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [peerPresence, setPeerPresence] = useState(null);
  const [peerPresenceLoading, setPeerPresenceLoading] = useState(false);
  const [peerAvatarFailed, setPeerAvatarFailed] = useState(false);
  const [openMessageMenuId, setOpenMessageMenuId] = useState(null);
  const [recentMenu, setRecentMenu] = useState(null);
  const EDIT_WINDOW_MS = 15 * 60 * 1000;
  const EMOJI_OPTIONS = ['👍', '❤️', '😂', '😮', '😢', '👏'];
  const [msgSearchOpen, setMsgSearchOpen] = useState(false);
  const [msgSearch, setMsgSearch] = useState('');
  const [typingUsers, setTypingUsers] = useState([]);
  const [pinnedMessages, setPinnedMessages] = useState([]);
  const [openReactionPickerId, setOpenReactionPickerId] = useState(null);
  const [chatHeaderMenuOpen, setChatHeaderMenuOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const typingTimeoutRef = useRef(null);
  const searchWrapRef = useRef(null);
  const searchInputRef = useRef(null);
  const mediaInputRef = useRef(null);
  const messagesWrapRef = useRef(null);
  const shouldAutoScrollRef = useRef(true);

  const peerKey = useMemo(() => activeUserId.trim(), [activeUserId]);
  const peerShort = useMemo(() => {
    if (!peerKey) return '—';
    return peerKey.length > 12 ? `${peerKey.slice(0, 6)}…${peerKey.slice(-4)}` : peerKey;
  }, [peerKey]);
  const peerLabel = useMemo(() => (peerKey ? peerUsername || peerShort : 'Peer'), [peerKey, peerUsername, peerShort]);
  const msgSearchLower = useMemo(() => msgSearch.trim().toLowerCase(), [msgSearch]);
  const deferredMsgSearchLower = useDeferredValue(msgSearchLower);
  const filteredMessages = useMemo(() => {
    if (!deferredMsgSearchLower) return messages;
    return messages.filter((m) => (m.content || '').toLowerCase().includes(deferredMsgSearchLower));
  }, [messages, deferredMsgSearchLower]);
  const pinnedSet = useMemo(() => new Set(pinnedMessages.map((p) => p.messageId)), [pinnedMessages]);

  const messageVirtualizer = useVirtualizer({
    count: filteredMessages.length,
    getScrollElement: () => messagesWrapRef.current,
    estimateSize: () => 88,
    overscan: 12,
    getItemKey: (index) => filteredMessages[index]?._id ?? `dm-row-${index}`,
  });

  const dmUnreadTotal = useMemo(
    () => recentChats.reduce((s, c) => s + Number(c.unreadCount || 0), 0),
    [recentChats]
  );

  const toggleMessageMenu = useCallback((messageId) => {
    setOpenMessageMenuId((prev) => (prev === messageId ? null : messageId));
  }, []);

  // Message row is memoized outside component for stability.

  // FIX: auto-scroll only if user is near bottom (don’t interrupt when scrolling up).
  useEffect(() => {
    const el = messagesWrapRef.current;
    if (!el) return;
    const onScroll = () => {
      const thresholdPx = 140;
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      shouldAutoScrollRef.current = distanceFromBottom < thresholdPx;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const onDoc = (e) => {
      const target = e.target;
      if (target?.closest?.('[data-message-menu]')) return;
      setOpenMessageMenuId(null);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    const onDoc = (e) => {
      if (!e.target?.closest?.('[data-reaction-picker]')) setOpenReactionPickerId(null);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    const onDoc = (e) => {
      const target = e.target;
      if (target?.closest?.('[data-recent-menu]')) return;
      setRecentMenu(null);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    const t = setTimeout(() => searchInputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [searchOpen]);

  useEffect(() => {
    const onDoc = (e) => {
      if (e.target?.closest?.('[data-sidebar-search]')) return;
      setSearchOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    let cancelled = false;
    setSearchLoading(true);
    const t = setTimeout(async () => {
      try {
        const users = await searchUsersByUsername(q, user.id);
        if (!cancelled) setSearchResults(users);
      } catch {
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [user?.id, searchQuery]);

  useEffect(() => {
    const onDoc = (e) => {
      if (e.target?.closest?.('[data-chat-header-menu]')) return;
      setChatHeaderMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pickPeer = (id, username) => {
    setActiveUserId(String(id || '').trim());
    setPeerUsername(username);
    setActionError('');
    setSearchOpen(false);
    setSearchQuery('');
  };

  const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());

  const clearPeer = () => {
    if (user?.id && activeUserId.trim()) {
      setDmTyping({ userId: user.id, peerId: activeUserId.trim(), username: user.username || 'User', isTyping: false }).catch(() => undefined);
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    setActiveUserId('');
    setPeerUsername('');
    setPeerPresence(null);
    setPeerAvatarFailed(false);
    setMsgSearch('');
    setMsgSearchOpen(false);
    setOpenReactionPickerId(null);
  };

  useEffect(() => {
    setPeerAvatarFailed(false);
  }, [activeUserId]);

  useEffect(() => {
    if (!activeUserId.trim()) {
      setPeerPresence(null);
      return;
    }
    setPeerPresenceLoading(true);
    const unsubscribe = subscribeUserPresence(activeUserId.trim(), (presence) => {
      setPeerPresence(presence);
      setPeerPresenceLoading(false);
    });
    return () => {
      unsubscribe();
      setPeerPresenceLoading(false);
    };
  }, [activeUserId]);

  // Typing indicator subscription
  useEffect(() => {
    if (!user?.id || !activeUserId.trim()) {
      setTypingUsers([]);
      return;
    }
    const peerTypingLabel = peerUsername || 'Someone';
    const unsub = subscribeDmTyping(user.id, activeUserId.trim(), ({ senderId, isTyping }) => {
      if (!senderId || senderId === user.id) return;
      setTypingUsers((prev) => {
        if (!isTyping) return prev.filter((name) => name !== peerTypingLabel);
        if (prev.includes(peerTypingLabel)) return prev;
        return [...prev, peerTypingLabel];
      });
    });
    return unsub;
  }, [user?.id, activeUserId, peerUsername]);

  // Pinned messages subscription
  useEffect(() => {
    if (!user?.id || !activeUserId.trim()) {
      setPinnedMessages([]);
      return;
    }
    const unsub = subscribePinnedDmMessages(user.id, activeUserId.trim(), setPinnedMessages);
    return unsub;
  }, [user?.id, activeUserId]);

  // Tab title: show total unread count
  useEffect(() => {
    const total = recentChats.reduce((sum, c) => sum + Number(c.unreadCount || 0), 0);
    document.title = total > 0 ? `(${total > 99 ? '99+' : total}) D-Lite` : 'D-Lite';
    return () => { document.title = 'D-Lite'; };
  }, [recentChats]);

  useEffect(() => {
    setRecentLoading(true);
    setRecentLoadError('');
    let unsubscribe = () => undefined;

    try {
      unsubscribe = subscribeRecentDirectChats(user?.id, (items) => {
        setRecentChats(items);
        setRecentLoadError('');
        setRecentLoading(false);
      });
    } catch {
      setRecentLoadError('Could not load recent chats.');
      setRecentLoading(false);
    }

    return () => {
      unsubscribe();
    };
  }, [user?.id, recentRefreshTick]);

  useEffect(() => {
    if (!user?.id || !activeUserId.trim()) {
      setMessages([]);
      setMessagesLoading(false);
      setMessageLoadError('');
      return;
    }

    const peerId = activeUserId.trim();
    // FIX: Mark messages as read when opening a chat (DB read receipts).
    markDirectThreadRead({ userId: user.id, peerId }).catch(() => undefined);
    markRecentDirectChatRead(user.id, peerId)
      .then(() => {
        // Keep UI consistent: unread badge should disappear immediately.
        setRecentChats((prev) => prev.map((chat) => (chat.peerId === peerId ? { ...chat, unreadCount: 0 } : chat)));
      })
      .catch(() => undefined);
    setMessagesLoading(true);
    setMessageLoadError('');

    let cancelled = false;
    const seen = new Set();
    let unsubscribe = () => undefined;

    (async () => {
      try {
        const history = await listDirectMessages(user.id, activeUserId.trim());
        if (cancelled) return;
        history.forEach((msg) => seen.add(msg._id));
        setMessages(history);
        setMessagesLoading(false);
        unsubscribe = subscribeDirectMessages(user.id, activeUserId.trim(), (msg, changeType) => {
          if (changeType === 'changed') {
            setMessages((prev) => prev.map((item) => (item._id === msg._id ? { ...item, ...msg } : item)));
            return;
          }
          if (changeType === 'removed') {
            seen.delete(msg._id);
            setMessages((prev) => prev.filter((item) => item._id !== msg._id));
            return;
          }

          if (seen.has(msg._id)) return;
          seen.add(msg._id);
          setMessages((prev) => [...prev, msg]);
          if (msg.senderId && msg.senderId !== user.id) {
            // FIX: If chat is open, mark as read immediately on receive.
            markDirectThreadRead({ userId: user.id, peerId }).catch(() => undefined);
            markRecentDirectChatRead(user.id, activeUserId.trim())
              .then(() => {
                setRecentChats((prev) =>
                  prev.map((chat) => (chat.peerId === activeUserId.trim() ? { ...chat, unreadCount: 0 } : chat))
                );
              })
              .catch(() => undefined);
          }
        });
      } catch {
        if (!cancelled) {
          setMessageLoadError('Could not load messages.');
          setMessagesLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [user?.id, activeUserId, historyRefreshTick]);

  useLayoutEffect(() => {
    if (!shouldAutoScrollRef.current) return;
    const el = messagesWrapRef.current;
    if (!el) return;
    // FIX: Scroll to latest message on send/receive when user is near bottom.
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!user?.id || !activeUserId || !input.trim()) return;
    if (!isUuid(activeUserId.trim())) {
      setActionError('Select a user from search (peerId must be a UUID).');
      return;
    }
    setSendingMessage(true);
    setActionError('');
    try {
      await sendDirectMessage({
        senderId: user.id,
        receiverId: activeUserId.trim(),
        content: input.trim()
      });
      setInput('');
    } catch {
      setActionError('Could not send message. Please try again.');
    } finally {
      setSendingMessage(false);
    }
  };

  const sendQuickMessage = async (content) => {
    if (!user?.id || !activeUserId?.trim()) return;
    const text = String(content || '').trim();
    if (!text) return;
    if (!isUuid(activeUserId.trim())) {
      setActionError('Select a user from search (peerId must be a UUID).');
      return;
    }
    setSendingMessage(true);
    setActionError('');
    try {
      await sendDirectMessage({
        senderId: user.id,
        receiverId: activeUserId.trim(),
        content: text
      });
      setInput('');
    } catch {
      setActionError('Could not send message. Please try again.');
    } finally {
      setSendingMessage(false);
    }
  };

  const handleSelectMedia = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !user?.id || !activeUserId.trim()) return;
    if (!isUuid(activeUserId.trim())) {
      setActionError('Select a user from search (peerId must be a UUID).');
      return;
    }

    setSendingMessage(true);
    setActionError('');
    try {
      await sendDirectMedia({
        senderId: user.id,
        receiverId: activeUserId.trim(),
        file
      });
    } catch (err) {
      setActionError(err?.message || 'Could not send media. Please try again.');
    } finally {
      setSendingMessage(false);
    }
  };

  const handleEditMessage = async (message) => {
    if (!user?.id || !activeUserId?.trim() || !message?._id) return;
    if (message.isDeleted) {
      setActionError('Deleted messages cannot be edited.');
      return;
    }
    const createdAt = Number(message.createdAt || 0);
    const canAccess = createdAt && Date.now() - createdAt <= EDIT_WINDOW_MS;
    if (!canAccess) {
      setActionError('Edit window expired (15 minutes).');
      return;
    }

    const next = window.prompt('Edit message', message.content || '');
    if (next === null) return; // cancelled
    const newContent = next.trim();
    if (!newContent) return;

    setActionError('');
    try {
      await editDirectMessage({
        userId: user.id,
        peerId: activeUserId.trim(),
        messageId: message._id,
        newContent
      });
      setMessages((prev) => prev.map((m) => (m._id === message._id ? { ...m, content: newContent } : m)));
      setOpenMessageMenuId(null);
    } catch (err) {
      setActionError(err?.message || 'Could not edit message. Please try again.');
    }
  };

  const handleDeleteMessage = async (messageId) => {
    if (!messageId || !user?.id || !activeUserId.trim()) return;
    if (
      typeof window !== 'undefined' &&
      !window.confirm('Delete this message? It will also be deleted for the other user.')
    )
      return;
    setDeletingMessageId(messageId);
    setActionError('');
    try {
      await deleteDirectMessage({
        userId: user.id,
        peerId: activeUserId.trim(),
        messageId
      });
      setMessages((prev) => prev.filter((item) => item._id !== messageId));
      setOpenMessageMenuId(null);
    } catch {
      setActionError('Could not delete message. Please try again.');
    } finally {
      setDeletingMessageId('');
    }
  };

  const handleDeleteForMe = async (messageId) => {
    if (!messageId || !user?.id || !activeUserId.trim()) return;
    if (typeof window !== 'undefined' && !window.confirm('Delete this message only for you?')) return;
    setActionError('');
    try {
      await hideDirectMessageForMe({
        userId: user.id,
        peerId: activeUserId.trim(),
        messageId
      });
      setMessages((prev) => prev.filter((item) => item._id !== messageId));
      setOpenMessageMenuId(null);
    } catch {
      setActionError('Could not delete message for you. Please try again.');
    }
  };

  const handleToggleDmReaction = async (messageId, emoji) => {
    if (!user?.id || !activeUserId.trim() || !messageId) return;
    setOpenReactionPickerId(null);
    try {
      const result = await toggleDmReaction({ userId: user.id, peerId: activeUserId.trim(), messageId, emoji });
      const on = result?.active === true;
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg._id !== messageId) return msg;
          const nextReactions = { ...(msg.reactions || {}) };
          const bucket = { ...(nextReactions[emoji] || {}) };
          if (on) {
            bucket[user.id] = true;
          } else {
            delete bucket[user.id];
          }
          if (Object.keys(bucket).length === 0) {
            delete nextReactions[emoji];
          } else {
            nextReactions[emoji] = bucket;
          }
          return { ...msg, reactions: nextReactions };
        })
      );
    } catch {
      setActionError('Could not update reaction.');
    }
  };

  const handlePinDmMessage = async (message) => {
    if (!user?.id || !activeUserId.trim()) return;
    setOpenMessageMenuId(null);
    try {
      await pinDmMessage({ userId: user.id, peerId: activeUserId.trim(), messageId: message._id, content: message.content || '' });
    } catch { setActionError('Could not pin message.'); }
  };

  const handleUnpinDmMessage = async (messageId) => {
    if (!user?.id || !activeUserId.trim()) return;
    try {
      await unpinDmMessage({ userId: user.id, peerId: activeUserId.trim(), messageId });
    } catch { setActionError('Could not unpin message.'); }
  };

  const handleTypingInput = (e) => {
    setInput(e.target.value);
    if (!user?.id || !activeUserId.trim()) return;
    setDmTyping({ userId: user.id, peerId: activeUserId.trim(), username: user.username || 'User', isTyping: true }).catch(() => undefined);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setDmTyping({ userId: user.id, peerId: activeUserId.trim(), username: user.username || 'User', isTyping: false }).catch(() => undefined);
    }, 3000);
  };

  const handleStartRecording = async () => {
    if (!activeUserId.trim()) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedChunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
        if (blob.size < 500) return;
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
        setSendingMessage(true);
        setActionError('');
        try {
          await sendDirectMedia({ senderId: user.id, receiverId: activeUserId.trim(), file });
        } catch { setActionError('Could not send voice note.'); }
        finally { setSendingMessage(false); }
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true);
    } catch { setActionError('Microphone access denied.'); }
  };

  const handleStopRecording = () => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setIsRecording(false);
  };

  const peerInitial = peerUsername
    ? peerUsername.slice(0, 1).toUpperCase()
    : activeUserId.trim()
      ? peerShort.slice(0, 1).toUpperCase()
      : '?';

  const peerAvatarSeed = encodeURIComponent(peerUsername || activeUserId.trim() || 'user');

  const handleExportChatHistory = async () => {
    if (!user?.id || !activeUserId.trim()) return;
    setActionError('');
    setChatTransferBusy(true);
    try {
      const payload = await exportDirectChatHistory({
        userId: user.id,
        peerId: activeUserId.trim(),
        limit: 100
      });

      const content = JSON.stringify(payload, null, 2);
      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const date = new Date().toISOString().slice(0, 10);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dm-${payload.threadId}-export-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setActionError(err?.message || 'Chat export failed.');
    } finally {
      setChatTransferBusy(false);
    }
  };

  const handleImportChatFile = async (file) => {
    if (!user?.id || !activeUserId.trim()) return;
    if (!file) return;

    setActionError('');
    setChatTransferBusy(true);
    try {
      const text = await file.text();
      const payload = JSON.parse(text);

      if (!payload || payload.type !== 'direct') {
        setActionError('Invalid file format. Expected a direct chat export JSON.');
        return;
      }

      await importDirectChatHistory({
        userId: user.id,
        peerId: activeUserId.trim(),
        payload
      });

      setHistoryRefreshTick((v) => v + 1);
    } catch (err) {
      setActionError(err?.message || 'Chat import failed.');
    } finally {
      setChatTransferBusy(false);
      if (importChatFileRef.current) importChatFileRef.current.value = '';
    }
  };

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#F3F4F6] dark:bg-slate-950">
      <motion.main
        className="flex min-h-0 flex-1 flex-col overflow-hidden p-2 sm:p-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.2, 0.9, 0.2, 1] }}
      >
        <div
          className={cn(
            'mx-auto grid min-h-0 w-full max-w-[1660px] flex-1 overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-[0_25px_80px_-24px_rgba(15,23,42,0.18)]',
            'dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/40',
            'grid-cols-1 lg:grid-cols-[minmax(300px,360px)_1fr] xl:grid-cols-[minmax(300px,360px)_1fr_minmax(272px,300px)]'
          )}
        >
          <aside className="flex max-h-[42vh] min-h-0 flex-col border-b border-slate-200/80 bg-[#F9FAFB] dark:border-slate-800 dark:bg-slate-900/80 lg:max-h-none lg:border-b-0 lg:border-r">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200/80 px-3 py-2.5 dark:border-slate-800">
              <div className="flex items-center gap-0.5 sm:gap-1">
                <Link
                  href="/dashboard"
                  className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm shadow-violet-600/25"
                  title="Chats"
                  aria-current="page"
                >
                  <MessageCircle className="h-5 w-5" />
                  {dmUnreadTotal > 0 ? (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                      {dmUnreadTotal > 9 ? '9+' : dmUnreadTotal}
                    </span>
                  ) : null}
                </Link>
                <Link
                  href="/call"
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition hover:bg-white hover:text-violet-600 dark:text-slate-400 dark:hover:bg-slate-800"
                  title="Calls"
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
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition hover:bg-white hover:text-violet-600 dark:text-slate-400 dark:hover:bg-slate-800"
                  title="Groups"
                >
                  <Users className="h-5 w-5" />
                </Link>
              </div>
              <div className="flex items-center gap-0.5">
                <AppHeaderMenu menuLinks={[]} />
                <ProfileMenu />
              </div>
            </div>

            <div
              ref={searchWrapRef}
              data-sidebar-search
              className="relative shrink-0 border-b border-slate-200/80 px-3 pb-3 pt-2 dark:border-slate-800"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-lg font-bold tracking-tight text-slate-800 dark:text-slate-100">Chats</h2>
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-600 text-white shadow-md shadow-violet-600/30 transition hover:bg-violet-700"
                  aria-label="New chat — search people"
                  onClick={() => {
                    setSearchOpen(true);
                    setTimeout(() => searchInputRef.current?.focus(), 50);
                  }}
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>

              <div className="mb-3 flex gap-4 border-b border-slate-200/80 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:text-slate-500">
                <span className="relative text-violet-600 dark:text-violet-400">
                  Direct
                  <span className="absolute -right-2.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-red-500" />
                </span>
                <button
                  type="button"
                  className="transition hover:text-violet-600 dark:hover:text-violet-400"
                  onClick={() => router.push('/groups')}
                >
                  Groups
                </button>
                <span className="cursor-not-allowed opacity-40" title="Coming soon">
                  Public
                </span>
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  ref={searchInputRef}
                  className="w-full rounded-2xl border border-slate-200/90 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-800 outline-none ring-violet-500/30 placeholder:text-slate-400 focus:border-violet-500 focus:ring-4 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  placeholder="Search"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setSearchOpen(true);
                  }}
                  onFocus={() => setSearchOpen(true)}
                />
                {searchOpen && (searchQuery.trim().length > 0 || searchLoading) ? (
                  <div className="anim-pop absolute left-0 right-0 top-full z-[60] mt-2 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-950">
                    <div className="max-h-52 overflow-y-auto p-1">
                      {searchLoading ? (
                        <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Searching…
                        </div>
                      ) : searchResults.length === 0 ? (
                        <p className="px-3 py-4 text-center text-xs text-slate-500">No users found.</p>
                      ) : (
                        searchResults.map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-800 hover:bg-violet-50 dark:text-slate-100 dark:hover:bg-slate-800"
                            onClick={() => pickPeer(u.id, u.username)}
                          >
                            <Image
                              src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(u.username || u.id)}`}
                              alt=""
                              width={36}
                              height={36}
                              unoptimized
                              className="h-9 w-9 rounded-full border border-slate-200/80 object-cover dark:border-slate-700"
                            />
                            <span className="min-w-0 flex-1 truncate">{u.username}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3 pt-1 sm:px-3">
              {recentLoadError && (
                <div className="rounded-xl border border-red-400/40 bg-red-500/10 px-2.5 py-2 text-xs text-red-700 dark:text-red-300">
                  <p>{recentLoadError}</p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="mt-2 h-7 px-2 text-[11px]"
                    onClick={() => setRecentRefreshTick((value) => value + 1)}
                  >
                    Retry
                  </Button>
                </div>
              )}

              {recentLoading ? (
                <div className="flex items-center gap-2 px-2 py-3 text-xs text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading…
                </div>
              ) : recentChats.length === 0 ? (
                <p className="px-2 py-4 text-center text-xs text-slate-500">No recent chats yet. Search above to start.</p>
              ) : (
                recentChats.map((chat) => {
                  const selected = activeUserId.trim() === chat.peerId;
                  const unread = Number(chat.unreadCount || 0);
                  return (
                    <button
                      key={chat.threadId}
                      type="button"
                      onClick={() => {
                        if (chat.locked) {
                          setActionError('Chat is locked. Right click to unlock.');
                          return;
                        }
                        pickPeer(chat.peerId, chat.peerUsername);
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setRecentMenu({
                          x: e.clientX,
                          y: e.clientY,
                          chat
                        });
                      }}
                      className={cn(
                        'flex w-full gap-3 rounded-2xl px-3 py-2.5 text-left transition',
                        selected
                          ? 'bg-slate-800 text-white shadow-md dark:bg-slate-950'
                          : 'text-slate-800 hover:bg-white dark:text-slate-100 dark:hover:bg-slate-800/90'
                      )}
                    >
                      <Image
                        src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(chat.peerUsername || chat.peerId)}`}
                        alt=""
                        width={44}
                        height={44}
                        unoptimized
                        className={cn(
                          'h-11 w-11 shrink-0 rounded-full border object-cover',
                          selected ? 'border-white/20' : 'border-slate-200/90 dark:border-slate-700'
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className={cn(
                              'flex min-w-0 items-center gap-1 truncate text-sm font-semibold',
                              selected ? 'text-white' : 'text-slate-800 dark:text-slate-100'
                            )}
                          >
                            <span className="truncate">{chat.peerUsername}</span>
                            {chat.locked && <Lock className="h-3.5 w-3.5 shrink-0 opacity-80" />}
                            {chat.archived && <Archive className="h-3.5 w-3.5 shrink-0 opacity-80" />}
                          </p>
                          <span
                            className={cn(
                              'shrink-0 text-[11px] tabular-nums',
                              selected ? 'text-violet-200' : 'text-slate-400 dark:text-slate-500'
                            )}
                          >
                            {formatListTime(chat.lastAt)}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center justify-between gap-2">
                          <p
                            className={cn(
                              'min-w-0 flex-1 truncate text-xs',
                              selected ? 'text-slate-300' : 'text-slate-500 dark:text-slate-400'
                            )}
                          >
                            {chat.lastMessage || 'Message'}
                          </p>
                          {!selected && unread > 0 ? (
                            <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-violet-600 px-1.5 text-[10px] font-bold text-white">
                              {unread > 99 ? '99+' : unread}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          {recentMenu && (
            <div
              className="fixed inset-0 z-[120]"
              onContextMenu={(e) => {
                e.preventDefault();
                setRecentMenu(null);
              }}
            >
              <div
                data-recent-menu
                role="menu"
                className="anim-pop fixed z-[130] min-w-[210px] overflow-hidden rounded-2xl border border-slate-200/90 bg-white py-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-950"
                style={{
                  left: Math.min(recentMenu.x, (typeof window !== 'undefined' ? window.innerWidth : recentMenu.x) - 220),
                  top: Math.min(recentMenu.y, (typeof window !== 'undefined' ? window.innerHeight : recentMenu.y) - 220)
                }}
              >
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-slate-800 transition-colors duration-150 hover:bg-violet-50 dark:text-slate-100 dark:hover:bg-slate-800"
                  onClick={async () => {
                    try {
                      await setRecentDirectChatLocked({
                        userId: user?.id,
                        threadId: recentMenu.chat.threadId,
                        locked: !recentMenu.chat.locked
                      });
                    } finally {
                      setRecentMenu(null);
                    }
                  }}
                >
                  <Lock className="h-4 w-4 shrink-0 opacity-80" />
                  {recentMenu.chat.locked ? 'Unlock chat' : 'Lock chat'}
                </button>

                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-slate-800 transition-colors duration-150 hover:bg-violet-50 dark:text-slate-100 dark:hover:bg-slate-800"
                  onClick={async () => {
                    try {
                      await setRecentDirectChatArchived({
                        userId: user?.id,
                        threadId: recentMenu.chat.threadId,
                        archived: !recentMenu.chat.archived
                      });
                    } finally {
                      setRecentMenu(null);
                    }
                  }}
                >
                  <Archive className="h-4 w-4 shrink-0 opacity-80" />
                  {recentMenu.chat.archived ? 'Unarchive chat' : 'Archive chat'}
                </button>

                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-red-700 transition-colors duration-150 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
                  onClick={async () => {
                    if (
                      typeof window !== 'undefined' &&
                      !window.confirm('Delete this chat from recent list? This will not delete message history.')
                    )
                      return;
                    try {
                      await deleteRecentDirectChat({
                        userId: user?.id,
                        threadId: recentMenu.chat.threadId
                      });
                      if (activeUserId.trim() === recentMenu.chat.peerId) {
                        clearPeer();
                      }
                    } finally {
                      setRecentMenu(null);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4 shrink-0" />
                  Delete chat
                </button>
              </div>
            </div>
          )}

          <section className="flex min-h-0 flex-1 flex-col overflow-hidden border-b border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 lg:border-b-0">
            <div className="flex shrink-0 items-center gap-3 border-b border-slate-200/80 px-4 py-3 dark:border-slate-800">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                {activeUserId.trim() ? (
                  <>
                    <div className="relative shrink-0">
                      {!peerAvatarFailed ? (
                        <Image
                          src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${peerAvatarSeed}`}
                          alt=""
                          width={48}
                          height={48}
                          unoptimized
                          className="h-12 w-12 rounded-full border border-slate-200/90 bg-slate-50 object-cover dark:border-slate-700 dark:bg-slate-800"
                          onError={() => setPeerAvatarFailed(true)}
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-violet-700 text-lg font-bold text-white shadow-md shadow-violet-500/25">
                          {peerInitial}
                        </div>
                      )}
                      {peerPresence?.online ? (
                        <span
                          className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500 dark:border-slate-900"
                          title="Online"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-semibold text-slate-800 dark:text-slate-50">
                        {peerUsername ? (
                          <span className="text-[15px]">{peerUsername}</span>
                        ) : (
                          <span className="font-mono text-[15px]">{peerShort}</span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {peerPresenceLoading ? (
                          <span className="inline-flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Loading status…
                          </span>
                        ) : (
                          formatPeerPresence(peerPresence?.online, peerPresence?.lastSeen)
                        )}
                      </p>
                    </div>
                  </>
                ) : (
                  <p className="text-sm font-semibold text-slate-400">Select a chat</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {activeUserId.trim() && user?.id ? (
                  <>
                    <Link
                      href={`/call?callee=${encodeURIComponent(activeUserId.trim())}`}
                      className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-violet-600 dark:text-slate-400 dark:hover:bg-slate-800"
                      title="Voice call"
                      aria-label="Voice call"
                    >
                      <Phone className="h-5 w-5" />
                    </Link>
                    <Link
                      href={`/video-call?callee=${encodeURIComponent(activeUserId.trim())}`}
                      className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-violet-600 dark:text-slate-400 dark:hover:bg-slate-800"
                      title="Video call"
                      aria-label="Video call"
                    >
                      <Video className="h-5 w-5" />
                    </Link>
                    <div className="relative" data-chat-header-menu>
                      <button
                        type="button"
                        className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-violet-600 dark:text-slate-400 dark:hover:bg-slate-800"
                        aria-expanded={chatHeaderMenuOpen}
                        aria-label="More actions"
                        onClick={() => setChatHeaderMenuOpen((o) => !o)}
                      >
                        <MoreVertical className="h-5 w-5" />
                      </button>
                      {chatHeaderMenuOpen ? (
                        <div
                          role="menu"
                          className="anim-pop absolute right-0 top-full z-50 mt-1.5 min-w-[200px] overflow-hidden rounded-2xl border border-slate-200/90 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-950"
                        >
                          <button
                            type="button"
                            role="menuitem"
                            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-slate-800 hover:bg-violet-50 dark:text-slate-100 dark:hover:bg-slate-800"
                            onClick={() => {
                              setChatHeaderMenuOpen(false);
                              setMsgSearchOpen((o) => !o);
                            }}
                          >
                            <Search className="h-4 w-4 opacity-80" />
                            Search messages
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-slate-800 hover:bg-violet-50 disabled:opacity-50 dark:text-slate-100 dark:hover:bg-slate-800"
                            disabled={chatTransferBusy}
                            onClick={() => {
                              setChatHeaderMenuOpen(false);
                              handleExportChatHistory();
                            }}
                          >
                            <Download className="h-4 w-4 opacity-80" />
                            Export chat
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-slate-800 hover:bg-violet-50 disabled:opacity-50 dark:text-slate-100 dark:hover:bg-slate-800"
                            disabled={chatTransferBusy}
                            onClick={() => {
                              setChatHeaderMenuOpen(false);
                              importChatFileRef.current?.click();
                            }}
                          >
                            <Upload className="h-4 w-4 opacity-80" />
                            Import chat
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                            onClick={() => {
                              setChatHeaderMenuOpen(false);
                              clearPeer();
                            }}
                          >
                            <X className="h-4 w-4 opacity-80" />
                            Close chat
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <input
                      ref={importChatFileRef}
                      type="file"
                      accept="application/json"
                      className="hidden"
                      onChange={(e) => handleImportChatFile(e.target.files?.[0])}
                    />
                  </>
                ) : null}
              </div>
            </div>

            {msgSearchOpen && activeUserId.trim() && (
              <div className="shrink-0 border-b border-slate-200/80 bg-slate-50 px-4 py-2 dark:border-slate-800 dark:bg-slate-900/80">
                <input
                  autoFocus
                  className="w-full rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/25 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  placeholder="Search messages…"
                  value={msgSearch}
                  onChange={(e) => setMsgSearch(e.target.value)}
                />
              </div>
            )}

            {pinnedMessages.length > 0 && activeUserId.trim() && (
              <div className="shrink-0 border-b border-slate-200/80 bg-violet-50/80 dark:border-slate-800 dark:bg-violet-950/20">
                {pinnedMessages.slice(0, 1).map((pin) => (
                  <div key={pin.messageId} className="flex items-center gap-2 px-4 py-2">
                    <Pin className="h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-400" />
                    <p className="min-w-0 flex-1 truncate text-xs font-medium text-slate-800 dark:text-slate-100">
                      {pin.content || 'Pinned message'}
                    </p>
                    <button
                      type="button"
                      className="shrink-0 text-xs font-medium text-violet-600 hover:underline dark:text-violet-400"
                      onClick={() => handleUnpinDmMessage(pin.messageId)}
                    >
                      Unpin
                    </button>
                  </div>
                ))}
                {pinnedMessages.length > 1 && (
                  <p className="px-4 pb-1 text-[10px] text-slate-500 dark:text-slate-400">
                    +{pinnedMessages.length - 1} more pinned
                  </p>
                )}
              </div>
            )}

            <div
              ref={messagesWrapRef}
              className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain bg-[#F9FAFB] px-3 py-3 dark:bg-slate-950/50 sm:px-5 sm:py-4"
            >
              {messageLoadError && (
                <div className="rounded-2xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                  <p>{messageLoadError}</p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="mt-2 h-7 px-2 text-[11px]"
                    onClick={() => setHistoryRefreshTick((value) => value + 1)}
                  >
                    Retry
                  </Button>
                </div>
              )}

              {messagesLoading && (
                <div className="rounded-2xl border border-slate-200/90 bg-white px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                  Loading messages…
                </div>
              )}

              {filteredMessages.length > 0 && (
                <div
                  className="relative w-full"
                  style={{ height: `${messageVirtualizer.getTotalSize()}px` }}
                >
                  {messageVirtualizer.getVirtualItems().map((virtualRow) => {
                    const m = filteredMessages[virtualRow.index];
                    const idx = virtualRow.index;
                    const prev = idx > 0 ? filteredMessages[idx - 1] : null;
                    const currTs = Number(m.createdAt || 0);
                    const prevTs = prev ? Number(prev.createdAt || 0) : 0;
                    const showDate =
                      currTs &&
                      (!prevTs || !sameCalendarDay(currTs, prevTs));
                    const mine = m.senderId === user?.id;
                    const createdAt = Number(m.createdAt || 0);
                    const canEditDelete = !m.isDeleted && createdAt && Date.now() - createdAt <= EDIT_WINDOW_MS;
                    const senderLabel = mine ? user?.username || 'You' : peerLabel;
                    const isPinned = pinnedSet.has(m._id);
                    return (
                      <div
                        key={virtualRow.key}
                        data-index={virtualRow.index}
                        ref={messageVirtualizer.measureElement}
                        className="absolute left-0 top-0 w-full pb-3"
                        style={{ transform: `translateY(${virtualRow.start}px)` }}
                      >
                        {showDate ? (
                          <p className="mb-3 text-center text-[11px] font-medium text-slate-400 dark:text-slate-500">
                            {formatDaySeparator(currTs)}
                          </p>
                        ) : null}
                        <ChatMessageRow
                          m={m}
                          idx={idx}
                          mine={mine}
                          senderLabel={senderLabel}
                          canEditDelete={canEditDelete}
                          isPinned={isPinned}
                          peerKey={peerKey}
                          userId={user?.id}
                          openMessageMenuId={openMessageMenuId}
                          deletingMessageId={deletingMessageId}
                          toggleMessageMenu={toggleMessageMenu}
                          handleEditMessage={handleEditMessage}
                          handleDeleteMessage={handleDeleteMessage}
                          handleDeleteForMe={handleDeleteForMe}
                          handlePinDmMessage={handlePinDmMessage}
                          handleUnpinDmMessage={handleUnpinDmMessage}
                          openReactionPickerId={openReactionPickerId}
                          setOpenReactionPickerId={setOpenReactionPickerId}
                          EMOJI_OPTIONS={EMOJI_OPTIONS}
                          handleToggleDmReaction={handleToggleDmReaction}
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {messages.length === 0 && (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-12 text-center">
                  <div className="rounded-3xl border border-dashed border-slate-200/90 bg-white px-6 py-8 dark:border-slate-700 dark:bg-slate-900/60">
                    <MessageCircle className="mx-auto h-10 w-10 text-violet-500" />
                    <p className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-100">No messages yet</p>
                    <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
                      Say hi to start the conversation.
                    </p>
                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-8 rounded-full px-4 text-xs"
                        disabled={!activeUserId.trim() || sendingMessage}
                        onClick={() => sendQuickMessage('hi')}
                      >
                        Hi
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-8 rounded-full px-4 text-xs"
                        disabled={!activeUserId.trim() || sendingMessage}
                        onClick={() => sendQuickMessage('hello')}
                      >
                        Hello
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-8 rounded-full px-4 text-xs"
                        disabled={!activeUserId.trim() || sendingMessage}
                        onClick={() => sendQuickMessage('namaste')}
                      >
                        Namaste
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {typingUsers.length > 0 && (
              <div className="shrink-0 px-5 py-1 text-xs text-slate-500 dark:text-slate-400">
                <span className="animate-pulse">
                  {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing…
                </span>
              </div>
            )}

            <form
              className="shrink-0 border-t border-slate-200/80 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 sm:p-4"
              onSubmit={sendMessage}
            >
              <input
                ref={mediaInputRef}
                type="file"
                accept="*/*"
                className="hidden"
                onChange={handleSelectMedia}
              />
              <div className="flex items-center gap-1 rounded-full border border-slate-200/90 bg-slate-50/90 px-2 py-1.5 shadow-sm dark:border-slate-700 dark:bg-slate-800/80 sm:gap-2 sm:px-3">
                <button
                  type="button"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-white hover:text-violet-600 dark:text-slate-400 dark:hover:bg-slate-700"
                  aria-label="Attach file"
                  onClick={() => mediaInputRef.current?.click()}
                >
                  <Paperclip className="h-5 w-5" />
                </button>
                <input
                  className="min-w-0 flex-1 border-0 bg-transparent px-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
                  value={input}
                  onChange={handleTypingInput}
                  placeholder={activeUserId.trim() ? 'Type a message…' : 'Choose someone to chat…'}
                  disabled={isRecording}
                />
                <button
                  type="button"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-white hover:text-violet-600 dark:text-slate-400 dark:hover:bg-slate-700"
                  title="Emoji"
                  aria-label="Emoji"
                  onClick={() => activeUserId.trim() && setOpenReactionPickerId(null)}
                >
                  <SmilePlus className="h-5 w-5" />
                </button>
                {isRecording ? (
                  <button
                    type="button"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500 text-white"
                    onClick={handleStopRecording}
                    aria-label="Stop recording"
                  >
                    <MicOff className="h-5 w-5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-white hover:text-violet-600 dark:text-slate-400 dark:hover:bg-slate-700"
                    aria-label="Voice note"
                    onClick={handleStartRecording}
                  >
                    <Mic className="h-5 w-5" />
                  </button>
                )}
                <button
                  type="submit"
                  disabled={!activeUserId.trim() || !input.trim() || sendingMessage || isRecording}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white shadow-lg shadow-violet-600/30 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-45"
                  aria-label="Send"
                >
                  {sendingMessage ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                </button>
              </div>
            </form>

            {actionError && (
              <div className="border-t border-slate-200/80 px-4 py-2 text-xs text-red-600 dark:border-slate-800 dark:text-red-400">
                {actionError}
              </div>
            )}
          </section>

          <aside className="hidden min-h-0 flex-col gap-5 overflow-y-auto border-l border-slate-200/80 bg-[#F9FAFB] p-4 dark:border-slate-800 dark:bg-slate-900/90 xl:flex">
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Notifications</h3>
              <p className="mt-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-violet-600 dark:text-violet-400">@mentions</span> and group alerts
                will show here when wired. You’re all caught up for direct chats.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Suggestions</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">People you may know</p>
              <ul className="mt-3 space-y-2">
                {searchResults.length > 0 ? (
                  searchResults.slice(0, 4).map((u) => (
                    <li
                      key={u.id}
                      className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-950/80"
                    >
                      <Image
                        src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(u.username || u.id)}`}
                        alt=""
                        width={40}
                        height={40}
                        unoptimized
                        className="h-10 w-10 rounded-full border border-slate-200/80 object-cover dark:border-slate-700"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{u.username}</p>
                        <p className="text-[11px] text-slate-500">From your search</p>
                      </div>
                      <button
                        type="button"
                        className="shrink-0 rounded-full bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-700"
                        onClick={() => pickPeer(u.id, u.username)}
                      >
                        Chat
                      </button>
                    </li>
                  ))
                ) : (
                  <li className="rounded-2xl border border-dashed border-slate-200/90 bg-white/60 px-3 py-4 text-center text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-400">
                    Search for a username in the sidebar to see people here.
                  </li>
                )}
              </ul>
            </div>
          </aside>
        </div>
      </motion.main>
    </div>
  );
}
