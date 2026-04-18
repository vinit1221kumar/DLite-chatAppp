'use client';

import Link from 'next/link';
import Image from 'next/image';
import { memo, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useAuth } from '../hooks/useAuth';
import {
  addGroupMemberByUsername,
  deleteGroupMessage,
  ensureGroupMembership,
  leaveGroupMembership,
  listGroupMembers,
  removeGroupMember,
  setGroupPhoto,
  listGroupMessages,
  exportGroupChatHistory,
  importGroupChatHistory,
  listUserGroups,
  markGroupThreadRead,
  sendGroupMessage as sendChatGroupMessage,
  setGroupMemberRole,
  setGroupMuted,
  subscribeGroupMessages,
  toggleGroupReaction,
  setGroupTyping,
  subscribeGroupTyping,
  pinGroupMessage,
  unpinGroupMessage,
  subscribePinnedGroupMessages,
  subscribeRecentDirectChats
} from '../services/chatClient';
import { Download, Upload, BellOff, Camera, Loader2, LogOut, MessageSquare, MoreVertical, Pin, PinOff, Search, Send, SmilePlus, Trash2, UserPlus, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChatAppShell } from '@/components/ChatAppShell';
import { ChatAppIconRail } from '@/components/ChatAppIconRail';
import { ChatAppTopBar } from '@/components/ChatAppTopBar';
import { cn } from '@/lib/utils';

function formatGroupMessageTime(ts) {
  const n = Number(ts || 0);
  if (!n) return '';
  const d = new Date(n);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}

