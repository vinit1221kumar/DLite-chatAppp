'use client';
/* eslint-disable @next/next/no-img-element */

import { memo, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
import {
  AtSign,
  BarChart2,
  ChevronDown,
  ChevronUp,
  FileText,
  Film,
  FolderOpen,
  Loader2,
  Lock,
  Archive,
  Download,
  ImageIcon,
  LayoutGrid,
  Link2,
  Mail,
  MapPin,
  MessageCircle,
  Mic,
  MicOff,
  Monitor,
  Phone,
  Plus,
  PlusCircle,
  Tag,
  Upload,
  User,
  Users,
  Pin,
  PinOff,
  MoreVertical,
  Pencil,
  Paperclip,
  Search,
  Send,
  SmilePlus,
  Trash2,
  Video,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChatAppShell } from '@/components/ChatAppShell';
import { ChatAppIconRail } from '@/components/ChatAppIconRail';
import { ChatAppTopBar } from '@/components/ChatAppTopBar';
import { ComposerOverflowMenu, composerMenuItemClass } from '@/components/ComposerOverflowMenu';

function RightDrawer({ open, title, onClose, children }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[190]" role="dialog" aria-modal="true" aria-label={title || 'Details'}>
      <div className="absolute inset-0 bg-black/35 backdrop-blur-[1px]" onClick={onClose} />
      <div className="absolute right-0 top-0 flex h-full w-full max-w-[420px] flex-col border-l border-ui-border bg-ui-panel shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-ui-border px-4 py-3">
          <p className="min-w-0 truncate text-sm font-bold text-slate-900 dark:text-slate-50">{title}</p>
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-ui-muted hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-50"
            onClick={onClose}
            aria-label="Close"
          >
            <span className="text-xl leading-none">×</span>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>,
    document.body
  );
}

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

