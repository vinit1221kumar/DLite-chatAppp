'use client';
/* eslint-disable @next/next/no-img-element */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
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
  MessageCircle,
  Mic,
  MicOff,
  Phone,
  Upload,
  Pin,
  PinOff,
  MoreVertical,
  Pencil,
  Paperclip,
  Search,
  Send,
  SmilePlus,
  Sparkles,
  Trash2,
  Video,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppMainHeader } from '@/components/AppMainHeader';

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
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn('group flex w-full flex-col', mine ? 'items-end' : 'items-start')}
    >
      <div className="relative flex items-end">
        <div
          className={cn(
            'relative max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm sm:max-w-[70%]',
            mine
              ? 'rounded-br-md border border-emerald-200 bg-emerald-100 text-emerald-950 shadow-emerald-600/10 dark:border-emerald-500/25 dark:bg-emerald-500/15 dark:text-slate-50'
              : 'rounded-bl-md border border-yellow-200 bg-yellow-50 text-amber-950 shadow-amber-600/10 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-slate-50'
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <div
              className={cn(
                'truncate text-[11px] font-semibold tracking-wide',
                mine ? 'text-emerald-700/90 dark:text-emerald-200/90' : 'text-amber-700/90 dark:text-amber-200/90'
              )}
            >
              {senderLabel}
              {isPinned && <Pin className="ml-1 inline h-2.5 w-2.5 opacity-70" />}
              {mine && (
                <div
                  className={cn(
                    'mt-0.5 text-[10px] font-semibold tracking-wide',
                    m.readBy?.[peerKey]
                      ? 'text-emerald-700/85 dark:text-emerald-200/85'
                      : m.deliveredBy?.[peerKey]
                        ? 'text-emerald-700/70 dark:text-emerald-200/70'
                        : 'text-emerald-700/60 dark:text-emerald-200/60'
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
                    ? 'text-emerald-700/90 hover:bg-emerald-200/70 dark:text-emerald-200/90 dark:hover:bg-emerald-500/20'
                    : 'text-amber-700/90 hover:bg-yellow-100/80 dark:text-amber-200/90 dark:hover:bg-amber-500/15'
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
                    ? 'text-emerald-700/90 hover:bg-emerald-200/70 dark:text-emerald-200/90 dark:hover:bg-emerald-500/20'
                    : 'text-amber-700/90 hover:bg-yellow-100/80 dark:text-amber-200/90 dark:hover:bg-amber-500/15'
                )}
                onClick={() => toggleMessageMenu(m._id)}
                aria-label="Message actions"
              >
                <MoreVertical className="h-4 w-4" />
              </button>

              {openMessageMenuId === m._id && (
                <div
                  role="menu"
                  className="anim-pop absolute right-0 top-full z-50 mt-1.5 min-w-[170px] overflow-hidden rounded-2xl border border-amber-200/90 bg-white py-1.5 shadow-xl shadow-amber-900/10 dark:border-navy-700/60 dark:bg-navy-950"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-amber-950 transition-colors duration-150 hover:bg-amber-100 dark:text-slate-50 dark:hover:bg-navy-800/60"
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
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-amber-950 transition-colors duration-150 hover:bg-amber-100 disabled:pointer-events-none disabled:opacity-60 dark:text-slate-50 dark:hover:bg-navy-800/60"
                        onClick={() => handleEditMessage(m)}
                        disabled={!canEditDelete}
                      >
                        <Pencil className="h-4 w-4 shrink-0 opacity-80" />
                        Edit message
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-red-700 transition-colors duration-150 hover:bg-red-50 disabled:pointer-events-none disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-950/50"
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
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-amber-950 transition-colors duration-150 hover:bg-amber-100 dark:text-slate-50 dark:hover:bg-navy-800/60"
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
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-amber-950 transition-colors duration-150 hover:bg-amber-100 dark:text-slate-50 dark:hover:bg-navy-800/60"
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
                  ? 'border-emerald-200/80 bg-emerald-50 text-emerald-950 hover:bg-emerald-100 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-slate-50 dark:hover:bg-emerald-500/15'
                  : 'border-yellow-200/80 bg-yellow-50 text-amber-950 hover:bg-yellow-100/70 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-slate-50 dark:hover:bg-amber-500/15'
              )}
            >
              <div className="truncate font-semibold">{m.fileName || 'Download file'}</div>
              <div className={cn('mt-0.5 text-xs opacity-80', mine ? 'text-emerald-700/80 dark:text-emerald-200/80' : '')}>Open / download</div>
            </a>
          ) : null}
          {(m.content || m.isDeleted) ? (
            <p
              className={cn(
                'mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed',
                m.isDeleted ? 'italic opacity-80' : mine ? 'text-emerald-950 dark:text-slate-50' : 'text-amber-950 dark:text-slate-50'
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
            'absolute bottom-1 flex h-7 w-7 items-center justify-center rounded-full border border-amber-200/80 bg-white text-base shadow transition',
            'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100',
            'dark:border-navy-700/60 dark:bg-navy-950',
            mine ? 'left-[-36px]' : 'right-[-36px]'
          )}
          onClick={() => setOpenReactionPickerId((prev) => (prev === m._id ? null : m._id))}
          title="React"
        >
          <SmilePlus className="h-3.5 w-3.5 text-amber-600 dark:text-sky-400" />
        </button>
      </div>

      {openReactionPickerId === m._id && (
        <div
          data-reaction-picker
          className={cn(
            'mt-1 flex gap-1 rounded-full border border-amber-200/80 bg-white px-2 py-1 shadow-md dark:border-navy-700/60 dark:bg-navy-950',
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
                  reacted ? 'border-amber-400 bg-amber-100 dark:border-sky-500 dark:bg-navy-800' : 'border-amber-200/80 bg-white dark:border-navy-700 dark:bg-navy-900'
                )}
                onClick={() => handleToggleDmReaction(m._id, emoji)}
              >
                <span>{emoji}</span>
                <span className={reacted ? 'text-amber-700 dark:text-sky-400' : 'text-amber-800 dark:text-slate-300'}>{count}</span>
              </button>
            );
          })}
        </div>
      )}
    </motion.div>
  );
});