function linkifyGroupMessage(text) {
  if (text == null || text === '') return null;
  const str = String(text);
  const parts = str.split(/(https?:\/\/\S+)/);
  return parts.map((part, i) => {
    if (/^https?:\/\//.test(part)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-ui-link underline decoration-ui-accent/50 underline-offset-2 hover:brightness-110"
        >
          {part}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export default function GroupChatPage() {
  const { user } = useAuth();
  const [groupInput, setGroupInput] = useState('');
  const [groupId, setGroupId] = useState('');
  const [groupList, setGroupList] = useState([]);
  const [groupMembers, setGroupMembers] = useState([]);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [deletingMessageId, setDeletingMessageId] = useState('');
  const [recentlyAddedMemberId, setRecentlyAddedMemberId] = useState('');
  const [memberUsername, setMemberUsername] = useState('');
  const [sending, setSending] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [groupsLoadError, setGroupsLoadError] = useState('');
  const [membersLoadError, setMembersLoadError] = useState('');
  const [messagesLoadError, setMessagesLoadError] = useState('');
  const [panelError, setPanelError] = useState('');
  const [panelSuccess, setPanelSuccess] = useState('');
  const [chatTransferBusy, setChatTransferBusy] = useState(false);
  const importGroupFileRef = useRef(null);
  const [groupsRefreshTick, setGroupsRefreshTick] = useState(0);
  const [membersRefreshTick, setMembersRefreshTick] = useState(0);
  const [messagesRefreshTick, setMessagesRefreshTick] = useState(0);
  const [groupSearchOpen, setGroupSearchOpen] = useState(false);
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const [groupMuted, setGroupMuted] = useState(false);
  const [membersModalOpen, setMembersModalOpen] = useState(false);
  const [kickingMemberId, setKickingMemberId] = useState('');
  const [updatingPhoto, setUpdatingPhoto] = useState(false);
  const [groupPhotoUrl, setGroupPhotoUrl] = useState('');
  const groupSearchWrapRef = useRef(null);
  const groupMenuRef = useRef(null);
  const EMOJI_OPTIONS = ['👍', '❤️', '😂', '😮', '😢', '👏'];
  const [groupMsgSearch, setGroupMsgSearch] = useState('');
  const [groupTypingUsers, setGroupTypingUsers] = useState([]);
  const [groupPinnedMessages, setGroupPinnedMessages] = useState([]);
  const [openGroupReactionPickerId, setOpenGroupReactionPickerId] = useState(null);
  const groupTypingTimeoutRef = useRef(null);
  const groupPhotoInputRef = useRef(null);
  const groupComposerRef = useRef(null);
  const messagesWrapRef = useRef(null);
  const shouldAutoScrollRef = useRef(true);

  const [dmRecentChats, setDmRecentChats] = useState([]);
  const dmUnreadTotal = useMemo(
    () => dmRecentChats.reduce((s, c) => s + Number(c.unreadCount || 0), 0),
    [dmRecentChats]
  );

  const groupMsgSearchLower = useMemo(() => groupMsgSearch.trim().toLowerCase(), [groupMsgSearch]);
  const deferredGroupMsgSearchLower = useDeferredValue(groupMsgSearchLower);
  const filteredMessages = useMemo(() => {
    if (!deferredGroupMsgSearchLower) return messages;
    return messages.filter((m) => (m.message || '').toLowerCase().includes(deferredGroupMsgSearchLower));
  }, [messages, deferredGroupMsgSearchLower]);
  const pinnedSet = useMemo(() => new Set(groupPinnedMessages.map((p) => p.messageId)), [groupPinnedMessages]);

  const isMember = !!user?.id && groupMembers.some((member) => member.id === user.id);
  const myRole = groupMembers.find((m) => m.id === user?.id)?.role || 'member';
  const isGroupAdmin = myRole === 'admin';
  const senderNamesById = groupMembers.reduce((acc, member) => {
    acc[member.id] = member.username || member.id;
    return acc;
  }, {});

  if (user?.id) {
    senderNamesById[user.id] = user.username || senderNamesById[user.id] || user.id;
  }

  const groupMessageVirtualizer = useVirtualizer({
    count: filteredMessages.length,
    getScrollElement: () => messagesWrapRef.current,
    estimateSize: () => 96,
    overscan: 12,
    getItemKey: (index) => filteredMessages[index]?._id ?? `grp-row-${index}`,
  });

  const MessageRow = useMemo(
    () =>
      memo(function GroupMessageRow({
        m,
        mine,
        senderName,
        avatarSeed,
        isPinned,
        readCount,
        memberCount,
      }) {
        const reactionEntries = Object.entries(m.reactions || {});
        const t = formatGroupMessageTime(m.createdAt);
        const bubble = mine ? 'chat-bubble-sent' : 'chat-bubble-received';
        const iconMine = 'text-white/90 hover:bg-white/15';
        const iconTheirs = 'text-slate-600 hover:bg-slate-200/80 dark:text-slate-300 dark:hover:bg-slate-700/50';

        return (
          <div className={cn('group flex w-full flex-col', mine ? 'items-end' : 'items-start')}>
            <div
              className={cn(
                'flex w-full max-w-[min(92%,640px)] gap-2.5',
                mine ? 'flex-row-reverse' : 'flex-row'
              )}
            >
              <Image
                src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(avatarSeed || 'member')}`}
                alt=""
                width={32}
                height={32}
                unoptimized
                className="h-8 w-8 shrink-0 self-end rounded-full border border-ui-border bg-ui-panel object-cover"
              />
              <div className={cn('min-w-0 flex-1', mine ? 'flex flex-col items-end' : '')}>
                <div
                  className={cn(
                    'mb-1 max-w-full text-[11px]',
                    mine ? 'text-right text-white/75' : 'text-left text-slate-500 dark:text-slate-400'
                  )}
                >
                  <span className={cn('font-semibold', mine ? 'text-white/95' : 'text-slate-600 dark:text-slate-300')}>
                    {senderName}
                  </span>
                  {t ? (
                    <span className={mine ? 'text-white/65' : 'text-slate-400 dark:text-slate-500'}> · {t}</span>
                  ) : null}
                  {isPinned ? <Pin className="ml-1 inline h-3 w-3 align-middle opacity-70" /> : null}
                  {mine && memberCount > 1 ? (
                    <span className="ml-2 text-[10px] font-medium text-white/85">
                      {readCount > 0 ? `Read ${readCount}/${memberCount - 1}` : 'Sent'}
                    </span>
                  ) : null}
                </div>

                <div className="relative inline-block max-w-full">
                  <div className={cn('px-3.5 py-2.5 text-sm leading-relaxed', bubble)}>
                    {(mine || isGroupAdmin) && (
                      <div className="mb-1.5 flex items-start justify-end gap-1">
                        <div className="flex shrink-0 items-center gap-0.5">
                          {(mine || isGroupAdmin) && (
                            <button
                              type="button"
                              className={cn('rounded-lg p-1 transition', mine ? iconMine : iconTheirs)}
                              onClick={() => (isPinned ? handleUnpinGroupMessage(m._id) : handlePinGroupMessage(m))}
                              title={isPinned ? 'Unpin' : 'Pin'}
                            >
                              {isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                            </button>
                          )}
                          {mine && (
                            <button
                              type="button"
                              className={cn('rounded-lg p-1 transition', iconMine)}
                              onClick={() => handleDeleteGroupMessage(m._id)}
                              disabled={deletingMessageId === m._id}
                              aria-label="Delete message"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                    <div
                      className={cn(
                        'whitespace-pre-wrap break-words [overflow-wrap:anywhere] pr-1',
                        mine && 'text-white [&_a]:text-white/90 [&_a]:underline'
                      )}
                    >
                      {linkifyGroupMessage(m.message)}
                    </div>
                  </div>

                  <button
                    type="button"
                    data-group-reaction-picker
                    className={cn(
                      'absolute -bottom-0.5 flex h-7 w-7 items-center justify-center rounded-full border border-ui-border bg-ui-panel text-base shadow-md transition',
                      'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100',
                      mine ? '-left-8' : '-right-8'
                    )}
                    onClick={() => setOpenGroupReactionPickerId((prev) => (prev === m._id ? null : m._id))}
                    title="React"
                  >
                    <SmilePlus className="h-3.5 w-3.5 text-ui-accent" />
                  </button>
                </div>
              </div>
            </div>

            {openGroupReactionPickerId === m._id && (
              <div
                data-group-reaction-picker
                className={cn(
                  'mt-1.5 flex gap-1 rounded-full border border-ui-border bg-ui-panel px-2 py-1 shadow-md',
                  mine ? 'mr-10 justify-end' : 'ml-10'
                )}
              >
                {EMOJI_OPTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="rounded-full px-1 py-0.5 text-base transition hover:scale-125"
                    onClick={() => handleToggleGroupReaction(m._id, emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}

            {reactionEntries.length > 0 && (
              <div className={cn('mt-1 flex flex-wrap gap-1', mine ? 'mr-10 justify-end' : 'ml-10')}>
                {reactionEntries.map(([emoji, users]) => {
                  const count = Object.keys(users || {}).length;
                  if (!count) return null;
                  const reacted = !!(users || {})[user?.id];
                  return (
                    <button
                      key={emoji}
                      type="button"
                      className={cn(
                        'flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition',
                        reacted ? 'border-ui-accent bg-ui-accent-subtle' : 'border-ui-border bg-ui-panel'
                      )}
                      onClick={() => handleToggleGroupReaction(m._id, emoji)}
                    >
                      <span>{emoji}</span>
                      <span className={reacted ? 'text-ui-accent dark:text-ui-accent-text' : 'text-slate-700 dark:text-slate-300'}>{count}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.id, isGroupAdmin, deletingMessageId, openGroupReactionPickerId]
  );

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
    let unsubscribe = () => undefined;
    try {
      unsubscribe = subscribeRecentDirectChats(user?.id, (items) => {
        setDmRecentChats(items);
      });
    } catch {
      /* ignore */
    }
    return () => unsubscribe();
  }, [user?.id]);

  const getMemberLabel = useCallback((member) => {
    if (member.id === user?.id) {
      return user?.username || 'You';
    }
    return member.username || member.id;
  }, [user?.id, user?.username]);

  const handleExportGroupChatHistory = async () => {
    if (!user?.id || !groupId.trim()) return;
    setPanelError('');
    setPanelSuccess('');
    setChatTransferBusy(true);
    try {
      const payload = await exportGroupChatHistory({
        groupId: groupId.trim(),
        limit: 150
      });

      const content = JSON.stringify(payload, null, 2);
      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const date = new Date().toISOString().slice(0, 10);
      const a = document.createElement('a');
      a.href = url;
      a.download = `group-${payload.groupId}-export-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);

      setPanelSuccess('Group chat exported.');
    } catch (err) {
      setPanelError(err?.message || 'Group export failed.');
    } finally {
      setChatTransferBusy(false);
    }
  };

  const handleImportGroupChatFile = async (file) => {
    if (!user?.id || !groupId.trim()) return;
    if (!file) return;
    setPanelError('');
    setPanelSuccess('');
    setChatTransferBusy(true);
    try {
      const text = await file.text();
      const payload = JSON.parse(text);

      if (!payload || payload.type !== 'group') {
        setPanelError('Invalid file format. Expected a group chat export JSON.');
        return;
      }

      await importGroupChatHistory({
        groupId: groupId.trim(),
        userId: user.id,
        payload
      });

      setMessagesRefreshTick((v) => v + 1);
      setPanelSuccess('Group chat imported.');
    } catch (err) {
      setPanelError(err?.message || 'Group import failed.');
    } finally {
      setChatTransferBusy(false);
      if (importGroupFileRef.current) importGroupFileRef.current.value = '';
    }
  };

  useEffect(() => {
    if (!groupSearchOpen) return;
    const onDoc = (e) => {
      if (groupSearchWrapRef.current && !groupSearchWrapRef.current.contains(e.target)) setGroupSearchOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [groupSearchOpen]);

  useEffect(() => {
    if (!groupId.trim() || !user?.id) {
      setMessages([]);
      setMessagesLoading(false);
      setMessagesLoadError('');
      return;
    }

    setMessagesLoading(true);
    setMessagesLoadError('');

    let cancelled = false;
    const seen = new Set();
    let unsubscribe = () => undefined;

    (async () => {
      try {
        await ensureGroupMembership({ groupId: groupId.trim(), userId: user.id });
        // FIX: Mark messages as read when opening a group (DB read receipts).
        await markGroupThreadRead({ groupId: groupId.trim(), userId: user.id });
        const history = await listGroupMessages(groupId.trim());
        if (cancelled) return;
        history.forEach((item) => seen.add(item._id));
        setMessages(history);
        setMessagesLoading(false);
        unsubscribe = subscribeGroupMessages(groupId.trim(), (msg, changeType) => {
          if (changeType === 'changed') {
            setMessages((prev) => prev.map((item) => (item._id === msg._id ? { ...item, ...msg } : item)));
            return;
          }
          if (seen.has(msg._id)) return;
          seen.add(msg._id);
          setMessages((prev) => [...prev, msg]);
          // FIX: If group is open, mark received messages as read.
          if (msg.senderId && msg.senderId !== user.id) {
            markGroupThreadRead({ groupId: groupId.trim(), userId: user.id }).catch(() => undefined);
          }
        });
      } catch (err) {
        if (!cancelled) {
          setMessagesLoadError(err?.message || 'Could not load group messages.');
          setMessagesLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [groupId, user?.id, messagesRefreshTick]);

  useLayoutEffect(() => {
    if (!shouldAutoScrollRef.current) return;
    const el = messagesWrapRef.current;
    if (!el) return;
    // FIX: Scroll to latest message on send/receive when user is near bottom.
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  // Group typing subscription
  useEffect(() => {
    if (!groupId.trim() || !user?.id) {
      setGroupTypingUsers([]);
      return;
    }
    const unsub = subscribeGroupTyping(groupId.trim(), user.id, setGroupTypingUsers);
    return unsub;
  }, [groupId, user?.id]);

  // Group pinned messages subscription
  useEffect(() => {
    if (!groupId.trim()) {
      setGroupPinnedMessages([]);
      return;
    }
    const unsub = subscribePinnedGroupMessages(groupId.trim(), setGroupPinnedMessages);
    return unsub;
  }, [groupId]);

  // Close reaction picker on outside click
  useEffect(() => {
    const onDoc = (e) => {
      if (!e.target?.closest?.('[data-group-reaction-picker]')) setOpenGroupReactionPickerId(null);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const loadGroupMembers = useCallback(async (id) => {
    const normalized = String(id || '').trim();
    if (!normalized) {
      setGroupMembers([]);
      setMembersLoadError('');
      return;
    }
    setMembersLoading(true);
    setMembersLoadError('');
    try {
      const items = await listGroupMembers(normalized);
      setGroupMembers(items);
    } catch (err) {
      setMembersLoadError(err?.message || 'Could not load group members.');
    } finally {
      setMembersLoading(false);
    }
  }, []);

  const loadUserGroups = useCallback(async () => {
    if (!user?.id) {
      setGroupList([]);
      setGroupsLoadError('');
      return;
    }
    setGroupsLoading(true);
    setGroupsLoadError('');
    try {
      const items = await listUserGroups(user.id);
      setGroupList(items);
    } catch (err) {
      setGroupsLoadError(err?.message || 'Could not load groups.');
    } finally {
      setGroupsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadUserGroups();
  }, [loadUserGroups, groupsRefreshTick]);

  useEffect(() => {
    loadGroupMembers(groupId);
  }, [groupId, loadGroupMembers, membersRefreshTick]);

  useEffect(() => {
    const selectedGroup = groupList.find((item) => item.id === groupId.trim());
    setGroupPhotoUrl(selectedGroup?.photoUrl || '');
  }, [groupList, groupId]);

  useEffect(() => {
    if (!recentlyAddedMemberId) return;
    const timeout = setTimeout(() => setRecentlyAddedMemberId(''), 2200);
    return () => clearTimeout(timeout);
  }, [recentlyAddedMemberId]);

  useEffect(() => {
    if (!groupMenuOpen) return;
    const onDoc = (e) => {
      if (groupMenuRef.current && !groupMenuRef.current.contains(e.target)) setGroupMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [groupMenuOpen]);

  const openGroup = async () => {
    const normalized = groupInput.trim();
    if (!normalized || !user?.id) return;
    setPanelError('');
    setPanelSuccess('');
    try {
      const group = await ensureGroupMembership({ groupId: normalized, userId: user.id });
      const resolvedId = group?.id || normalized;
      setGroupId(resolvedId);
      setGroupSearchOpen(false);
      await Promise.all([loadUserGroups(), loadGroupMembers(resolvedId)]);
    } catch (err) {
      setPanelError(err?.message || 'Could not open group right now.');
    }
  };

  const handleAddMember = async () => {
    const targetGroupId = groupId.trim() || groupInput.trim();
    if (!targetGroupId || !memberUsername.trim() || !user?.id) return;
    setAddingMember(true);
    setPanelError('');
    setPanelSuccess('');
    try {
      await ensureGroupMembership({ groupId: targetGroupId, userId: user.id });
      const added = await addGroupMemberByUsername({
        groupId: targetGroupId,
        username: memberUsername.trim(),
        addedById: user.id
      });
      setGroupId(targetGroupId);
      setGroupInput(targetGroupId);
      setPanelSuccess(`${added.username} added to group.`);
      setRecentlyAddedMemberId(added.id);
      setMemberUsername('');
      await Promise.all([loadGroupMembers(targetGroupId), loadUserGroups()]);
    } catch (err) {
      setPanelError(err?.message || 'Could not add user to group.');
    } finally {
      setAddingMember(false);
    }
  };

  const handleSendGroupMessage = async (e) => {
    e.preventDefault();
    if (!user?.id || !groupId.trim() || !message.trim()) return;
    setSending(true);
    setPanelError('');
    setPanelSuccess('');
    // Clear typing on send
    setGroupTyping({ groupId: groupId.trim(), userId: user.id, username: user.username || 'User', isTyping: false }).catch(() => undefined);
    if (groupTypingTimeoutRef.current) clearTimeout(groupTypingTimeoutRef.current);
    try {
      await sendChatGroupMessage({
        groupId: groupId.trim(),
        senderId: user.id,
        message: message.trim()
      });
      setMessage('');
      const ta = groupComposerRef.current;
      if (ta) {
        ta.style.height = '40px';
      }
    } catch (err) {
      setPanelError(err?.message || 'Could not send message.');
    } finally {
      setSending(false);
    }
  };

  const handleGroupMessageInput = (e) => {
    const v = e.target.value;
    setMessage(v);
    const ta = e.target;
    if (ta && ta.tagName === 'TEXTAREA') {
      ta.style.height = 'auto';
      ta.style.height = `${Math.min(Math.max(ta.scrollHeight, 40), 128)}px`;
    }
    if (!user?.id || !groupId.trim()) return;
    setGroupTyping({ groupId: groupId.trim(), userId: user.id, username: user.username || 'User', isTyping: true }).catch(() => undefined);
    if (groupTypingTimeoutRef.current) clearTimeout(groupTypingTimeoutRef.current);
    groupTypingTimeoutRef.current = setTimeout(() => {
      setGroupTyping({ groupId: groupId.trim(), userId: user.id, username: user.username || 'User', isTyping: false }).catch(() => undefined);
    }, 3000);
  };

  const handleToggleGroupReaction = async (messageId, emoji) => {
    if (!user?.id || !groupId.trim() || !messageId) return;
    setOpenGroupReactionPickerId(null);
    try {
      await toggleGroupReaction({ groupId: groupId.trim(), userId: user.id, messageId, emoji });
    } catch { /* ignore */ }
  };

  const handlePinGroupMessage = async (msg) => {
    if (!user?.id || !groupId.trim()) return;
    try {
      await pinGroupMessage({ groupId: groupId.trim(), userId: user.id, messageId: msg._id, content: msg.message || '' });
    } catch { setPanelError('Could not pin message.'); }
  };

  const handleUnpinGroupMessage = async (messageId) => {
    if (!groupId.trim()) return;
    try {
      await unpinGroupMessage({ groupId: groupId.trim(), messageId });
    } catch { setPanelError('Could not unpin message.'); }
  };

  const handleDeleteGroupMessage = async (messageId) => {
    if (!groupId.trim() || !user?.id || !messageId) return;
    if (typeof window !== 'undefined' && !window.confirm('Are you sure you want to delete this message?')) return;
    setDeletingMessageId(messageId);
    try {
      await deleteGroupMessage({
        groupId: groupId.trim(),
        userId: user.id,
        messageId
      });
      setMessages((prev) => prev.filter((item) => item._id !== messageId));
    } catch (err) {
      setPanelError(err?.message || 'Could not delete message.');
    } finally {
      setDeletingMessageId('');
    }
  };

  const handleLeaveGroup = async () => {
    if (!groupId.trim() || !user?.id) return;
    if (typeof window !== 'undefined' && !window.confirm('Leave this group?')) return;
    setPanelError('');
    setPanelSuccess('');
    try {
      await leaveGroupMembership({ groupId: groupId.trim(), userId: user.id });
      setPanelSuccess('You left the group.');
      setGroupId('');
      setMessages([]);
      setGroupMembers([]);
      setGroupMenuOpen(false);
      await loadUserGroups();
    } catch (err) {
      setPanelError(err?.message || 'Could not leave group.');
    }
  };

  const handleShowMembers = () => {
    if (!groupId.trim()) return;
    setMembersModalOpen(true);
    setGroupMenuOpen(false);
  };

  const handleKickMember = async (member) => {
    if (!groupId.trim() || !user?.id || !member?.id) return;
    if (member.id === user.id) {
      setPanelError('You cannot kick yourself. Use Leave group.');
      return;
    }
    // FIX: Only ADMIN can remove members (securely enforced in backend too).
    if (!isGroupAdmin) {
      setPanelError('Only admins can remove members.');
      return;
    }
    if (
      typeof window !== 'undefined' &&
      !window.confirm(`Kick ${member.username || member.id} from this group?`)
    )
      return;
    setKickingMemberId(member.id);
    setPanelError('');
    setPanelSuccess('');
    try {
      await removeGroupMember({
        groupId: groupId.trim(),
        actorId: user.id,
        memberId: member.id
      });
      setPanelSuccess(`${member.username || member.id} removed from group.`);
      await Promise.all([loadGroupMembers(groupId.trim()), loadUserGroups()]);
    } catch (err) {
      setPanelError(err?.message || 'Could not kick member.');
    } finally {
      setKickingMemberId('');
    }
  };

  const handleMakeAdmin = async (member) => {
    if (!groupId.trim() || !user?.id || !member?.id) return;
    if (member.id === user.id) return;
    if (!isGroupAdmin) {
      setPanelError('Only admins can assign new admins.');
      return;
    }
    if (member.role === 'admin') return;

    if (typeof window !== 'undefined' && !window.confirm(`Make ${member.username || member.id} an admin?`)) return;

    setPanelError('');
    setPanelSuccess('');
    try {
      await setGroupMemberRole({
        groupId: groupId.trim(),
        actorId: user.id,
        memberId: member.id,
        role: 'admin'
      });
      setPanelSuccess(`${member.username || member.id} is now an admin.`);
      await Promise.all([loadGroupMembers(groupId.trim()), loadUserGroups()]);
    } catch (err) {
      setPanelError(err?.message || 'Could not set admin role.');
    }
  };

  const handleGroupPhotoPick = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !groupId.trim() || !user?.id) return;
    setUpdatingPhoto(true);
    setPanelError('');
    setPanelSuccess('');
    try {
      const nextPhotoUrl = await setGroupPhoto({
        groupId: groupId.trim(),
        actorId: user.id,
        file
      });
      setGroupPhotoUrl(nextPhotoUrl);
      setPanelSuccess('Group photo updated.');
      await loadUserGroups();
    } catch (err) {
      setPanelError(err?.message || 'Could not update group photo.');
    } finally {
      setUpdatingPhoto(false);
    }
  };

  const handleToggleMuteGroup = async () => {
    if (!groupId.trim() || !user?.id) return;
    const next = !groupMuted;
    try {
      await setGroupMuted({ groupId: groupId.trim(), userId: user.id, muted: next });
      setGroupMuted(next);
      setPanelSuccess(next ? 'Group muted.' : 'Group unmuted.');
      setGroupMenuOpen(false);
    } catch (err) {
      setPanelError(err?.message || 'Could not update mute setting.');
    }
  };

  return (
    <>
      <ChatAppShell
        topBar={<ChatAppTopBar />}
        gridClassName="grid-cols-1 lg:grid-cols-[minmax(300px,360px)_minmax(0,1fr)]"
      >
        <aside className="flex max-h-[42vh] min-h-0 flex-col border-b border-ui-border bg-ui-sidebar lg:max-h-none lg:border-b-0 lg:border-r">
          <div className="shrink-0 border-b border-ui-border">
            <ChatAppIconRail active="groups" dmUnreadCount={dmUnreadTotal} />
          </div>

          <div
            ref={groupSearchWrapRef}
            className="relative shrink-0 border-b border-ui-border px-3 pb-3 pt-2"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-100">Your groups</h2>
              <Button
                type="button"
                variant={groupSearchOpen ? 'default' : 'secondary'}
                size="icon"
                className={cn('h-9 w-9 shrink-0 rounded-full shadow-md', groupSearchOpen && 'hover:brightness-110')}
                aria-expanded={groupSearchOpen}
                aria-label="Open or create group"
                onClick={() => setGroupSearchOpen((o) => !o)}
              >
                <Search className="h-5 w-5" />
              </Button>
            </div>

            <div className="mb-3 flex rounded-full border border-ui-border bg-ui-muted p-0.5">
              <Link
                href="/dashboard"
                className="flex-1 rounded-full px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-slate-600 transition hover:text-ui-accent dark:text-slate-400 sm:px-3"
              >
                Personal
              </Link>
              <span className="flex-1 rounded-full bg-gradient-to-r from-ui-grad-from to-ui-grad-to px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-white shadow-sm sm:px-3">
                Group
              </span>
            </div>

            {groupSearchOpen && (
              <div className="anim-pop absolute left-3 right-3 top-full z-[60] mt-2 overflow-hidden rounded-2xl border border-ui-border bg-ui-panel p-3 shadow-xl">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                  Group ID
                </label>
                <input
                  className="input mt-1.5 font-mono text-sm"
                  placeholder="e.g. demo-room"
                  value={groupInput}
                  onChange={(e) => setGroupInput(e.target.value)}
                />
                <Button type="button" size="sm" className="mt-2 w-full" onClick={openGroup} disabled={!groupInput.trim() || !user?.id}>
                  Open / Create group
                </Button>
                <div className="mt-3 space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                    Add user by username
                  </label>
                  <div className="flex gap-2">
                    <input
                      className="input h-9 text-sm"
                      placeholder="e.g. alice"
                      value={memberUsername}
                      onChange={(e) => setMemberUsername(e.target.value)}
                      disabled={!groupId.trim()}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="shrink-0"
                      onClick={handleAddMember}
                      disabled={!(groupId.trim() || groupInput.trim()) || !memberUsername.trim() || addingMember}
                    >
                      <UserPlus className="mr-1 h-4 w-4" />
                      Add
                    </Button>
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-300/85">
                  Open a group first, then add users who already registered.
                </p>
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-2 pb-3 pt-1 sm:px-3">
            {groupId.trim() ? (
              <div className="rounded-xl border border-ui-border bg-ui-muted px-3 py-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                <div>Current group</div>
                <div className="font-mono text-xs opacity-80">{groupId.trim()}</div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">Use the search button to open or create a group.</p>
            )}

            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                My groups
              </p>
              {groupsLoadError && (
                <div className="mb-2 rounded-lg border border-red-400/40 bg-red-500/10 px-2 py-1.5 text-xs text-red-700 dark:text-red-300">
                  <p>{groupsLoadError}</p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="mt-1 h-7 px-2 text-[11px]"
                    onClick={() => setGroupsRefreshTick((value) => value + 1)}
                  >
                    Retry
                  </Button>
                </div>
              )}
              {groupsLoading ? (
                <p className="text-xs text-slate-700/75 dark:text-slate-300/85">Loading groups…</p>
              ) : groupList.length === 0 ? (
                <p className="text-xs text-slate-700/75 dark:text-slate-300/85">No groups yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {groupList.map((group) => (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => {
                        setGroupId(group.id);
                        setGroupInput(group.id);
                      }}
                      className={cn(
                        'w-full rounded-2xl border border-transparent px-2.5 py-2 text-left text-xs font-medium transition',
                        groupId.trim() === group.id
                          ? 'bg-ui-chat-active text-ui-chat-active-fg shadow-md'
                          : 'border-ui-border bg-ui-panel/70 text-slate-800 hover:bg-ui-muted dark:text-slate-100',
                      )}
                    >
                      <div>Group {group.id}</div>
                      <div
                        className={cn(
                          'text-[11px]',
                          groupId.trim() === group.id ? 'text-[var(--ui-chat-active-muted)]' : 'opacity-80',
                        )}
                      >
                        {group.memberCount} members
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Members
              </p>
              {membersLoadError && (
                <div className="mb-2 rounded-lg border border-red-400/40 bg-red-500/10 px-2 py-1.5 text-xs text-red-700 dark:text-red-300">
                  <p>{membersLoadError}</p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="mt-1 h-7 px-2 text-[11px]"
                    onClick={() => setMembersRefreshTick((value) => value + 1)}
                  >
                    Retry
                  </Button>
                </div>
              )}
              {membersLoading ? (
                <p className="text-xs text-slate-700/75 dark:text-slate-300/85">Loading members…</p>
              ) : groupMembers.length === 0 ? (
                <p className="text-xs text-slate-700/75 dark:text-slate-300/85">No members.</p>
              ) : (
                <div className="space-y-1.5">
                  {groupMembers.map((member) => (
                    <div
                      key={member.id}
                      className={cn(
                        'rounded-lg border border-ui-border bg-ui-panel/70 px-2.5 py-1.5 text-xs transition-colors duration-300',
                        recentlyAddedMemberId === member.id &&
                          'border-emerald-300 bg-emerald-50/80 animate-pulse dark:border-emerald-500/40 dark:bg-emerald-900/20'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium text-slate-800 dark:text-slate-100">{getMemberLabel(member)}</div>
                        {recentlyAddedMemberId === member.id && (
                          <span className="rounded-full bg-emerald-600/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                            New
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden border-b border-ui-border bg-ui-panel lg:border-b-0">
          <div className="shrink-0 border-b border-ui-border px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 shrink-0 text-ui-accent" />
                  <h2 className="truncate text-base font-bold text-slate-900 dark:text-slate-50">
                    {groupId.trim() ? groupId.trim() : 'Group chat'}
                  </h2>
                </div>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {messages.length} messages
                  {groupId.trim() ? ` · ${groupMembers.length} members` : ''}
                  {groupMuted ? ' · muted' : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <input
                  ref={importGroupFileRef}
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={(e) => handleImportGroupChatFile(e.target.files?.[0])}
                />
                <div ref={groupMenuRef} className="relative">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => setGroupMenuOpen((o) => !o)}
                    aria-label="Group options"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                  {groupMenuOpen && (
                    <div
                      role="menu"
                      className="anim-pop absolute right-0 top-full z-40 mt-1.5 min-w-[200px] overflow-hidden rounded-xl border border-ui-border bg-ui-panel py-1.5 shadow-xl dark:shadow-black/40"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-slate-900 transition-colors hover:bg-ui-menu-hover dark:text-slate-50"
                        disabled={!groupId.trim() || !user?.id || chatTransferBusy}
                        onClick={() => {
                          setGroupMenuOpen(false);
                          handleExportGroupChatHistory();
                        }}
                      >
                        <Download className="h-4 w-4 shrink-0 opacity-80" />
                        Export chat
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-slate-900 transition-colors hover:bg-ui-menu-hover dark:text-slate-50"
                        disabled={!groupId.trim() || !user?.id || chatTransferBusy}
                        onClick={() => {
                          setGroupMenuOpen(false);
                          importGroupFileRef.current?.click();
                        }}
                      >
                        <Upload className="h-4 w-4 shrink-0 opacity-80" />
                        Import chat
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-slate-900 transition-colors hover:bg-ui-menu-hover dark:text-slate-50"
                        onClick={handleShowMembers}
                      >
                        <Users className="h-4 w-4 shrink-0 opacity-80" />
                        Show members
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-slate-900 transition-colors hover:bg-ui-menu-hover dark:text-slate-50"
                        onClick={handleToggleMuteGroup}
                      >
                        <BellOff className="h-4 w-4 shrink-0 opacity-80" />
                        {groupMuted ? 'Unmute group' : 'Mute group'}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-red-700 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
                        onClick={handleLeaveGroup}
                      >
                        <LogOut className="h-4 w-4 shrink-0" />
                        Leave group
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="w-full rounded-full border border-ui-border bg-ui-composer-pill py-2.5 pl-10 pr-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-ui-accent focus:ring-2 focus:ring-[var(--ui-focus)] dark:text-slate-100 dark:placeholder:text-slate-500"
                placeholder="Search message…"
                value={groupMsgSearch}
                onChange={(e) => setGroupMsgSearch(e.target.value)}
                disabled={!groupId.trim()}
                aria-label="Search messages in this group"
              />
            </div>
          </div>

          {/* Group pinned messages banner */}
          {groupPinnedMessages.length > 0 && groupId.trim() && (
            <div className="shrink-0 border-b border-ui-border bg-ui-pinned">
              {groupPinnedMessages.slice(0, 1).map((pin) => (
                <div key={pin.messageId} className="flex items-center gap-2 px-4 py-2">
                  <Pin className="h-3.5 w-3.5 shrink-0 text-ui-accent" />
                  <p className="min-w-0 flex-1 truncate text-xs font-medium text-slate-800 dark:text-slate-100">
                    {pin.content || 'Pinned message'}
                  </p>
                  {isGroupAdmin && (
                    <button
                      type="button"
                      className="shrink-0 text-xs text-ui-accent hover:underline"
                      onClick={() => handleUnpinGroupMessage(pin.messageId)}
                    >
                      Unpin
                    </button>
                  )}
                </div>
              ))}
              {groupPinnedMessages.length > 1 && (
                <p className="px-4 pb-1 text-[10px] text-slate-500 dark:text-slate-400/70">
                  +{groupPinnedMessages.length - 1} more pinned
                </p>
              )}
            </div>
          )}

          <div
            ref={messagesWrapRef}
            className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain bg-ui-thread px-4 py-4"
          >
            {messagesLoadError && (
              <div className="rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                <p>{messagesLoadError}</p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="mt-2 h-7 px-2 text-[11px]"
                  onClick={() => setMessagesRefreshTick((value) => value + 1)}
                >
                  Retry
                </Button>
              </div>
            )}

            {messagesLoading && (
              <div className="rounded-xl border border-ui-border bg-ui-accent-subtle px-3 py-2 text-xs text-slate-700 dark:text-slate-300">
                Loading messages…
              </div>
            )}

            {filteredMessages.length > 0 && (
              <div
                className="relative w-full"
                style={{ height: `${groupMessageVirtualizer.getTotalSize()}px` }}
              >
                {groupMessageVirtualizer.getVirtualItems().map((virtualRow) => {
                  const m = filteredMessages[virtualRow.index];
                  const mine = m.senderId === user?.id;
                  const senderName =
                    mine ? user?.username || 'You' : senderNamesById[m.senderId] || 'Group member';
                  const isPinned = pinnedSet.has(m._id);
                  const readCount = mine ? Object.keys(m.readBy || {}).filter((uid) => uid !== user?.id).length : 0;
                  const memberCount = groupMembers.length;

                  return (
                    <div
                      key={virtualRow.key}
                      data-index={virtualRow.index}
                      ref={groupMessageVirtualizer.measureElement}
                      className="absolute left-0 top-0 w-full pb-2"
                      style={{ transform: `translateY(${virtualRow.start}px)` }}
                    >
                      <MessageRow
                        m={m}
                        mine={mine}
                        senderName={senderName}
                        avatarSeed={mine ? user?.username || user?.id || 'you' : senderName || m.senderId || 'member'}
                        isPinned={isPinned}
                        readCount={readCount}
                        memberCount={memberCount}
                      />
                    </div>
                  );
                })}
              </div>
            )}
            {messages.length === 0 && (
              <div className="rounded-xl border border-dashed border-ui-border bg-ui-muted px-4 py-6 text-sm text-slate-600 dark:text-slate-300">
                No messages yet. Set a groupId and send a message.
              </div>
            )}
          </div>

          {/* Typing indicator */}
          {groupTypingUsers.length > 0 && (
            <div className="shrink-0 px-4 py-1 text-xs text-slate-500 dark:text-slate-400">
              <span className="animate-pulse">
                {groupTypingUsers.join(', ')} {groupTypingUsers.length === 1 ? 'is' : 'are'} typing…
              </span>
            </div>
          )}

          <form
            className="shrink-0 border-t border-ui-border bg-ui-composer px-2 py-2 sm:px-3"
            onSubmit={handleSendGroupMessage}
          >
            <div className="mx-auto flex max-w-4xl items-end gap-1">
              <div className="flex min-h-[48px] min-w-0 flex-1 items-end gap-0.5 rounded-[1.35rem] border border-ui-border bg-ui-composer-pill px-1 py-1 shadow-sm">
                <button
                  type="button"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-200/90 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-700/80"
                  title="Emoji"
                  aria-label="Emoji"
                  disabled={!groupId.trim() || !isMember}
                  onClick={() => groupComposerRef.current?.focus()}
                >
                  <SmilePlus className="h-[22px] w-[22px]" />
                </button>
                <textarea
                  ref={groupComposerRef}
                  rows={1}
                  className="mb-0.5 min-h-[40px] max-h-32 min-w-0 flex-1 resize-none bg-transparent px-1 py-2.5 text-[15px] leading-5 text-slate-900 outline-none placeholder:text-slate-500 dark:text-slate-100 dark:placeholder:text-slate-500"
                  value={message}
                  onChange={handleGroupMessageInput}
                  placeholder={groupId.trim() ? 'Message' : 'Open a group'}
                  disabled={!groupId.trim() || !isMember}
                />
                <button
                  type="submit"
                  disabled={!groupId || !message.trim() || !isMember || sending}
                  className="mb-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-ui-grad-from to-ui-grad-to text-white shadow-md transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
                  aria-label="Send"
                >
                  {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                </button>
              </div>
            </div>
          </form>
          {(panelError || panelSuccess) && (
            <div className="border-t border-ui-border px-4 py-2 text-xs">
              {panelError && <p className="text-red-700 dark:text-red-300">{panelError}</p>}
              {!panelError && panelSuccess && <p className="text-emerald-700 dark:text-emerald-300">{panelSuccess}</p>}
            </div>
          )}
        </section>
      </ChatAppShell>

      {membersModalOpen && (
        <div className="fixed inset-0 z-[150] bg-black/55 backdrop-blur-sm">
          <div className="mx-auto flex h-full w-full max-w-2xl flex-col bg-ui-panel">
            <div className="flex items-center justify-between border-b border-ui-border px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">Group members</p>
                <p className="text-xs text-slate-600/85 dark:text-slate-300/85">
                  {groupId.trim() || 'No group selected'} • {groupMembers.length} members
                </p>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => setMembersModalOpen(false)}
                aria-label="Close members panel"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
              {membersLoading ? (
                <p className="text-sm text-slate-600 dark:text-slate-300/85">Loading members…</p>
              ) : groupMembers.length === 0 ? (
                <p className="text-sm text-slate-600 dark:text-slate-300/85">No members in this group.</p>
              ) : (
                groupMembers.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-ui-border bg-ui-accent-subtle px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{getMemberLabel(member)}</p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-300/80">{member.id}</p>
                    </div>
                    {isGroupAdmin && member.id !== user?.id && (
                      <div className="flex items-center gap-2">
                        {member.role !== 'admin' && (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="h-8 px-2.5 text-xs"
                            onClick={() => handleMakeAdmin(member)}
                          >
                            Make admin
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-8 px-2.5 text-xs text-red-700 hover:text-red-700 dark:text-red-400"
                          onClick={() => handleKickMember(member)}
                          disabled={kickingMemberId === member.id}
                        >
                          {kickingMemberId === member.id ? 'Kicking…' : 'Kick member'}
                        </Button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-ui-border px-4 py-3">
              <input
                ref={groupPhotoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleGroupPhotoPick}
              />
              <div className="mb-3 flex items-center gap-3 rounded-xl border border-ui-border bg-ui-accent-subtle px-3 py-2.5">
                {groupPhotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={groupPhotoUrl} alt="Group" className="h-12 w-12 rounded-xl object-cover" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-ui-accent-subtle text-ui-accent-text dark:text-slate-200">
                    <Users className="h-5 w-5" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Group photo</p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-300/80">
                    {groupPhotoUrl ? 'Tap to change current photo' : 'No group photo yet'}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-8 shrink-0 px-2.5 text-xs"
                  onClick={() => groupPhotoInputRef.current?.click()}
                  disabled={!groupId.trim() || updatingPhoto}
                >
                  <Camera className="mr-1 h-3.5 w-3.5" />
                  {updatingPhoto ? 'Uploading…' : groupPhotoUrl ? 'Change' : 'Add'}
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setMembersModalOpen(false);
                    setGroupSearchOpen(true);
                  }}
                  disabled={!groupId.trim()}
                >
                  <UserPlus className="mr-1.5 h-4 w-4" />
                  Add new member
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setMembersModalOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
