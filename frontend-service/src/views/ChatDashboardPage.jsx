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
import {
  AtSign,
  BarChart2,
  ChevronDown,
  ChevronUp,
  FileText,
  Globe,
  Loader2,
  Lock,
  Archive,
  Download,
  ImageIcon,
  LayoutGrid,
  Mail,
  MapPin,
  MessageCircle,
  Mic,
  MicOff,
  Monitor,
  Phone,
  Plus,
  PlusCircle,
  Sparkles,
  Tag,
  Type,
  Upload,
  User,
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
import { ComposerOverflowMenu } from '@/components/ComposerOverflowMenu';

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

function formatSessionDivider(ts) {
  if (!ts) return '';
  const d = new Date(Number(ts));
  if (Number.isNaN(d.getTime())) return '';
  return `Session · ${d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`;
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

  const bubbleBase = mine
    ? 'rounded-[1.25rem] rounded-tr-md border border-sky-200/90 bg-sky-100 text-slate-900 shadow-sm dark:border-sky-800/60 dark:bg-sky-950/50 dark:text-sky-50'
    : 'rounded-[1.25rem] rounded-tl-md border border-slate-200/90 bg-slate-100 text-slate-900 shadow-sm dark:border-slate-600 dark:bg-slate-800/90 dark:text-slate-100';

  const iconBtnMine =
    'text-sky-900/70 hover:bg-sky-900/10 dark:text-sky-200/80 dark:hover:bg-white/10';
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
          className="h-9 w-9 shrink-0 self-end rounded-full border border-slate-200/80 bg-slate-50 object-cover dark:border-slate-600 dark:bg-slate-800"
        />
        <div className={cn('min-w-0 flex-1', mine ? 'flex flex-col items-end' : '')}>
          <div
            className={cn(
              'mb-1 max-w-full text-[12px] text-slate-500 dark:text-slate-400',
              mine ? 'pr-0.5 text-right' : 'pl-0.5'
            )}
          >
            <span className="font-medium text-slate-600 dark:text-slate-300">{senderLabel}</span>
            {m.createdAt ? (
              <span className="font-normal text-slate-400 dark:text-slate-500">
                {' '}
                · {formatMessageMetaTime(m.createdAt)}
              </span>
            ) : null}
            {isPinned ? <Pin className="ml-1 inline h-3 w-3 align-middle opacity-70" /> : null}
            {mine ? (
              <span
                className={cn(
                  'ml-2 text-[10px] font-semibold tracking-wide text-sky-800/80 dark:text-sky-200/80'
                )}
              >
                {m.readBy?.[peerKey] ? 'Read' : m.deliveredBy?.[peerKey] ? 'Delivered' : 'Sent'}
              </span>
            ) : null}
          </div>

          <div className="relative inline-block max-w-full">
            {isPollMessage ? (
              <div className="max-w-[min(100%,420px)] overflow-hidden rounded-2xl border border-sky-800/30 bg-sky-800 text-white shadow-md dark:border-sky-700/50 dark:bg-sky-950">
                <div className="border-b border-white/10 px-4 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-sky-100/90">
                      Poll
                    </span>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        className="rounded-md p-1.5 text-sky-100 transition hover:bg-white/10"
                        onClick={() => setOpenReactionPickerId((prev) => (prev === m._id ? null : m._id))}
                        aria-label="React to poll"
                      >
                        <SmilePlus className="h-4 w-4" />
                      </button>
                      <div className="relative" data-message-menu>
                        <button
                          type="button"
                          className="rounded-md p-1.5 text-sky-100 transition hover:bg-white/10"
                          onClick={() => toggleMessageMenu(m._id)}
                          aria-label="Poll actions"
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
                              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-slate-800 hover:bg-violet-50 dark:text-slate-100 dark:hover:bg-slate-800"
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
                                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-slate-800 hover:bg-violet-50 dark:text-slate-100 dark:hover:bg-slate-800"
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
                        <div className="flex items-center justify-between gap-2 text-[11px] text-sky-100/85">
                          <span className="min-w-0 truncate font-medium">{opt}</span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/25">
                          <div
                            className="h-full rounded-full bg-sky-300/90"
                            style={{ width: `${Math.max(8, Math.round(100 / poll.o.length) + (i % 3) * 6)}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-[10px] text-sky-200/70">Informal poll — counts are illustrative in chat.</p>
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
                          {mine && menuPollSafe && (
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
                        ? 'border-sky-800/30 bg-sky-900/10 text-sky-950 hover:bg-sky-900/15 dark:border-sky-400/20 dark:bg-white/5 dark:text-sky-50'
                        : 'border-slate-200/90 bg-slate-50 text-slate-800 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700'
                    )}
                  >
                    <div className="truncate font-semibold">{m.fileName || 'Download file'}</div>
                    <div
                      className={cn(
                        'mt-0.5 text-xs opacity-80',
                        mine ? 'text-sky-900/70 dark:text-sky-100/70' : 'text-slate-500'
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
                          ? 'text-slate-800 dark:text-sky-50'
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
                  'absolute -bottom-1 flex h-7 w-7 items-center justify-center rounded-full border border-slate-200/90 bg-white text-base shadow-sm transition',
                  'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100',
                  'dark:border-slate-600 dark:bg-slate-900',
                  mine ? '-left-8' : '-right-8'
                )}
                onClick={() => setOpenReactionPickerId((prev) => (prev === m._id ? null : m._id))}
                title="React"
              >
                <SmilePlus className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {openReactionPickerId === m._id && (
        <div
          data-reaction-picker
          className={cn(
            'mt-1.5 flex gap-1 rounded-full border border-slate-200/90 bg-white px-2 py-1 shadow-md dark:border-slate-700 dark:bg-slate-900',
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
                    ? 'border-sky-400 bg-sky-50 dark:border-sky-500 dark:bg-sky-950/50'
                    : 'border-slate-200/90 bg-white dark:border-slate-700 dark:bg-slate-900'
                )}
                onClick={() => handleToggleDmReaction(m._id, emoji)}
              >
                <span>{emoji}</span>
                <span className={reacted ? 'text-sky-800 dark:text-sky-300' : 'text-slate-600 dark:text-slate-400'}>
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
  const [pollModalOpen, setPollModalOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOpt1, setPollOpt1] = useState('Option A');
  const [pollOpt2, setPollOpt2] = useState('Option B');
  const [pollOpt3, setPollOpt3] = useState('Option C');
  const [inboxMailbox, setInboxMailbox] = useState('open');
  const [inboxSort, setInboxSort] = useState('newest');
  const [detailTab, setDetailTab] = useState('overview');
  const [composerToolsOpen, setComposerToolsOpen] = useState(true);
  const [detailTagsOpen, setDetailTagsOpen] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const typingTimeoutRef = useRef(null);
  const searchWrapRef = useRef(null);
  const searchInputRef = useRef(null);
  const mediaInputRef = useRef(null);
  const mediaImageInputRef = useRef(null);
  const composerInputRef = useRef(null);
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

  const displayedRecentChats = useMemo(() => {
    const wantArchived = inboxMailbox === 'archived';
    let list = recentChats.filter((c) => (wantArchived ? c.archived : !c.archived));
    list = [...list].sort((a, b) => {
      const ta = new Date(a.lastAt || 0).getTime();
      const tb = new Date(b.lastAt || 0).getTime();
      return inboxSort === 'newest' ? tb - ta : ta - tb;
    });
    return list;
  }, [recentChats, inboxMailbox, inboxSort]);

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
    <ChatAppShell gridClassName="grid-cols-1 lg:grid-cols-[64px_minmax(280px,340px)_1fr] xl:grid-cols-[64px_minmax(280px,340px)_1fr_minmax(300px,380px)]">
      <nav className="hidden min-h-0 lg:flex" aria-label="Primary">
        <ChatAppIconRail variant="vertical" active="dm" dmUnreadCount={dmUnreadTotal} />
      </nav>

      <aside className="flex max-h-[42vh] min-h-0 flex-col border-b border-slate-200/80 bg-[#F7F8FA] dark:border-slate-800 dark:bg-slate-900/90 lg:max-h-none lg:border-b-0 lg:border-r">
        <div className="shrink-0 lg:hidden">
          <ChatAppIconRail active="dm" dmUnreadCount={dmUnreadTotal} />
        </div>

            <div
              ref={searchWrapRef}
              data-sidebar-search
              className="relative shrink-0 border-b border-slate-200/80 px-3 pb-3 pt-2 dark:border-slate-800"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-100">Your Inbox</h2>
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-600 text-white shadow-md shadow-sky-600/25 transition hover:bg-sky-700"
                  aria-label="New chat — search people"
                  onClick={() => {
                    setSearchOpen(true);
                    setTimeout(() => searchInputRef.current?.focus(), 50);
                  }}
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>

              <div className="mb-3 flex flex-wrap items-center gap-2">
                <select
                  value={inboxMailbox}
                  onChange={(e) => setInboxMailbox(e.target.value)}
                  className="rounded-lg border border-slate-200/90 bg-white py-1.5 pl-2 pr-7 text-xs font-semibold text-slate-800 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  aria-label="Mailbox"
                >
                  <option value="open">Open</option>
                  <option value="archived">Archived</option>
                </select>
                <button
                  type="button"
                  onClick={() => setInboxSort((s) => (s === 'newest' ? 'oldest' : 'newest'))}
                  className="rounded-lg border border-slate-200/90 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {inboxSort === 'newest' ? 'Newest' : 'Oldest'}
                </button>
                <button
                  type="button"
                  className="ml-auto text-[11px] font-bold uppercase tracking-wide text-sky-600 transition hover:text-sky-700 dark:text-sky-400"
                  onClick={() => router.push('/groups')}
                >
                  Groups
                </button>
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  ref={searchInputRef}
                  className="w-full rounded-2xl border border-slate-200/90 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-800 outline-none ring-sky-500/20 placeholder:text-slate-400 focus:border-sky-500 focus:ring-4 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  placeholder="Search visitor"
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
              ) : displayedRecentChats.length === 0 ? (
                <p className="px-2 py-4 text-center text-xs text-slate-500">
                  {inboxMailbox === 'archived' ? 'No archived threads.' : 'No conversations yet. Search above to start.'}
                </p>
              ) : (
                displayedRecentChats.map((chat) => {
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
                        'flex w-full gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition',
                        selected
                          ? 'border-sky-200 bg-sky-100 shadow-sm dark:border-sky-800 dark:bg-sky-950/50'
                          : 'text-slate-800 hover:border-slate-200/80 hover:bg-white dark:text-slate-100 dark:hover:border-slate-700 dark:hover:bg-slate-800/80'
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
                          selected ? 'border-sky-300 dark:border-sky-600' : 'border-slate-200/90 dark:border-slate-700'
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className={cn(
                              'flex min-w-0 items-center gap-1 truncate text-sm font-semibold',
                              selected ? 'text-slate-900 dark:text-sky-50' : 'text-slate-800 dark:text-slate-100'
                            )}
                          >
                            <span className="truncate">{chat.peerUsername}</span>
                            {chat.locked && <Lock className="h-3.5 w-3.5 shrink-0 opacity-80" />}
                            {chat.archived && <Archive className="h-3.5 w-3.5 shrink-0 opacity-80" />}
                          </p>
                          <span
                            className={cn(
                              'shrink-0 text-[11px] tabular-nums',
                              selected ? 'text-sky-700 dark:text-sky-300' : 'text-slate-400 dark:text-slate-500'
                            )}
                          >
                            {formatListTime(chat.lastAt)}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center justify-between gap-2">
                          <p
                            className={cn(
                              'min-w-0 flex-1 truncate text-xs',
                              selected ? 'text-slate-600 dark:text-slate-300' : 'text-slate-500 dark:text-slate-400'
                            )}
                          >
                            {chat.lastMessage || 'Message'}
                          </p>
                          {!selected && unread > 0 ? (
                            <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
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
            <div className="flex shrink-0 items-center gap-3 border-b border-slate-200/80 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
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
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-sky-700 text-lg font-bold text-white shadow-md shadow-sky-500/25">
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
                      <p className="truncate text-base font-semibold text-slate-900 dark:text-slate-50">
                        {user?.username && peerUsername ? (
                          <span className="text-[15px]">
                            {user.username} with {peerUsername}
                          </span>
                        ) : peerUsername ? (
                          <span className="text-[15px]">{peerUsername}</span>
                        ) : (
                          <span className="font-mono text-[15px]">{peerShort}</span>
                        )}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <Globe className="h-3.5 w-3.5 shrink-0 opacity-70" />
                        <span>via Web</span>
                        <span className="text-slate-300 dark:text-slate-600">·</span>
                        {peerPresenceLoading ? (
                          <span className="inline-flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Status…
                          </span>
                        ) : (
                          <span>{formatPeerPresence(peerPresence?.online, peerPresence?.lastSeen)}</span>
                        )}
                      </p>
                    </div>
                  </>
                ) : (
                  <p className="text-sm font-semibold text-slate-400">Select a conversation</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {activeUserId.trim() && user?.id ? (
                  <>
                    <button
                      type="button"
                      className="flex h-10 w-10 cursor-not-allowed items-center justify-center rounded-xl text-slate-400 opacity-60 dark:text-slate-500"
                      title="Screen share — use call page"
                      disabled
                    >
                      <Monitor className="h-5 w-5" />
                    </button>
                    <Link
                      href={`/call?callee=${encodeURIComponent(activeUserId.trim())}`}
                      className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-sky-600 dark:text-slate-400 dark:hover:bg-slate-800"
                      title="Voice call"
                      aria-label="Voice call"
                    >
                      <Phone className="h-5 w-5" />
                    </Link>
                    <Link
                      href={`/video-call?callee=${encodeURIComponent(activeUserId.trim())}`}
                      className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-sky-600 dark:text-slate-400 dark:hover:bg-slate-800"
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
              className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain bg-[#eef2f7] px-3 py-3 dark:bg-slate-950/80 sm:px-5 sm:py-4"
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
                            {formatSessionDivider(currTs)}
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
              className="shrink-0 border-t border-slate-200/80 bg-[#f4f6f9] p-3 dark:border-slate-800 dark:bg-slate-900 sm:p-4"
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
              <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-950">
                {composerToolsOpen ? (
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-800">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      {activeUserId.trim() ? (
                        <Image
                          src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${peerAvatarSeed}`}
                          alt=""
                          width={28}
                          height={28}
                          unoptimized
                          className="h-7 w-7 shrink-0 rounded-full border border-slate-200/80 object-cover dark:border-slate-600"
                        />
                      ) : (
                        <div className="h-7 w-7 shrink-0 rounded-full bg-slate-200 dark:bg-slate-700" />
                      )}
                      <span className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
                        Chat with {peerUsername || '…'}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        className="flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-lg text-slate-400 opacity-50 dark:text-slate-500"
                        title="Assistant — coming soon"
                        disabled
                      >
                        <Sparkles className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-sky-700 dark:text-slate-400 dark:hover:bg-slate-800"
                        title="Attach file"
                        disabled={!activeUserId.trim() || isRecording}
                        onClick={() => mediaInputRef.current?.click()}
                      >
                        <FileText className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                        title="Collapse toolbar"
                        onClick={() => setComposerToolsOpen(false)}
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="flex w-full items-center justify-center border-b border-slate-100 py-1.5 text-slate-400 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/80"
                    onClick={() => setComposerToolsOpen(true)}
                    aria-label="Expand composer tools"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                )}
                <textarea
                  ref={composerInputRef}
                  rows={2}
                  className="max-h-40 min-h-[52px] w-full resize-y border-0 bg-transparent px-4 py-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
                  value={input}
                  onChange={handleTypingInput}
                  placeholder={
                    activeUserId.trim() ? 'Type a message…' : 'Choose someone to chat…'
                  }
                  disabled={isRecording}
                />
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-2 py-2 dark:border-slate-800">
                  <div className="flex flex-wrap items-center gap-0.5">
                    <button
                      type="button"
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-sky-700 dark:text-slate-400 dark:hover:bg-slate-800"
                      title="Formatting"
                      aria-label="Focus message field"
                      disabled={!activeUserId.trim() || isRecording}
                      onClick={() => composerInputRef.current?.focus()}
                    >
                      <Type className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-sky-700 dark:text-slate-400 dark:hover:bg-slate-800"
                      title="Emoji"
                      aria-label="Emoji"
                      onClick={() => activeUserId.trim() && composerInputRef.current?.focus()}
                    >
                      <SmilePlus className="h-4 w-4" />
                    </button>
                    {isRecording ? (
                      <button
                        type="button"
                        className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500 text-white"
                        onClick={handleStopRecording}
                        aria-label="Stop recording"
                      >
                        <MicOff className="h-4 w-4" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-sky-700 dark:text-slate-400 dark:hover:bg-slate-800"
                        aria-label="Voice note"
                        onClick={handleStartRecording}
                      >
                        <Mic className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-sky-700 dark:text-slate-400 dark:hover:bg-slate-800"
                      aria-label="Attach file"
                      disabled={!activeUserId.trim() || isRecording}
                      onClick={() => mediaInputRef.current?.click()}
                    >
                      <Paperclip className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-sky-700 dark:text-slate-400 dark:hover:bg-slate-800"
                      title="Insert @"
                      aria-label="Insert at mention"
                      disabled={!activeUserId.trim() || isRecording}
                      onClick={() => {
                        composerInputRef.current?.focus();
                        setInput((prev) => `${prev}@`);
                      }}
                    >
                      <AtSign className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-sky-700 dark:text-slate-400 dark:hover:bg-slate-800"
                      aria-label="Attach image"
                      disabled={!activeUserId.trim() || isRecording}
                      onClick={() => mediaImageInputRef.current?.click()}
                    >
                      <ImageIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-sky-700 dark:text-slate-400 dark:hover:bg-slate-800"
                      title="Poll"
                      aria-label="Send a poll"
                      disabled={!activeUserId.trim() || isRecording || sendingMessage}
                      onClick={() => setPollModalOpen(true)}
                    >
                      <BarChart2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-0.5 rounded-xl bg-[#2563eb] py-1 pl-3 pr-1 text-white shadow-md shadow-blue-600/25">
                    <button
                      type="submit"
                      disabled={!activeUserId.trim() || !input.trim() || sendingMessage || isRecording}
                      className="flex items-center gap-2 py-2 pr-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {sendingMessage ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          Send
                          <Send className="h-4 w-4" />
                        </>
                      )}
                    </button>
                    <span className="h-6 w-px shrink-0 bg-white/35" aria-hidden />
                    <ComposerOverflowMenu />
                  </div>
                </div>
              </div>
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
                  className="w-full max-w-md rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
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
                      className="bg-sky-600 hover:bg-sky-700"
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
              <div className="border-t border-slate-200/80 px-4 py-2 text-xs text-red-600 dark:border-slate-800 dark:text-red-400">
                {actionError}
              </div>
            )}
          </section>

          <aside className="hidden min-h-0 w-full max-w-[400px] flex-col overflow-y-auto border-l border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 xl:flex">
            <div className="sticky top-0 z-10 flex items-center gap-1 border-b border-slate-200/80 bg-white/95 px-2 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
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
                    'rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition',
                    detailTab === t.id
                      ? 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200'
                      : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                  )}
                >
                  {t.label}
                </button>
              ))}
              <span className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 dark:text-slate-500">
                <LayoutGrid className="h-4 w-4" />
              </span>
            </div>

            <div className="min-h-0 flex-1 space-y-4 p-4">
              {detailTab === 'overview' && (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-xl border border-slate-200/80 bg-slate-50 px-2 py-2 text-center dark:border-slate-700 dark:bg-slate-800/50">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Msgs
                      </p>
                      <p className="mt-0.5 text-lg font-bold text-slate-900 dark:text-slate-50">{sessionStats.count}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200/80 bg-slate-50 px-2 py-2 text-center dark:border-slate-700 dark:bg-slate-800/50">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Duration
                      </p>
                      <p className="mt-0.5 text-lg font-bold text-slate-900 dark:text-slate-50">{sessionStats.durationLabel}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200/80 bg-slate-50 px-2 py-2 text-center dark:border-slate-700 dark:bg-slate-800/50">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Tickets
                      </p>
                      <p className="mt-0.5 text-lg font-bold text-slate-900 dark:text-slate-50">0</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-800/40">
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
                        className="h-8 w-8 rounded-full border border-slate-200/80 dark:border-slate-600"
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
                    <ul className="space-y-2 rounded-xl border border-slate-200/80 bg-white p-3 dark:border-slate-700 dark:bg-slate-950/50">
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

                  <div className="overflow-hidden rounded-xl border border-slate-200/80 dark:border-slate-700">
                    <div className="flex h-28 items-center justify-center bg-gradient-to-br from-sky-100/80 to-slate-200/80 dark:from-slate-800 dark:to-slate-900">
                      <div className="text-center text-xs text-slate-500 dark:text-slate-400">
                        <MapPin className="mx-auto h-6 w-6 opacity-60" />
                        <p className="mt-1 font-medium">Map preview</p>
                      </div>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full justify-center gap-2 rounded-xl border-slate-200/90 bg-white font-semibold dark:border-slate-700 dark:bg-slate-800"
                  >
                    <PlusCircle className="h-4 w-4" />
                    Create ticket
                  </Button>

                  <div className="rounded-xl border border-slate-200/80 dark:border-slate-700">
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
                      <div className="border-t border-slate-100 px-3 py-2 dark:border-slate-800">
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
                <div className="rounded-xl border border-dashed border-slate-200/90 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-800/30">
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
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-800/30">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Shared files</p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Files and images appear in the thread. A dedicated file list API can be added later.
                  </p>
                </div>
              )}

              {detailTab === 'apps' && (
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-800/30">
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
                  {searchResults.length > 0 ? (
                    searchResults.slice(0, 4).map((u) => (
                      <li
                        key={u.id}
                        className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-slate-50/80 p-2 dark:border-slate-700 dark:bg-slate-950/50"
                      >
                        <Image
                          src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(u.username || u.id)}`}
                          alt=""
                          width={36}
                          height={36}
                          unoptimized
                          className="h-9 w-9 rounded-full border border-slate-200/80 object-cover dark:border-slate-700"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{u.username}</p>
                        </div>
                        <button
                          type="button"
                          className="shrink-0 rounded-full bg-sky-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-sky-700"
                          onClick={() => pickPeer(u.id, u.username)}
                        >
                          Chat
                        </button>
                      </li>
                    ))
                  ) : (
                    <li className="rounded-xl border border-dashed border-slate-200/90 px-3 py-4 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      Search the inbox to find people to add here.
                    </li>
                  )}
                </ul>
              </div>
            </div>
          </aside>
    </ChatAppShell>
  );
}