export default function ChatDashboardPage() {
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
  const filteredMessages = useMemo(() => {
    if (!msgSearchLower) return messages;
    return messages.filter((m) => (m.content || '').toLowerCase().includes(msgSearchLower));
  }, [messages, msgSearchLower]);
  const pinnedSet = useMemo(() => new Set(pinnedMessages.map((p) => p.messageId)), [pinnedMessages]);

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
    if (!searchOpen) return;
    const onDoc = (e) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target)) setSearchOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [searchOpen]);

  useEffect(() => {
    if (!user?.id || !searchOpen) return;
    let cancelled = false;
    const handle = async () => {
      setSearchLoading(true);
      try {
        const users = await searchUsersByUsername(searchQuery, user.id);
        if (!cancelled) setSearchResults(users);
      } catch {
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    };
    const t = setTimeout(handle, 220);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [user?.id, searchOpen, searchQuery]);

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

  useEffect(() => {
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

  const peerDisplay = peerUsername || (activeUserId.trim() ? peerShort : '');
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
    <div className="app-shell flex h-[100dvh] min-h-0 flex-col overflow-hidden">
      <AppMainHeader />

      <motion.main
        className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-3 pt-3 sm:px-5"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.2, 0.9, 0.2, 1] }}
      >
        <div className="anim-fade-up mb-3 flex shrink-0 items-start gap-2 rounded-2xl border border-amber-200/70 bg-gradient-to-r from-amber-100/80 to-yellow-50/60 px-3 py-2.5 dark:border-navy-700/40 dark:from-navy-900/40 dark:to-navy-950/50 sm:px-4 sm:py-3">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-sky-400 sm:h-5 sm:w-5" />
          <p className="text-xs leading-relaxed text-amber-900/90 dark:text-slate-100/90 sm:text-sm">
            <span className="font-semibold">Direct messages</span> — tap the search icon in Chats, find someone by{' '}
            <span className="font-semibold">username</span>, then message them in real time.
          </p>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)] lg:grid-rows-1 lg:items-stretch lg:gap-5">
          {/* Sidebar */}
          <aside className="card anim-fade-up flex max-h-[38vh] min-h-0 flex-col overflow-visible p-0 [animation-delay:70ms] lg:max-h-none lg:min-h-0">
            <div
              ref={searchWrapRef}
              className="relative shrink-0 border-b border-amber-200/60 bg-amber-50/50 dark:border-navy-700/40 dark:bg-navy-950/50"
            >
              <div className="flex items-center justify-between gap-2 px-4 py-3">
                <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-amber-950 dark:text-slate-100">
                  <MessageCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-sky-400" />
                  Chats
                </div>
                <Button
                  type="button"
                  variant={searchOpen ? 'default' : 'secondary'}
                  size="icon"
                  className="h-10 w-10 shrink-0 rounded-xl"
                  aria-expanded={searchOpen}
                  aria-label="Search users"
                  onClick={() => setSearchOpen((o) => !o)}
                >
                  <Search className="h-5 w-5" />
                </Button>
              </div>

              {searchOpen && (
                <div className="anim-pop absolute left-4 right-4 top-full z-[60] mt-2 overflow-hidden rounded-2xl border border-amber-200/90 bg-white shadow-xl dark:border-navy-700/60 dark:bg-navy-950">
                    <div className="border-b border-amber-100 p-2 dark:border-navy-700/50">
                      <input
                        ref={searchInputRef}
                        className="input py-2.5 text-sm"
                        placeholder="Search username…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                    <div className="max-h-52 overflow-y-auto p-1">
                      {searchLoading ? (
                        <div className="flex items-center justify-center gap-2 py-6 text-sm text-amber-700 dark:text-slate-300">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Searching…
                        </div>
                      ) : searchResults.length === 0 ? (
                        <p className="px-3 py-4 text-center text-xs text-amber-700/80 dark:text-sky-400/90">
                          No users found.
                        </p>
                      ) : (
                        searchResults.map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-amber-950 hover:bg-amber-100 dark:text-slate-50 dark:hover:bg-navy-800/60"
                            onClick={() => pickPeer(u.id, u.username)}
                          >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-200/80 text-xs font-bold text-amber-900 dark:bg-navy-800/80 dark:text-slate-100">
                              {(u.username || '?').slice(0, 1).toUpperCase()}
                            </span>
                            <span className="min-w-0 flex-1 truncate">{u.username}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
              )}
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              {activeUserId.trim() && (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-200/70 bg-amber-50/90 px-3 py-2 dark:border-navy-700/50 dark:bg-navy-900/40">
                  <span className="truncate text-sm font-semibold text-amber-950 dark:text-slate-100">
                    {peerDisplay}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    aria-label="Clear chat"
                    onClick={clearPeer}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}

              <div className="space-y-2">
                <p className="px-1 text-xs font-semibold uppercase tracking-wide text-amber-800/80 dark:text-slate-300/90">
                  Recent chats
                </p>

                {recentLoadError && (
                  <div className="rounded-lg border border-red-400/40 bg-red-500/10 px-2.5 py-2 text-xs text-red-700 dark:text-red-300">
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
                  <div className="flex items-center gap-2 px-2 py-2 text-xs text-amber-700 dark:text-slate-300">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading…
                  </div>
                ) : recentChats.length === 0 ? (
                  <p className="px-2 py-2 text-xs text-amber-700/80 dark:text-slate-300/80">No recent chats yet.</p>
                ) : (
                  recentChats.map((chat) => (
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
                        'w-full rounded-xl border px-3 py-2 text-left transition-colors duration-150',
                        activeUserId.trim() === chat.peerId
                          ? 'border-amber-300/80 bg-amber-100/70 dark:border-navy-600/60 dark:bg-navy-900/50'
                          : 'border-amber-200/70 bg-white/70 hover:bg-amber-50 dark:border-navy-700/50 dark:bg-navy-950/40 dark:hover:bg-navy-900/50'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="flex min-w-0 items-center gap-2 truncate text-sm font-semibold text-amber-950 dark:text-slate-100">
                          <span className="truncate">{chat.peerUsername}</span>
                          {chat.locked && <Lock className="h-3.5 w-3.5 shrink-0 opacity-80" />}
                          {chat.archived && <Archive className="h-3.5 w-3.5 shrink-0 opacity-80" />}
                        </p>
                        {activeUserId.trim() !== chat.peerId && Number(chat.unreadCount || 0) > 0 && (
                          <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-amber-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white dark:bg-sky-500">
                            {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-amber-700/90 dark:text-slate-300/90">
                        {chat.lastMessage || 'Message'}
                      </p>
                      {activeUserId.trim() !== chat.peerId && Number(chat.unreadCount || 0) > 0 && (
                        <p className="mt-1 text-[11px] font-semibold text-amber-700 dark:text-sky-400">
                          {chat.unreadCount} unread {chat.unreadCount === 1 ? 'message' : 'messages'}
                        </p>
                      )}
                    </button>
                  ))
                )}
              </div>
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
                className="anim-pop fixed z-[130] min-w-[210px] overflow-hidden rounded-2xl border border-amber-200/90 bg-white py-1.5 shadow-xl shadow-amber-900/10 dark:border-navy-700/60 dark:bg-navy-950"
                style={{
                  left: Math.min(recentMenu.x, (typeof window !== 'undefined' ? window.innerWidth : recentMenu.x) - 220),
                  top: Math.min(recentMenu.y, (typeof window !== 'undefined' ? window.innerHeight : recentMenu.y) - 220)
                }}
              >
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-amber-950 transition-colors duration-150 hover:bg-amber-100 dark:text-slate-50 dark:hover:bg-navy-800/60"
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
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-amber-950 transition-colors duration-150 hover:bg-amber-100 dark:text-slate-50 dark:hover:bg-navy-800/60"
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

          {/* Chat panel — fills remaining viewport */}
          <section className="card anim-fade-up flex min-h-0 flex-1 flex-col overflow-hidden p-0 [animation-delay:130ms] lg:min-h-0">
            <div className="flex flex-col gap-3 border-b border-amber-200/60 bg-gradient-to-r from-white/90 to-amber-50/30 px-4 py-3 dark:border-navy-700/40 dark:from-navy-950/80 dark:to-navy-950/50 sm:flex-row sm:items-center sm:justify-between">
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
                          className="h-12 w-12 rounded-2xl border border-amber-200/70 bg-amber-50 object-cover dark:border-navy-700/50 dark:bg-navy-900/40"
                          onError={() => setPeerAvatarFailed(true)}
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-lg font-bold text-white shadow-md shadow-violet-500/25 dark:from-violet-600 dark:to-fuchsia-700">
                          {peerInitial}
                        </div>
                      )}
                      {peerPresence?.online ? (
                        <span
                          className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500 dark:border-navy-950"
                          title="Online"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-semibold text-amber-950 dark:text-slate-50">
                        {peerUsername ? (
                          <span className="text-[15px]">{peerUsername}</span>
                        ) : (
                          <span className="font-mono text-[15px]">{peerShort}</span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-amber-700/90 dark:text-slate-300/90">
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
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      aria-label="Clear chat"
                      onClick={clearPeer}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <p className="text-sm font-semibold text-amber-700/50 dark:text-sky-400/90">Select a chat</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {activeUserId.trim() && user?.id ? (
                  <>
                    <Button
                      type="button"
                      size="icon"
                      variant={msgSearchOpen ? 'default' : 'ghost'}
                      className="h-8 w-8 shrink-0"
                      onClick={() => setMsgSearchOpen((o) => !o)}
                      title="Search messages"
                      aria-label="Search messages"
                    >
                      <Search className="h-4 w-4" />
                    </Button>
                    <Button asChild size="sm" variant="secondary">
                      <Link href={`/call?callee=${encodeURIComponent(activeUserId.trim())}`}>
                        <Phone className="mr-1.5 h-4 w-4" />
                        Voice
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="secondary">
                      <Link href={`/video-call?callee=${encodeURIComponent(activeUserId.trim())}`}>
                        <Video className="mr-1.5 h-4 w-4" />
                        Video
                      </Link>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={chatTransferBusy}
                      onClick={handleExportChatHistory}
                      title="Export this direct chat as JSON"
                    >
                      <Download className="mr-1.5 h-4 w-4" />
                      Export
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={chatTransferBusy}
                      onClick={() => importChatFileRef.current?.click()}
                      title="Import direct chat JSON"
                    >
                      <Upload className="mr-1.5 h-4 w-4" />
                      Import
                    </Button>
                    <input
                      ref={importChatFileRef}
                      type="file"
                      accept="application/json"
                      className="hidden"
                      onChange={(e) => handleImportChatFile(e.target.files?.[0])}
                    />
                  </>
                ) : (
                  <>
                    <Button type="button" size="sm" variant="secondary" disabled title="Choose someone to chat">
                      <Phone className="mr-1.5 h-4 w-4" />
                      Voice
                    </Button>
                    <Button type="button" size="sm" variant="secondary" disabled title="Choose someone to chat">
                      <Video className="mr-1.5 h-4 w-4" />
                      Video
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Message search bar */}
            {msgSearchOpen && activeUserId.trim() && (
              <div className="shrink-0 border-b border-amber-200/60 bg-amber-50/60 px-4 py-2 dark:border-navy-700/40 dark:bg-navy-950/50">
                <input
                  autoFocus
                  className="input py-1.5 text-sm"
                  placeholder="Search messages…"
                  value={msgSearch}
                  onChange={(e) => setMsgSearch(e.target.value)}
                />
              </div>
            )}

            {/* Pinned messages banner */}
            {pinnedMessages.length > 0 && activeUserId.trim() && (
              <div className="shrink-0 border-b border-amber-200/60 bg-amber-50/80 dark:border-navy-700/40 dark:bg-navy-950/60">
                {pinnedMessages.slice(0, 1).map((pin) => (
                  <div key={pin.messageId} className="flex items-center gap-2 px-4 py-2">
                    <Pin className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-sky-400" />
                    <p className="min-w-0 flex-1 truncate text-xs font-medium text-amber-900 dark:text-slate-100">
                      {pin.content || 'Pinned message'}
                    </p>
                    <button
                      type="button"
                      className="shrink-0 text-xs text-amber-600 hover:underline dark:text-sky-400"
                      onClick={() => handleUnpinDmMessage(pin.messageId)}
                    >
                      Unpin
                    </button>
                  </div>
                ))}
                {pinnedMessages.length > 1 && (
                  <p className="px-4 pb-1 text-[10px] text-amber-700/70 dark:text-slate-400/70">
                    +{pinnedMessages.length - 1} more pinned
                  </p>
                )}
              </div>
            )}

            <div
              ref={messagesWrapRef}
              className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain bg-amber-50/20 px-3 py-3 dark:bg-navy-900/25 sm:px-4 sm:py-4"
            >
              {messageLoadError && (
                <div className="rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
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
                <div className="rounded-xl border border-amber-200/70 bg-amber-50/80 px-3 py-2 text-xs text-amber-800 dark:border-navy-700/50 dark:bg-navy-900/40 dark:text-slate-300">
                  Loading messages…
                </div>
              )}

              {filteredMessages.map((m, idx) => {
                const mine = m.senderId === user?.id;
                const createdAt = Number(m.createdAt || 0);
                const canEditDelete = !m.isDeleted && createdAt && Date.now() - createdAt <= EDIT_WINDOW_MS;
                const senderLabel = mine ? user?.username || 'You' : peerLabel;
                const isPinned = pinnedSet.has(m._id);
                return (
                  <ChatMessageRow
                    key={m._id || idx}
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
                );
              })}

              {messages.length === 0 && (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-12 text-center">
                  <div className="rounded-2xl border border-dashed border-amber-300/70 bg-amber-50/80 px-6 py-8 dark:border-navy-700/50 dark:bg-navy-950/40">
                    <MessageCircle className="mx-auto h-10 w-10 text-amber-400 dark:text-sky-500" />
                    <p className="mt-3 text-sm font-medium text-amber-900 dark:text-slate-100">No messages yet</p>
                    <p className="mt-1 max-w-sm text-xs text-amber-800/80 dark:text-slate-300/80">
                      Start with a quick greeting. (Tip: choose a chat first.)
                    </p>
                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-8 px-3 text-xs"
                        disabled={!activeUserId.trim() || sendingMessage}
                        onClick={() => sendQuickMessage('hi')}
                      >
                        Hi
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-8 px-3 text-xs"
                        disabled={!activeUserId.trim() || sendingMessage}
                        onClick={() => sendQuickMessage('hello')}
                      >
                        Hello
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-8 px-3 text-xs"
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

            {/* Typing indicator */}
            {typingUsers.length > 0 && (
              <div className="shrink-0 px-4 py-1 text-xs text-amber-700/80 dark:text-slate-400">
                <span className="animate-pulse">
                  {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing…
                </span>
              </div>
            )}

            <form
              className="flex flex-col gap-2 border-t border-amber-200/60 bg-white/80 p-3 dark:border-navy-700/40 dark:bg-navy-950/70 sm:flex-row sm:items-center"
              onSubmit={sendMessage}
            >
              <input
                ref={mediaInputRef}
                type="file"
                accept="*/*"
                className="hidden"
                onChange={handleSelectMedia}
              />
              {/* Media + voice notes are hidden in production until Storage is wired */}
              <input
                className="input flex-1"
                value={input}
                onChange={handleTypingInput}
                placeholder={activeUserId.trim() ? 'Type a message…' : 'Choose someone to chat…'}
                disabled={isRecording}
              />
              <Button
                className="shrink-0 gap-2 sm:px-6"
                type="submit"
                disabled={!activeUserId.trim() || !input.trim() || sendingMessage || isRecording}
              >
                <Send className="h-4 w-4" />
                {sendingMessage ? 'Sending…' : 'Send'}
              </Button>
            </form>

            {actionError && (
              <div className="border-t border-amber-200/60 px-3 py-2 text-xs text-red-700 dark:border-navy-700/40 dark:text-red-300 sm:px-4">
                {actionError}
              </div>
            )}
          </section>
        </div>
      </motion.main>
    </div>
  );
}