function formatMessageMetaTime(ts) {
  if (!ts) return '';
  const d = new Date(Number(ts));
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formatListTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

const DM_POLL_PREFIX = '__DL_POLL__';

function parseDmPoll(content) {
  if (!content || typeof content !== 'string' || !content.startsWith(DM_POLL_PREFIX)) return null;
  try {
    const data = JSON.parse(content.slice(DM_POLL_PREFIX.length));
    const q = String(data.q || '').trim();
    const raw = data.o || data.options;
    if (!q || !Array.isArray(raw) || raw.length < 2) return null;
    const o = raw.map((x) => String(x || '').trim()).filter(Boolean);
    if (o.length < 2) return null;
    return { q, o: o.slice(0, 6) };
  } catch {
    return null;
  }
}

const ChatMessageRow = memo(function ChatMessageRow({
  m,
  mine,
  senderLabel,
  avatarSeed,
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
  const poll = parseDmPoll(m.content);
  const isPollMessage = Boolean(poll);
  const showPlainText = !isPollMessage && (m.content || m.isDeleted);

  const bubbleBase = mine ? 'chat-bubble-sent' : 'chat-bubble-received';

  const iconBtnMine = 'text-white/90 hover:bg-white/15';
  const iconBtnTheirs =
    'text-slate-500 hover:bg-slate-200/80 dark:text-slate-400 dark:hover:bg-slate-700/80';

  const menuPollSafe = !isPollMessage;

  return (
    <div className={cn('group flex w-full flex-col', mine ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'flex w-full max-w-[min(92%,720px)] gap-2.5 sm:max-w-[min(88%,680px)]',
          mine ? 'flex-row-reverse' : 'flex-row'
        )}
      >
        <Image
          src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(avatarSeed || 'user')}`}
          alt=""
          width={36}
          height={36}
          unoptimized
          className="h-9 w-9 shrink-0 self-end rounded-full border border-ui-border bg-ui-muted object-cover"
        />
        <div className={cn('min-w-0 flex-1', mine ? 'flex flex-col items-end' : '')}>
          <div
            className={cn(
              'mb-1 max-w-full text-[12px]',
              mine
                ? 'pr-0.5 text-right text-white/75'
                : 'pl-0.5 text-slate-500 dark:text-slate-400'
            )}
          >
            <span
              className={cn('font-medium', mine ? 'text-white/95' : 'text-slate-600 dark:text-slate-300')}
            >
              {senderLabel}
            </span>
            {m.createdAt ? (
              <span className={cn('font-normal', mine ? 'text-white/65' : 'text-slate-400 dark:text-slate-500')}>
                {' '}
                · {formatMessageMetaTime(m.createdAt)}
              </span>
            ) : null}
            {isPinned ? <Pin className="ml-1 inline h-3 w-3 align-middle opacity-70" /> : null}
            {mine ? (
              <span className="ml-2 text-[10px] font-semibold tracking-wide text-white/85">
                {m.readBy?.[peerKey] ? 'Read' : m.deliveredBy?.[peerKey] ? 'Delivered' : 'Sent'}
              </span>
            ) : null}
          </div>

          <div className="relative inline-block max-w-full">
            {isPollMessage ? (
              <div className="max-w-[min(100%,420px)] overflow-hidden rounded-2xl border border-ui-poll bg-ui-poll text-white shadow-md">
                <div className="border-b border-white/10 px-4 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-ui-poll-muted">
                      Poll
                    </span>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        className="rounded-md p-1.5 text-ui-poll-muted transition hover:bg-white/10"
                        onClick={() => setOpenReactionPickerId((prev) => (prev === m._id ? null : m._id))}
                        aria-label="React to poll"
                      >
                        <SmilePlus className="h-4 w-4" />
                      </button>
                      <div className="relative" data-message-menu>
                        <button
                          type="button"
                          className="rounded-md p-1.5 text-ui-poll-muted transition hover:bg-white/10"
                          onClick={() => toggleMessageMenu(m._id)}
                          aria-label="Poll actions"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                        {openMessageMenuId === m._id && (
                          <div
                            role="menu"
                            className="anim-pop absolute right-0 top-full z-50 mt-1.5 min-w-[170px] overflow-hidden rounded-2xl border border-ui-border bg-ui-panel py-1.5 shadow-xl"
                          >
                            <button
                              type="button"
                              role="menuitem"
                              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-slate-800 hover:bg-ui-menu-hover dark:hover:bg-ui-menu-hover"
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
                              {isPinned ? (
                                <PinOff className="h-4 w-4 shrink-0 opacity-80" />
                              ) : (
                                <Pin className="h-4 w-4 shrink-0 opacity-80" />
                              )}
                              {isPinned ? 'Unpin' : 'Pin'}
                            </button>
                            {mine && (
                              <button
                                type="button"
                                role="menuitem"
                                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-slate-800 hover:bg-ui-menu-hover dark:hover:bg-ui-menu-hover"
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
                </div>
                <div className="px-4 py-3">
                  <p className="text-sm font-semibold leading-snug text-white">{poll.q}</p>
                  <ul className="mt-3 space-y-2.5">
                    {poll.o.map((opt, i) => (
                      <li key={i}>
                        <div className="flex items-center justify-between gap-2 text-[11px] text-ui-poll-muted">
                          <span className="min-w-0 truncate font-medium">{opt}</span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/25">
                          <div
                            className="h-full rounded-full bg-ui-poll-bar"
                            style={{ width: `${Math.max(8, Math.round(100 / poll.o.length) + (i % 3) * 6)}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-[10px] opacity-80 text-ui-poll-muted">Informal poll — counts are illustrative in chat.</p>
                </div>
              </div>
            ) : (
              <div className={cn('relative max-w-full px-3.5 py-2.5 text-sm', bubbleBase)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1" />
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      className={cn('rounded-md p-1.5 transition', mine ? iconBtnMine : iconBtnTheirs)}
                      onClick={() => setOpenReactionPickerId((prev) => (prev === m._id ? null : m._id))}
                      aria-label="React to message"
                      title="React"
                    >
                      <SmilePlus className="h-4 w-4" />
                    </button>
                    <div className="relative" data-message-menu>
                      <button
                        type="button"
                        className={cn('rounded-md p-1.5 transition', mine ? iconBtnMine : iconBtnTheirs)}
                        onClick={() => toggleMessageMenu(m._id)}
                        aria-label="Message actions"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>

                      {openMessageMenuId === m._id && (
                        <div
                          role="menu"
                          className="anim-pop absolute right-0 top-full z-50 mt-1.5 min-w-[170px] overflow-hidden rounded-2xl border border-ui-border bg-ui-panel py-1.5 shadow-xl"
                        >
                          <button
                            type="button"
                            role="menuitem"
                            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-slate-800 transition-colors duration-150 hover:bg-ui-menu-hover dark:hover:bg-ui-menu-hover"
                            onClick={() => {
                              toggleMessageMenu(m._id);
                              setOpenReactionPickerId((prev) => (prev === m._id ? null : m._id));
                            }}
                          >
                            <SmilePlus className="h-4 w-4 shrink-0 opacity-80" />
                            React
                          </button>
                          {mine && menuPollSafe && (
                            <>
                              <button
                                type="button"
                                role="menuitem"
                                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-slate-800 transition-colors duration-150 hover:bg-ui-menu-hover disabled:pointer-events-none disabled:opacity-60 dark:text-slate-100"
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
                            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-slate-800 transition-colors duration-150 hover:bg-ui-menu-hover dark:hover:bg-ui-menu-hover"
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
                            {isPinned ? (
                              <PinOff className="h-4 w-4 shrink-0 opacity-80" />
                            ) : (
                              <Pin className="h-4 w-4 shrink-0 opacity-80" />
                            )}
                            {isPinned ? 'Unpin message' : 'Pin message'}
                          </button>
                          {mine && (
                            <button
                              type="button"
                              role="menuitem"
                              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-slate-800 transition-colors duration-150 hover:bg-ui-menu-hover dark:hover:bg-ui-menu-hover"
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
                        ? 'border-white/25 bg-white/12 text-white hover:bg-white/16'
                        : 'border-ui-bubble-other-border bg-ui-muted text-slate-800 hover:brightness-[1.02] dark:bg-ui-bubble-other dark:text-slate-100'
                    )}
                  >
                    <div className="truncate font-semibold">{m.fileName || 'Download file'}</div>
                    <div
                      className={cn(
                        'mt-0.5 text-xs opacity-80',
                        mine ? 'text-white/80' : 'text-slate-500'
                      )}
                    >
                      Open / download
                    </div>
                  </a>
                ) : null}
                {showPlainText ? (
                  <p
                    className={cn(
                      'mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed',
                      m.isDeleted
                        ? 'italic opacity-80'
                        : mine
                          ? 'text-white'
                          : 'text-slate-800 dark:text-slate-100'
                    )}
                  >
                    {m.content}
                  </p>
                ) : null}
              </div>
            )}

            {!isPollMessage ? (
              <button
                type="button"
                data-reaction-picker
                className={cn(
                  'absolute -bottom-1 flex h-7 w-7 items-center justify-center rounded-full border border-ui-border bg-ui-panel text-base shadow-sm transition',
                  'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100',
                  mine ? '-left-8' : '-right-8'
                )}
                onClick={() => setOpenReactionPickerId((prev) => (prev === m._id ? null : m._id))}
                title="React"
              >
                <SmilePlus className="h-3.5 w-3.5 text-ui-accent" />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {openReactionPickerId === m._id && (
        <div
          data-reaction-picker
          className={cn(
            'mt-1.5 flex gap-1 rounded-full border border-ui-border bg-ui-panel px-2 py-1 shadow-md',
            mine ? 'mr-11 justify-end' : 'ml-11'
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
        <div className={cn('mt-1 flex flex-wrap gap-1', mine ? 'mr-11 justify-end' : 'ml-11')}>
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
                    ? 'border-ui-accent bg-ui-accent-subtle'
                    : 'border-ui-border bg-ui-panel'
                )}
                onClick={() => handleToggleDmReaction(m._id, emoji)}
              >
                <span>{emoji}</span>
                <span className={reacted ? 'text-ui-accent dark:text-ui-accent-text' : 'text-slate-600 dark:text-slate-400'}>
                  {count}
                </span>
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
  // Search icon: filter existing chats list
  const [chatFilterOpen, setChatFilterOpen] = useState(false);
  const [chatFilterQuery, setChatFilterQuery] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Plus button: search users to start a new chat
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [addUserQuery, setAddUserQuery] = useState('');
  const [addUserResults, setAddUserResults] = useState([]);
  const [addUserLoading, setAddUserLoading] = useState(false);
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
  const [pollModalOpen, setPollModalOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOpt1, setPollOpt1] = useState('Option A');
  const [pollOpt2, setPollOpt2] = useState('Option B');
  const [pollOpt3, setPollOpt3] = useState('Option C');
  const [inboxMailbox, setInboxMailbox] = useState('open');
  const [inboxSort, setInboxSort] = useState('newest');
  /** DIRECT | GROUPS | PUBLIC — Chat-style sidebar tabs */
  const [sidebarInboxTab, setSidebarInboxTab] = useState('direct');
  const [detailTab, setDetailTab] = useState('overview');
  const [detailTagsOpen, setDetailTagsOpen] = useState(true);
  /** Messages | Contact — matches reference tab strip */
  const [chatMainTab, setChatMainTab] = useState('messages');
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const typingTimeoutRef = useRef(null);
  const searchWrapRef = useRef(null);
  const searchInputRef = useRef(null);
  const addUserInputRef = useRef(null);
  const mediaInputRef = useRef(null);
  const mediaImageInputRef = useRef(null);
  const composerInputRef = useRef(null);
  const messagesWrapRef = useRef(null);
  const shouldAutoScrollRef = useRef(true);
  const lastDirectMessageCountRef = useRef(0);
  const pendingDirectScrollCountRef = useRef(0);
  const [pendingDirectScrollCount, setPendingDirectScrollCount] = useState(0);

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

  const scrollDirectMessagesToLatest = useCallback(() => {
    const el = messagesWrapRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  const dmUnreadTotal = useMemo(
    () => recentChats.reduce((s, c) => s + Number(c.unreadCount || 0), 0),
    [recentChats]
  );

  const displayedRecentChats = useMemo(() => {
    const wantArchived = inboxMailbox === 'archived';
    let list = recentChats.filter((c) => (wantArchived ? c.archived : !c.archived));
    list = [...list].sort((a, b) => {
      const ta = new Date(a.lastAt || 0).getTime();
      const tb = new Date(b.lastAt || 0).getTime();
      return inboxSort === 'newest' ? tb - ta : ta - tb;
    });
    const q = chatFilterQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((c) => {
        const name = String(c.peerUsername || '').toLowerCase();
        const msg = String(c.lastMessage || '').toLowerCase();
        return name.includes(q) || msg.includes(q);
      });
    }
    return list;
  }, [recentChats, inboxMailbox, inboxSort, chatFilterQuery]);

  const sessionStats = useMemo(() => {
    const n = messages.length;
    if (!n) return { count: 0, durationLabel: '—' };
    const times = messages.map((m) => Number(m.createdAt || 0)).filter(Boolean);
    const min = Math.min(...times);
    const max = Math.max(...times);
    const spanMin = Math.max(0, Math.round((max - min) / 60000));
    const durationLabel =
      spanMin < 1 ? '<1 min' : spanMin < 60 ? `${spanMin} min` : `${Math.round(spanMin / 60)} h`;
    return { count: n, durationLabel };
  }, [messages]);

  const threadShareStats = useMemo(() => {
    let fileLike = 0;
    let linkLike = 0;
    for (const m of messages) {
      if (m.mediaUrl || m.mediaType) fileLike += 1;
      const c = typeof m.content === 'string' ? m.content : '';
      if (/\bhttps?:\/\//i.test(c)) linkLike += 1;
    }
    return { fileLike, linkLike };
  }, [messages]);

  const toggleMessageMenu = useCallback((messageId) => {
    setOpenMessageMenuId((prev) => (prev === messageId ? null : messageId));
  }, []);

  useEffect(() => {
    setChatMainTab('messages');
  }, [activeUserId]);

  // Message row is memoized outside component for stability.

  // FIX: auto-scroll only if user is near bottom (don’t interrupt when scrolling up).
  useEffect(() => {
    const el = messagesWrapRef.current;
    if (!el) return;
    const onScroll = () => {
      const thresholdPx = 140;
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      shouldAutoScrollRef.current = distanceFromBottom < thresholdPx;
      if (shouldAutoScrollRef.current && pendingDirectScrollCountRef.current > 0) {
        pendingDirectScrollCountRef.current = 0;
        setPendingDirectScrollCount(0);
      }
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
    if (!chatFilterOpen) return;
    const t = setTimeout(() => searchInputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [chatFilterOpen]);

  useEffect(() => {
    const onDoc = (e) => {
      if (e.target?.closest?.('[data-sidebar-search]')) return;
      setChatFilterOpen(false);
      setAddUserOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    const q = addUserQuery.trim();
    if (!q) {
      setAddUserResults([]);
      setAddUserLoading(false);
      return;
    }
    let cancelled = false;
    setAddUserLoading(true);
    const t = setTimeout(async () => {
      try {
        const users = await searchUsersByUsername(q, user.id);
        if (!cancelled) setAddUserResults(users);
      } catch {
        if (!cancelled) setAddUserResults([]);
      } finally {
        if (!cancelled) setAddUserLoading(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [user?.id, addUserQuery]);

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
    setAddUserOpen(false);
    setAddUserQuery('');
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
    const currentCount = messages.length;
    const previousCount = lastDirectMessageCountRef.current;

    if (!activeUserId.trim()) {
      lastDirectMessageCountRef.current = currentCount;
      pendingDirectScrollCountRef.current = 0;
      setPendingDirectScrollCount(0);
      return;
    }

    if (shouldAutoScrollRef.current || previousCount === 0) {
      // FIX: Scroll to latest message on send/receive when user is near bottom.
      scrollDirectMessagesToLatest();
      pendingDirectScrollCountRef.current = 0;
      setPendingDirectScrollCount(0);
    } else if (currentCount > previousCount) {
      const nextPending = pendingDirectScrollCountRef.current + (currentCount - previousCount);
      pendingDirectScrollCountRef.current = nextPending;
      setPendingDirectScrollCount(nextPending);
    }

    lastDirectMessageCountRef.current = currentCount;
  }, [messages.length, activeUserId, scrollDirectMessagesToLatest]);

  useEffect(() => {
    lastDirectMessageCountRef.current = 0;
    pendingDirectScrollCountRef.current = 0;
    setPendingDirectScrollCount(0);
    shouldAutoScrollRef.current = true;
  }, [activeUserId]);

  useLayoutEffect(() => {
    const ta = composerInputRef.current;
    if (!ta || input) return;
    ta.style.height = '40px';
  }, [input]);

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

  const sendPollMessage = async () => {
    const q = pollQuestion.trim();
    const opts = [pollOpt1, pollOpt2, pollOpt3].map((s) => String(s || '').trim()).filter(Boolean);
    if (!user?.id || !activeUserId.trim()) {
      setActionError('Choose someone to chat with first.');
      return;
    }
    if (!isUuid(activeUserId.trim())) {
      setActionError('Select a user from search (peerId must be a UUID).');
      return;
    }
    if (!q || opts.length < 2) {
      setActionError('Add a question and at least two options.');
      return;
    }
    const body = `${DM_POLL_PREFIX}${JSON.stringify({ q, o: opts })}`;
    setSendingMessage(true);
    setActionError('');
    try {
      await sendDirectMessage({
        senderId: user.id,
        receiverId: activeUserId.trim(),
        content: body
      });
      setPollModalOpen(false);
      setPollQuestion('');
      setPollOpt1('Option A');
      setPollOpt2('Option B');
      setPollOpt3('Option C');
    } catch {
      setActionError('Could not send poll. Please try again.');
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
    <ChatAppShell
      topBar={<ChatAppTopBar />}
      gridClassName="grid-cols-1 lg:grid-cols-[minmax(300px,360px)_minmax(0,1fr)]"
    >
      <aside className="flex max-h-[42vh] min-h-0 flex-col border-b border-ui-border bg-ui-sidebar lg:max-h-none lg:border-b-0 lg:border-r">
        <div className="shrink-0 border-b border-ui-border">
          <ChatAppIconRail active="dm" dmUnreadCount={dmUnreadTotal} />
        </div>

        <div className="flex items-center justify-between gap-3 px-4 pb-1 pt-3">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Chats</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-ui-border bg-ui-panel text-slate-700 shadow-sm transition hover:bg-ui-muted dark:text-slate-100"
              aria-label="Search"
              title="Search"
              onClick={() => {
                if (chatFilterOpen) {
                  setChatFilterOpen(false);
                  setChatFilterQuery('');
                  return;
                }
                setChatFilterOpen(true);
                setAddUserOpen(false);
                setTimeout(() => searchInputRef.current?.focus(), 50);
              }}
            >
              <Search className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-ui-grad-from to-ui-grad-to text-white shadow-md shadow-violet-900/20 transition hover:brightness-110 dark:shadow-black/30"
              aria-label="New chat"
              title="New chat"
              onClick={() => {
                setAddUserOpen(true);
                setChatFilterOpen(false);
                setTimeout(() => addUserInputRef.current?.focus(), 50);
              }}
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="shrink-0 border-b border-ui-border px-4 pb-3 pt-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={cn(
                'rounded-full px-3 py-1 text-[11px] font-bold transition',
                inboxMailbox === 'open'
                  ? 'bg-ui-accent-subtle text-ui-accent-text'
                  : 'bg-ui-muted text-slate-600 hover:bg-slate-200/80 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              )}
              onClick={() => setInboxMailbox('open')}
            >
              Open
            </button>
            <button
              type="button"
              className={cn(
                'rounded-full px-3 py-1 text-[11px] font-bold transition',
                inboxMailbox === 'archived'
                  ? 'bg-ui-accent-subtle text-ui-accent-text'
                  : 'bg-ui-muted text-slate-600 hover:bg-slate-200/80 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              )}
              onClick={() => setInboxMailbox('archived')}
            >
              Archived
            </button>
          </div>
        </div>

        {chatFilterOpen || chatFilterQuery.trim() || addUserOpen || addUserQuery.trim() ? (
          <div ref={searchWrapRef} data-sidebar-search className="relative shrink-0 border-b border-ui-border px-4 pb-3 pt-2">
            {addUserOpen || addUserQuery.trim() ? (
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  ref={addUserInputRef}
                  className="w-full rounded-2xl border border-ui-border bg-ui-panel py-2.5 pl-10 pr-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-ui-accent focus:ring-4 focus:ring-[var(--ui-focus)] dark:text-slate-100"
                  placeholder="Add user"
                  value={addUserQuery}
                  onChange={(e) => {
                    setAddUserQuery(e.target.value);
                    setAddUserOpen(true);
                  }}
                  onFocus={() => setAddUserOpen(true)}
                />

                {addUserOpen && (addUserQuery.trim().length > 0 || addUserLoading) ? (
                  <div className="anim-pop absolute left-0 right-0 top-full z-[60] mt-2 overflow-hidden rounded-2xl border border-ui-border bg-ui-panel shadow-xl">
                    <div className="max-h-52 overflow-y-auto p-1">
                      {addUserLoading ? (
                        <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Searching…
                        </div>
                      ) : addUserResults.length === 0 ? (
                        <p className="px-3 py-4 text-center text-xs text-slate-500">No users found.</p>
                      ) : (
                        addUserResults.map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-800 hover:bg-ui-menu-hover"
                            onClick={() => pickPeer(u.id, u.username)}
                          >
                            <Image
                              src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(u.username || u.id)}`}
                              alt=""
                              width={36}
                              height={36}
                              unoptimized
                              className="h-9 w-9 rounded-full border border-ui-border object-cover"
                            />
                            <span className="min-w-0 flex-1 truncate">{u.username}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  ref={searchInputRef}
                  className="w-full rounded-2xl border border-ui-border bg-ui-panel py-2.5 pl-10 pr-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-ui-accent focus:ring-4 focus:ring-[var(--ui-focus)] dark:text-slate-100"
                  placeholder="Search chats"
                  value={chatFilterQuery}
                  onChange={(e) => {
                    setChatFilterQuery(e.target.value);
                    setChatFilterOpen(true);
                  }}
                  onFocus={() => setChatFilterOpen(true)}
                />
              </div>
            )}
          </div>
        ) : null}

            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-3 pt-1 sm:px-4">
              {sidebarInboxTab === 'direct' ? (
                <>
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
                  ) : displayedRecentChats.length === 0 ? (
                    <p className="px-2 py-4 text-center text-xs text-slate-500">
                      {inboxMailbox === 'archived' ? 'No archived threads.' : 'No conversations yet. Search above to start.'}
                    </p>
                  ) : (
                    displayedRecentChats.map((chat) => {
                      const selected = activeUserId.trim() === chat.peerId;
                      const unread = Number(chat.unreadCount || 0);
                      return (
                        <div
                          key={chat.threadId}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            if (chat.locked) {
                              setActionError('Chat is locked. Right click to unlock.');
                              return;
                            }
                            pickPeer(chat.peerId, chat.peerUsername);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              if (chat.locked) {
                                setActionError('Chat is locked. Right click to unlock.');
                                return;
                              }
                              pickPeer(chat.peerId, chat.peerUsername);
                            }
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
                            'flex w-full cursor-pointer gap-3 rounded-2xl border border-transparent px-3 py-2.5 text-left transition outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]',
                            selected
                              ? 'bg-ui-chat-active text-ui-chat-active-fg shadow-md'
                              : 'text-slate-800 hover:border-ui-border hover:bg-ui-panel dark:text-slate-100 dark:hover:bg-ui-muted'
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
                              selected ? 'border-white/35' : 'border-ui-border'
                            )}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p
                                className={cn(
                                  'flex min-w-0 items-center gap-1 truncate text-sm font-semibold',
                                  selected ? 'text-ui-chat-active-fg' : 'text-slate-800 dark:text-slate-100'
                                )}
                              >
                                <span className="truncate">{chat.peerUsername}</span>
                                {chat.locked && <Lock className="h-3.5 w-3.5 shrink-0 opacity-80" />}
                                {chat.archived && <Archive className="h-3.5 w-3.5 shrink-0 opacity-80" />}
                              </p>
                              <span
                                className={cn(
                                  'shrink-0 text-[11px] tabular-nums',
                                  selected ? 'text-[var(--ui-chat-active-muted)]' : 'text-slate-400 dark:text-slate-500'
                                )}
                              >
                                {formatListTime(chat.lastAt)}
                              </span>
                            </div>
                            <div className="mt-0.5 flex items-center justify-between gap-2">
                              <p
                                className={cn(
                                  'min-w-0 flex-1 truncate text-xs',
                                  selected ? 'text-[var(--ui-chat-active-muted)]' : 'text-slate-500 dark:text-slate-400'
                                )}
                              >
                                {chat.lastMessage || 'Message'}
                              </p>
                              {unread > 0 ? (
                                <span
                                  className={cn(
                                    'inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-bold',
                                    selected
                                      ? 'bg-white/20 text-white'
                                      : 'bg-gradient-to-r from-ui-grad-from to-ui-grad-to text-white shadow-sm'
                                  )}
                                >
                                  {unread > 99 ? '99+' : unread}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </>
              ) : null}

              {false ? (
                <div />
              ) : null}
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
                className="anim-pop fixed z-[130] min-w-[210px] overflow-hidden rounded-2xl border border-ui-border bg-ui-panel py-1.5 shadow-xl"
                style={{
                  left: Math.min(recentMenu.x, (typeof window !== 'undefined' ? window.innerWidth : recentMenu.x) - 220),
                  top: Math.min(recentMenu.y, (typeof window !== 'undefined' ? window.innerHeight : recentMenu.y) - 220)
                }}
              >
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-slate-800 transition-colors duration-150 hover:bg-ui-menu-hover dark:hover:bg-ui-menu-hover"
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
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-slate-800 transition-colors duration-150 hover:bg-ui-menu-hover dark:hover:bg-ui-menu-hover"
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

          <section className="flex min-h-0 flex-1 flex-col overflow-hidden border-b border-ui-border bg-ui-panel lg:border-b-0">
            <div className="shrink-0 border-b border-ui-border bg-ui-panel px-4 pb-0 pt-3">
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-start gap-3 text-left"
                  onClick={() => setDetailsOpen(true)}
                >
                  {activeUserId.trim() ? (
                    <div className="relative shrink-0">
                      {!peerAvatarFailed ? (
                        <Image
                          src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${peerAvatarSeed}`}
                          alt=""
                          width={44}
                          height={44}
                          unoptimized
                          className="h-11 w-11 rounded-full border border-ui-border bg-ui-muted object-cover"
                          onError={() => setPeerAvatarFailed(true)}
                        />
                      ) : (
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-ui-accent to-ui-accent-hover text-sm font-bold text-ui-on-accent">
                          {peerInitial}
                        </div>
                      )}
                      {peerPresence?.online ? (
                        <span
                          className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-ui-panel bg-emerald-500"
                          title="Online"
                        />
                      ) : null}
                    </div>
                  ) : (
                    <div className="relative shrink-0">
                      {user?.photoURL ? (
                        <Image
                          src={user.photoURL}
                          alt=""
                          width={44}
                          height={44}
                          unoptimized
                          className="h-11 w-11 rounded-full border border-ui-border bg-ui-muted object-cover"
                        />
                      ) : (
                        <Image
                          src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user?.username || user?.email || 'you')}`}
                          alt=""
                          width={44}
                          height={44}
                          unoptimized
                          className="h-11 w-11 rounded-full border border-ui-border bg-ui-muted object-cover"
                        />
                      )}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      {activeUserId.trim()
                        ? peerUsername || peerShort || 'Chat'
                        : user?.username || user?.email || 'You'}
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {activeUserId.trim()
                        ? peerPresenceLoading
                          ? 'Status…'
                          : formatPeerPresence(peerPresence?.online, peerPresence?.lastSeen)
                        : 'Tap to view your profile'}
                    </p>
                  </div>
                </button>
                <div className="flex shrink-0 items-center gap-1.5">
                  {activeUserId.trim() && user?.id ? (
                    <>
                    <Link
                      href={`/call?callee=${encodeURIComponent(activeUserId.trim())}&mode=video&ready=1&share=1`}
                      className="hidden h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-ui-muted hover:text-ui-accent sm:flex dark:text-slate-400"
                      title="Screen share"
                      aria-label="Screen share"
                    >
                      <Monitor className="h-4 w-4" />
                    </Link>
                    <Link
                      href={`/call?callee=${encodeURIComponent(activeUserId.trim())}&mode=audio&ready=1`}
                      className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-ui-muted hover:text-ui-accent dark:text-slate-400"
                      title="Voice call"
                      aria-label="Voice call"
                    >
                      <Phone className="h-4 w-4" />
                    </Link>
                    <Link
                      href={`/call?callee=${encodeURIComponent(activeUserId.trim())}&mode=video&ready=1`}
                      className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-ui-muted hover:text-ui-accent dark:text-slate-400"
                      title="Video call"
                      aria-label="Video call"
                    >
                      <Video className="h-4 w-4" />
                    </Link>
                    <div className="relative" data-chat-header-menu>
                      <button
                        type="button"
                        className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-ui-muted hover:text-ui-accent dark:text-slate-400"
                        aria-expanded={chatHeaderMenuOpen}
                        aria-label="More actions"
                        onClick={() => setChatHeaderMenuOpen((o) => !o)}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                      {chatHeaderMenuOpen ? (
                        <div
                          role="menu"
                          className="anim-pop absolute right-0 top-full z-50 mt-1.5 min-w-[200px] overflow-hidden rounded-2xl border border-ui-border bg-ui-panel py-1 shadow-xl"
                        >
                          <button
                            type="button"
                            role="menuitem"
                            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-slate-800 hover:bg-ui-menu-hover dark:hover:bg-ui-menu-hover"
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
                            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-slate-800 hover:bg-ui-menu-hover disabled:opacity-50 dark:text-slate-100"
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
                            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-slate-800 hover:bg-ui-menu-hover disabled:opacity-50 dark:text-slate-100"
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
              <div className="mt-3 flex w-full max-w-md border-b border-ui-border">
                <button
                  type="button"
                  className={cn(
                    'flex-1 border-b-2 py-2.5 text-center text-xs font-bold transition',
                    chatMainTab === 'messages'
                      ? 'border-ui-accent text-ui-accent'
                      : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                  )}
                  onClick={() => setChatMainTab('messages')}
                >
                  Messages
                </button>
              </div>
            </div>

            {msgSearchOpen && activeUserId.trim() && (
              <div className="shrink-0 border-b border-ui-border bg-ui-sidebar px-4 py-2">
                <input
                  autoFocus
                  className="w-full rounded-xl border border-ui-border bg-ui-panel px-3 py-2 text-sm text-slate-800 outline-none focus:border-ui-accent focus:ring-2 focus:ring-[var(--ui-focus)] dark:text-slate-100"
                  placeholder="Search messages…"
                  value={msgSearch}
                  onChange={(e) => setMsgSearch(e.target.value)}
                />
              </div>
            )}

            {pinnedMessages.length > 0 && activeUserId.trim() && (
              <div className="shrink-0 border-b border-ui-border bg-ui-pinned">
                {pinnedMessages.slice(0, 1).map((pin) => (
                  <div key={pin.messageId} className="flex items-center gap-2 px-4 py-2">
                    <Pin className="h-3.5 w-3.5 shrink-0 text-ui-accent" />
                    <p className="min-w-0 flex-1 truncate text-xs font-medium text-slate-800 dark:text-slate-100">
                      {pin.content || 'Pinned message'}
                    </p>
                    <button
                      type="button"
                      className="shrink-0 text-xs font-medium text-ui-accent hover:underline"
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

            <div className="relative min-h-0 flex-1">
              <div
                ref={messagesWrapRef}
                className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain bg-ui-thread px-3 py-3 sm:px-5 sm:py-4"
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
                <div className="rounded-2xl border border-ui-border bg-ui-panel px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
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
                    const senderLabel = mine ? `${user?.username || 'You'} (Me)` : peerLabel;
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
                          <p className="mb-3 text-center text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            {formatDaySeparator(currTs)}
                          </p>
                        ) : null}
                        <ChatMessageRow
                          m={m}
                          mine={mine}
                          senderLabel={senderLabel}
                          avatarSeed={
                            mine
                              ? user?.username || user?.id || 'you'
                              : peerUsername || peerKey || 'peer'
                          }
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
                  <div className="rounded-3xl border border-dashed border-ui-border bg-ui-panel px-6 py-8">
                    <MessageCircle className="mx-auto h-10 w-10 text-ui-accent" />
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

              {pendingDirectScrollCount > 0 && (
                <button
                  type="button"
                  onClick={scrollDirectMessagesToLatest}
                  className="absolute bottom-4 right-4 z-20 rounded-full border border-ui-border bg-ui-panel px-3 py-2 text-xs font-medium text-slate-700 shadow-lg shadow-black/10 backdrop-blur hover:border-ui-accent hover:text-ui-accent dark:text-slate-100"
                  aria-label={`Jump to latest ${pendingDirectScrollCount} new message${pendingDirectScrollCount > 1 ? 's' : ''}`}
                >
                  {pendingDirectScrollCount} new message{pendingDirectScrollCount > 1 ? 's' : ''}
                </button>
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
              className="shrink-0 border-t border-ui-border bg-ui-composer px-2 py-2 sm:px-3"
              onSubmit={sendMessage}
            >
              <input
                ref={mediaInputRef}
                type="file"
                accept="*/*"
                className="hidden"
                onChange={handleSelectMedia}
              />
              <input
                ref={mediaImageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleSelectMedia}
              />
              {isRecording ? (
                <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 rounded-3xl border border-red-200/80 bg-red-50/95 px-4 py-3 dark:border-red-900/40 dark:bg-red-950/35">
                  <span className="text-sm font-medium text-red-800 dark:text-red-200">Recording…</span>
                  <button
                    type="button"
                    onClick={handleStopRecording}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-500 text-white shadow-md transition hover:bg-red-600"
                    aria-label="Stop recording"
                  >
                    <MicOff className="h-5 w-5" />
                  </button>
                </div>
              ) : (
                <div className="mx-auto flex max-w-4xl items-end gap-1.5">
                  <div className="flex min-h-[48px] min-w-0 flex-1 items-end gap-0.5 rounded-[1.35rem] border border-ui-border bg-ui-composer-pill px-1.5 py-1 shadow-sm">
                    <button
                      type="button"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-200/90 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-700/80"
                      title="Emoji"
                      aria-label="Emoji"
                      disabled={!activeUserId.trim()}
                      onClick={() => composerInputRef.current?.focus()}
                    >
                      <SmilePlus className="h-[22px] w-[22px]" />
                    </button>
                    <textarea
                      ref={composerInputRef}
                      rows={1}
                      className="mb-0.5 min-h-[40px] max-h-32 min-w-0 flex-1 resize-none bg-transparent px-1 py-2.5 text-[15px] leading-5 text-slate-900 outline-none placeholder:text-slate-500 dark:text-slate-100 dark:placeholder:text-slate-500"
                      value={input}
                      onChange={(e) => {
                        handleTypingInput(e);
                        const ta = e.target;
                        ta.style.height = 'auto';
                        ta.style.height = `${Math.min(Math.max(ta.scrollHeight, 40), 128)}px`;
                      }}
                      placeholder={activeUserId.trim() ? 'Type a message here…' : 'Select a chat'}
                      disabled={!activeUserId.trim()}
                    />
                    {input.trim() ? (
                      <button
                        type="submit"
                        disabled={!activeUserId.trim() || sendingMessage}
                        className="mb-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-ui-grad-from to-ui-grad-to text-white shadow-md transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
                        aria-label="Send"
                      >
                        {sendingMessage ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <Send className="h-5 w-5" />
                        )}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="mb-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-200/90 dark:text-slate-300 dark:hover:bg-slate-700/80"
                        aria-label="Voice message"
                        disabled={!activeUserId.trim()}
                        onClick={handleStartRecording}
                      >
                        <Mic className="h-5 w-5" />
                      </button>
                    )}
                    <ComposerOverflowMenu
                      includeGlobalItems={false}
                      composerActions={
                        <>
                          <button
                            type="button"
                            role="menuitem"
                            className={composerMenuItemClass}
                            disabled={!activeUserId.trim()}
                            onClick={() => mediaInputRef.current?.click()}
                          >
                            <Paperclip className="h-4 w-4 shrink-0 opacity-80" />
                            Attach file
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className={composerMenuItemClass}
                            disabled={!activeUserId.trim()}
                            onClick={() => mediaImageInputRef.current?.click()}
                          >
                            <ImageIcon className="h-4 w-4 shrink-0 opacity-80" />
                            Photo
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className={composerMenuItemClass}
                            disabled={!activeUserId.trim()}
                            onClick={() => {
                              composerInputRef.current?.focus();
                              setInput((prev) => `${prev}@`);
                            }}
                          >
                            <AtSign className="h-4 w-4 shrink-0 opacity-80" />
                            Mention
                          </button>
                        </>
                      }
                    />
                  </div>
                </div>
              )}
            </form>

            {pollModalOpen ? (
              <div
                className="fixed inset-0 z-[200] flex items-end justify-center bg-black/45 p-4 backdrop-blur-[2px] sm:items-center"
                role="dialog"
                aria-modal="true"
                aria-labelledby="dm-poll-title"
                onClick={() => setPollModalOpen(false)}
              >
                <div
                  className="w-full max-w-md rounded-2xl border border-ui-border bg-ui-panel p-4 shadow-2xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <h3 id="dm-poll-title" className="text-base font-bold text-slate-900 dark:text-slate-50">
                    Quick poll
                  </h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Sends a webinar-style poll card in this chat (stored as a message).
                  </p>
                  <label className="mt-3 block text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                    Question
                  </label>
                  <input
                    className="input mt-1.5 w-full text-sm"
                    value={pollQuestion}
                    onChange={(e) => setPollQuestion(e.target.value)}
                    placeholder="Which option do you prefer?"
                  />
                  {['A', 'B', 'C'].map((label, i) => (
                    <div key={label} className="mt-2">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                        Option {label}
                      </label>
                      <input
                        className="input mt-1.5 w-full text-sm"
                        value={i === 0 ? pollOpt1 : i === 1 ? pollOpt2 : pollOpt3}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (i === 0) setPollOpt1(v);
                          else if (i === 1) setPollOpt2(v);
                          else setPollOpt3(v);
                        }}
                      />
                    </div>
                  ))}
                  <div className="mt-4 flex justify-end gap-2">
                    <Button type="button" variant="secondary" size="sm" onClick={() => setPollModalOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="bg-ui-accent hover:bg-ui-accent-hover text-ui-on-accent"
                      disabled={sendingMessage || !activeUserId.trim()}
                      onClick={() => sendPollMessage()}
                    >
                      Send poll
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            {actionError && (
              <div className="border-t border-ui-border px-4 py-2 text-xs text-red-600 dark:text-red-400">
                {actionError}
              </div>
            )}
          </section>

          {false && (
          <aside className="hidden min-h-0 w-full max-w-[380px] flex-col overflow-y-auto border-l border-ui-border bg-ui-panel xl:flex">
            <div className="min-h-0 flex-1 space-y-5 p-4">
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Notifications
                </h3>
                <ul className="mt-2 space-y-2">
                  {[
                    { user: 'Ankita', action: 'mentioned you in Design sync' },
                    { user: 'Rahul', action: 'reacted to your message' },
                    { user: 'Neha', action: 'shared a file with the team' },
                  ].map((n) => (
                    <li
                      key={n.user + n.action}
                      className="flex gap-2.5 rounded-2xl border border-ui-border bg-ui-muted/40 px-2.5 py-2 dark:bg-slate-800/40"
                    >
                      <Image
                        src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(n.user)}`}
                        alt=""
                        width={36}
                        height={36}
                        unoptimized
                        className="h-9 w-9 shrink-0 rounded-full border border-ui-border object-cover"
                      />
                      <p className="min-w-0 flex-1 text-[12px] leading-snug text-slate-700 dark:text-slate-200">
                        <span className="font-semibold text-blue-600 dark:text-blue-400">@{n.user}</span>{' '}
                        {n.action}.
                      </p>
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  People you may know
                </h3>
                <ul className="mt-2 space-y-2">
                  {suggestionPeers.length === 0 ? (
                    <li className="rounded-2xl border border-dashed border-ui-border px-3 py-4 text-center text-xs text-slate-500 dark:text-slate-400">
                      More conversations will appear here for quick adds.
                    </li>
                  ) : (
                    suggestionPeers.map((chat) => (
                      <li
                        key={chat.threadId}
                        className="flex items-center gap-2.5 rounded-2xl border border-ui-border bg-ui-panel px-2 py-2"
                      >
                        <Image
                          src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(chat.peerUsername || chat.peerId)}`}
                          alt=""
                          width={40}
                          height={40}
                          unoptimized
                          className="h-10 w-10 shrink-0 rounded-full border border-ui-border object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                            {chat.peerUsername}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">0 mutual connections</p>
                        </div>
                        <button
                          type="button"
                          className="shrink-0 rounded-full bg-gradient-to-r from-ui-grad-from to-ui-grad-to px-3 py-1 text-[11px] font-semibold text-white shadow-sm hover:brightness-110"
                          onClick={() => pickPeer(chat.peerId, chat.peerUsername)}
                        >
                          Add
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </section>

              <div className="border-t border-ui-border pt-4">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  This chat
                </p>
              </div>

              <div className="flex flex-col items-center text-center">
                {activeUserId.trim() ? (
                  <>
                    {!peerAvatarFailed ? (
                      <Image
                        src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${peerAvatarSeed}`}
                        alt=""
                        width={88}
                        height={88}
                        unoptimized
                        className="h-[88px] w-[88px] rounded-full border-4 border-white object-cover shadow-md dark:border-slate-600"
                        onError={() => setPeerAvatarFailed(true)}
                      />
                    ) : (
                      <div className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-gradient-to-br from-ui-accent to-ui-accent-hover text-2xl font-bold text-ui-on-accent">
                        {peerInitial}
                      </div>
                    )}
                    <h3 className="mt-3 text-base font-bold text-slate-900 dark:text-white">
                      {peerUsername || peerShort || 'Chat'}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Direct message</p>
                  </>
                ) : (
                  <p className="py-8 text-sm text-slate-500 dark:text-slate-400">Select a conversation to see details</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-ui-accent p-3 text-ui-on-accent shadow-sm">
                  <FolderOpen className="h-5 w-5 opacity-95" />
                  <p className="mt-2 text-[10px] font-bold uppercase tracking-wide opacity-90">All files</p>
                  <p className="mt-0.5 text-2xl font-bold tabular-nums">{threadShareStats.fileLike}</p>
                </div>
                <div className="rounded-2xl border border-ui-border bg-ui-muted p-3 dark:bg-slate-800/80">
                  <Link2 className="h-5 w-5 text-slate-600 dark:text-slate-300" />
                  <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    All links
                  </p>
                  <p className="mt-0.5 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                    {threadShareStats.linkLike}
                  </p>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-ui-border bg-ui-panel">
                {[
                  { Icon: FileText, label: 'Documents', meta: '—' },
                  {
                    Icon: ImageIcon,
                    label: 'Photos',
                    meta: threadShareStats.fileLike > 0 ? `${threadShareStats.fileLike} in thread` : '—',
                  },
                  { Icon: Film, label: 'Movies', meta: '—' },
                  { Icon: LayoutGrid, label: 'Other', meta: '—' },
                ].map(({ Icon, label, meta }) => (
                  <div
                    key={label}
                    className="flex items-center gap-3 border-b border-ui-border px-3 py-2.5 last:border-b-0"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ui-muted dark:bg-slate-800/80">
                      <Icon className="h-4 w-4 text-ui-accent" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{meta}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Workspace
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: 'overview', label: 'Overview' },
                    { id: 'notes', label: 'Notes' },
                    { id: 'files', label: 'Files' },
                    { id: 'apps', label: 'Apps' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setDetailTab(t.id)}
                      className={cn(
                        'rounded-full px-2.5 py-1 text-[10px] font-bold transition',
                        detailTab === t.id
                          ? 'bg-ui-accent-subtle text-ui-accent-text dark:text-ui-accent-text'
                          : 'bg-ui-muted text-slate-600 hover:bg-slate-200/80 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {detailTab === 'overview' && (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-xl border border-ui-border bg-ui-muted px-2 py-2 text-center">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Msgs
                      </p>
                      <p className="mt-0.5 text-lg font-bold text-slate-900 dark:text-slate-50">{sessionStats.count}</p>
                    </div>
                    <div className="rounded-xl border border-ui-border bg-ui-muted px-2 py-2 text-center">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Duration
                      </p>
                      <p className="mt-0.5 text-lg font-bold text-slate-900 dark:text-slate-50">{sessionStats.durationLabel}</p>
                    </div>
                    <div className="rounded-xl border border-ui-border bg-ui-muted px-2 py-2 text-center">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Tickets
                      </p>
                      <p className="mt-0.5 text-lg font-bold text-slate-900 dark:text-slate-50">0</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-ui-border bg-ui-muted/80 p-3">
                    <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300">Visitor status</p>
                    <div className="mt-2 flex items-center gap-2">
                      <span
                        className={cn(
                          'h-2.5 w-2.5 rounded-full',
                          peerPresence?.online ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                        )}
                      />
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {peerPresence?.online ? 'Online' : 'Offline'}
                      </span>
                    </div>
                    <p className="mt-3 text-[11px] font-bold text-slate-600 dark:text-slate-300">Assignee</p>
                    <div className="mt-2 flex items-center gap-2">
                      <Image
                        src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user?.username || user?.id || 'me')}`}
                        alt=""
                        width={32}
                        height={32}
                        unoptimized
                        className="h-8 w-8 rounded-full border border-ui-border"
                      />
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                        {user?.username || 'You'}
                      </span>
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Visitor information
                    </p>
                    <ul className="space-y-2 rounded-xl border border-ui-border bg-ui-panel p-3">
                      {[
                        { Icon: User, label: 'Name', value: peerUsername || peerShort || '—' },
                        { Icon: Phone, label: 'Phone', value: '—' },
                        { Icon: Mail, label: 'Email', value: '—' },
                        { Icon: User, label: 'Visitor type', value: 'Direct message' },
                        { Icon: User, label: 'Gender', value: '—' },
                        { Icon: MapPin, label: 'Location', value: '—' },
                      ].map((row) => (
                        <li key={row.label} className="flex items-start gap-2 text-sm">
                          <row.Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                          <div className="min-w-0">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{row.label}</p>
                            <p className="truncate font-medium text-slate-800 dark:text-slate-100">{row.value}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-ui-border">
                    <div className="flex h-28 items-center justify-center bg-gradient-to-br from-ui-accent-subtle to-ui-muted dark:from-ui-muted dark:to-ui-panel">
                      <div className="text-center text-xs text-slate-500 dark:text-slate-400">
                        <MapPin className="mx-auto h-6 w-6 opacity-60" />
                        <p className="mt-1 font-medium">Map preview</p>
                      </div>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full justify-center gap-2 rounded-xl border-ui-border bg-ui-panel font-semibold"
                  >
                    <PlusCircle className="h-4 w-4" />
                    Create ticket
                  </Button>

                  <div className="rounded-xl border border-ui-border">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-semibold text-slate-800 dark:text-slate-100"
                      onClick={() => setDetailTagsOpen((o) => !o)}
                    >
                      <span className="flex items-center gap-2">
                        <Tag className="h-4 w-4 text-slate-400" />
                        Tags
                      </span>
                      {detailTagsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    {detailTagsOpen ? (
                      <div className="border-t border-ui-border px-3 py-2">
                        <div className="flex flex-wrap gap-1.5">
                          {['VIP', 'Returning', 'Priority'].map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                        <p className="mt-2 text-[10px] text-slate-400">Illustrative tags — not saved to the server.</p>
                      </div>
                    ) : null}
                  </div>
                </>
              )}

              {detailTab === 'notes' && (
                <div className="rounded-xl border border-dashed border-ui-border bg-ui-muted/50 p-4">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Session notes</p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Private notes for this conversation (stored locally in your workflow — wire to backend when needed).
                  </p>
                  <textarea
                    className="input mt-3 min-h-[120px] w-full resize-y text-sm"
                    placeholder="Add a note…"
                    readOnly
                    disabled
                  />
                </div>
              )}

              {detailTab === 'files' && (
                <div className="rounded-xl border border-ui-border bg-ui-muted/50 p-4">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Shared files</p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Files and images appear in the thread. A dedicated file list API can be added later.
                  </p>
                </div>
              )}

              {detailTab === 'apps' && (
                <div className="rounded-xl border border-ui-border bg-ui-muted/50 p-4">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Connected apps</p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Integrations (CRM, helpdesk) can plug in here.
                  </p>
                </div>
              )}

              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Quick add
                </p>
                <ul className="space-y-2">
                  <li className="rounded-xl border border-dashed border-ui-border px-3 py-4 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    Disabled in this layout.
                  </li>
                </ul>
              </div>
            </div>
          </aside>
          )}

          <RightDrawer
            open={detailsOpen}
            title={activeUserId.trim() ? peerUsername || peerShort || 'Chat details' : 'Your profile'}
            onClose={() => setDetailsOpen(false)}
          >
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-3 text-center">
                <Image
                  src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(
                    activeUserId.trim() ? peerAvatarSeed : user?.username || user?.email || 'you'
                  )}`}
                  alt=""
                  width={80}
                  height={80}
                  unoptimized
                  className="h-20 w-20 rounded-full border border-ui-border bg-ui-muted object-cover"
                />
                <div className="min-w-0">
                  <p className="max-w-full truncate text-lg font-bold text-slate-900 dark:text-slate-50">
                    {activeUserId.trim() ? peerUsername || peerShort || 'Chat' : user?.username || user?.email || 'You'}
                  </p>
                  <p className="mt-0.5 max-w-full truncate text-xs text-slate-500 dark:text-slate-400">
                    {activeUserId.trim()
                      ? formatPeerPresence(peerPresence?.online, peerPresence?.lastSeen)
                      : user?.email || ''}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-ui-border bg-ui-panel p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  User details
                </p>
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-slate-500 dark:text-slate-400">Name</span>
                    <span className="truncate font-medium text-slate-800 dark:text-slate-100">
                      {activeUserId.trim() ? peerUsername || peerShort || '—' : user?.username || '—'}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Shared files
                </p>
                <ul className="space-y-2">
                  {messages
                    .filter((m) => {
                      const t = String(m?.type || 'text').toLowerCase();
                      const c = String(m?.content || '');
                      if (t !== 'text') return true;
                      return c.startsWith('blob:') || c.startsWith('http://') || c.startsWith('https://');
                    })
                    .slice(-12)
                    .reverse()
                    .map((m) => (
                      <li
                        key={m._id || m.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-ui-border bg-ui-panel px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                            {String(m.type || 'file')}
                          </p>
                          <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                            {String(m.content || '—')}
                          </p>
                        </div>
                        {String(m.content || '').startsWith('blob:') || String(m.content || '').startsWith('http') ? (
                          <a
                            href={String(m.content)}
                            target="_blank"
                            rel="noreferrer"
                            className="shrink-0 rounded-full border border-ui-border bg-ui-muted px-3 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-200/80 dark:text-slate-200 dark:hover:bg-slate-700"
                          >
                            Open
                          </a>
                        ) : null}
                      </li>
                    ))}
                  {messages.filter((m) => {
                    const t = String(m?.type || 'text').toLowerCase();
                    const c = String(m?.content || '');
                    if (t !== 'text') return true;
                    return c.startsWith('blob:') || c.startsWith('http://') || c.startsWith('https://');
                  }).length === 0 ? (
                    <li className="rounded-xl border border-dashed border-ui-border px-3 py-4 text-center text-xs text-slate-500 dark:text-slate-400">
                      No shared files yet.
                    </li>
                  ) : null}
                </ul>
              </div>

              <div className="pt-2">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Actions
                </p>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    disabled={!activeUserId.trim()}
                    className="w-full rounded-xl border border-ui-border bg-ui-muted px-3 py-2 text-left text-sm font-semibold text-slate-800 transition hover:bg-slate-200/80 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-100 dark:hover:bg-slate-700"
                    onClick={() => {
                      setActionError(activeUserId.trim() ? 'Block user is a UI-only action in this demo.' : '');
                    }}
                  >
                    Block user
                  </button>
                  <button
                    type="button"
                    disabled={!activeUserId.trim()}
                    className="w-full rounded-xl border border-ui-border bg-ui-muted px-3 py-2 text-left text-sm font-semibold text-slate-800 transition hover:bg-slate-200/80 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-100 dark:hover:bg-slate-700"
                    onClick={() => {
                      setActionError(activeUserId.trim() ? 'Restrict messages is a UI-only action in this demo.' : '');
                    }}
                  >
                    Restrict messages
                  </button>
                  <button
                    type="button"
                    disabled={!activeUserId.trim()}
                    className="w-full rounded-xl border border-ui-border bg-ui-muted px-3 py-2 text-left text-sm font-semibold text-slate-800 transition hover:bg-slate-200/80 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-100 dark:hover:bg-slate-700"
                    onClick={() => {
                      setActionError(activeUserId.trim() ? 'Complaint submitted (demo only).' : '');
                    }}
                  >
                    Complain about user
                  </button>
                </div>
              </div>
            </div>
          </RightDrawer>
    </ChatAppShell>
  );
}
