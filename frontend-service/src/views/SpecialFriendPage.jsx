'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, MessageCircle, Mic, MicOff, Send, Sparkles, Volume2 } from 'lucide-react';
import { useReducedMotion } from 'framer-motion';
import { ChatAppShell } from '@/components/ChatAppShell';
import { ChatAppTopBar } from '@/components/ChatAppTopBar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function SpecialFriendPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedMode = String(searchParams?.get('mode') || 'chat').toLowerCase() === 'chat' ? 'chat' : 'voice';
  const isChatMode = selectedMode === 'chat';

  const prefersReducedMotion = useReducedMotion();
  const [listening, setListening] = useState(false);
  const [level, setLevel] = useState(0.08);
  const [status, setStatus] = useState('Idle');
  const [error, setError] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    {
      id: 'sf-welcome',
      role: 'assistant',
      text: 'Heyy ✨ I am your Special Friend. Tell me how your day is going?',
    },
  ]);
  const chatListRef = useRef(null);
  const aiBackendBaseUrl = (process.env.NEXT_PUBLIC_AI_BACKEND_URL || 'https://dlite-ai.onrender.com').replace(/\/+$/g, '');

  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const rafRef = useRef(0);
  const tickRef = useRef(0);
  const lastFrameRef = useRef(0);
  const voiceAutoStartAttemptedRef = useRef(false);

  const stopListening = useCallback(() => {
    setListening(false);
    setStatus('Idle');
    setLevel(0.08);

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
      } catch {
        // ignore disconnect errors
      }
      sourceRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }

    analyserRef.current = null;
    lastFrameRef.current = 0;
  }, []);

  const goToDashboard = useCallback(() => {
    stopListening();
    router.push('/dashboard');
  }, [router, stopListening]);

  useEffect(() => () => stopListening(), [stopListening]);

  const startListening = useCallback(async () => {
    if (listening) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Microphone access is not available in this browser.');
      return;
    }

    setError('');
    setStatus('Requesting microphone…');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextCtor) {
        throw new Error('Web Audio API is not available in this browser.');
      }

      const audioContext = new AudioContextCtor();
      audioContextRef.current = audioContext;

      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.86;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      sourceRef.current = source;

      const data = new Uint8Array(analyser.fftSize);
      setListening(true);
      setStatus('Listening');

      const tick = (time) => {
        const activeAnalyser = analyserRef.current;
        if (!activeAnalyser) return;

        const minFrameGap = prefersReducedMotion ? 96 : 32;
        if (time - lastFrameRef.current < minFrameGap) {
          rafRef.current = window.requestAnimationFrame(tick);
          return;
        }

        lastFrameRef.current = time;
        activeAnalyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) {
          const value = (data[i] - 128) / 128;
          sum += value * value;
        }
        const rms = Math.sqrt(sum / data.length);
        const nextLevel = prefersReducedMotion
          ? 0.12
          : Math.min(1, Math.max(0.08, rms * 3.4));
        setLevel(nextLevel);
        tickRef.current += 1;
        rafRef.current = window.requestAnimationFrame(tick);
      };

      tick();
    } catch (e) {
      stopListening();
      setStatus('Ready');
      setError(e?.message || 'Could not access the microphone.');
    }
  }, [listening, prefersReducedMotion, stopListening]);

  const speaking = listening && level > 0.14;
  const jitter = prefersReducedMotion || !speaking ? 0 : Math.sin(tickRef.current / 2.3) * level * 5;
  const orbScale = 1 + level * 0.16;
  const ringScale = 1 + level * 0.28;
  const auraOpacity = 0.2 + level * 0.45;

  const voiceLabel = useMemo(() => {
    if (!listening) return 'Special Friend is ready.';
    if (speaking) return 'Listening and reacting to your voice…';
    return 'Listening for your voice…';
  }, [listening, speaking]);

  const buildSpecialFriendReply = useCallback((text) => {
    const clean = String(text || '').trim();
    if (!clean) return 'I am listening 👀';
    const lower = clean.toLowerCase();
    if (/(hi|hello|hey|yo)\b/.test(lower)) return 'Hii bestie 💫 what vibe are we on today?';
    if (/(sad|bad|tired|upset|stressed)\b/.test(lower)) return 'Aww, come here 🫶 I am with you. Want to talk it out?';
    if (/(thanks|thank you|thx)\b/.test(lower)) return 'Anytimeee 😄';
    if (/(joke|funny)\b/.test(lower)) return 'Tiny joke: why was the chat calm? good vibes firewall 😌';
    return `Got you ✨ ${clean.slice(0, 140)}`;
  }, []);

  const handleSendChat = useCallback(
    async (event) => {
      event.preventDefault();
      const content = chatInput.trim();
      if (!content || chatSending) return;

      const userMessage = { id: `u-${Date.now()}`, role: 'user', text: content };
      setChatMessages((prev) => [...prev, userMessage]);
      setChatInput('');
      setChatSending(true);

      const payloadMessages = [...chatMessages, userMessage].map(({ role, text }) => ({
        role,
        content: text,
      }));

      try {
        const response = await fetch(`${aiBackendBaseUrl}/api/v1/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ messages: payloadMessages }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        const replyText = String(data?.reply || '').trim() || buildSpecialFriendReply(content);
        setChatMessages((prev) => [...prev, { id: `a-${Date.now()}`, role: 'assistant', text: replyText }]);
      } catch (err) {
        const fallbackText = buildSpecialFriendReply(content);
        setChatMessages((prev) => [...prev, { id: `a-${Date.now()}`, role: 'assistant', text: fallbackText }]);
      } finally {
        setChatSending(false);
      }
    },
    [aiBackendBaseUrl, buildSpecialFriendReply, chatInput, chatMessages, chatSending]
  );

  useEffect(() => {
    if (!isChatMode) return;
    const el = chatListRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [chatMessages, isChatMode]);

  useEffect(() => {
    stopListening();
  }, [isChatMode, stopListening]);

  if (isChatMode) {
    return (
      <ChatAppShell topBar={<ChatAppTopBar />} gridClassName="grid-cols-1" className="app-shell">
        <section className="relative flex min-h-0 flex-1 overflow-hidden bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.12),rgba(15,23,42,0.96)_58%)]">
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.15),rgba(15,23,42,0.78))]" />
          <div className="relative z-10 mx-auto flex w-full max-w-5xl min-h-0 flex-1 flex-col px-4 py-6 sm:px-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-white/[0.06] px-3 py-1 text-[11px] font-semibold tracking-wide text-cyan-100">
                  <Sparkles className="h-3.5 w-3.5" />
                  Special Friend chat
                </p>
                <h1 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">Special Friend</h1>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Button
                    type="button"
                    disabled
                    className="gap-2 rounded-full bg-gradient-to-r from-cyan-500/60 to-indigo-600/60 text-white/80 opacity-80"
                  >
                    <Mic className="h-4 w-4" />
                    Voice mode
                  </Button>
                  <span className="absolute -right-2 -top-2 inline-flex rounded-full bg-cyan-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow-lg">
                    Coming soon
                  </span>
                </div>
                <Button asChild variant="secondary" className="gap-2 rounded-full border-ui-border bg-white/[0.06] text-white hover:bg-white/[0.12]">
                  <button type="button" className="no-underline" onClick={goToDashboard}>
                    <ArrowLeft className="h-4 w-4" />
                    Back to dashboard
                  </button>
                </Button>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-white/15 bg-slate-900/55 shadow-[0_25px_70px_-30px_rgba(15,23,42,0.65)] backdrop-blur">
              <div ref={chatListRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
                {chatMessages.map((item) => {
                  const mine = item.role === 'user';
                  return (
                    <div key={item.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                      <div
                        className={cn(
                          'max-w-[86%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                          mine
                            ? 'bg-gradient-to-r from-violet-500 via-fuchsia-500 to-indigo-600 text-white'
                            : 'border border-white/15 bg-white/[0.06] text-slate-100'
                        )}
                      >
                        <p className="whitespace-pre-wrap break-words">{item.text}</p>
                      </div>
                    </div>
                  );
                })}
                {chatSending ? (
                  <div className="flex justify-start">
                    <div className="rounded-2xl border border-white/15 bg-white/[0.06] px-3.5 py-2.5 text-sm text-slate-200">
                      Special Friend is typing…
                    </div>
                  </div>
                ) : null}
              </div>

              <form onSubmit={handleSendChat} className="border-t border-white/10 bg-slate-900/40 p-3 sm:p-4">
                <div className="flex items-end gap-2">
                  <div className="relative flex min-h-[44px] min-w-0 flex-1 items-center rounded-full border border-white/15 bg-white/[0.06] px-3">
                    <MessageCircle className="mr-2 h-4 w-4 shrink-0 text-slate-300" />
                    <textarea
                      rows={1}
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Message Special Friend..."
                      className="min-h-[38px] max-h-32 min-w-0 flex-1 resize-none bg-transparent py-2 text-sm text-white outline-none placeholder:text-slate-400"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={!chatInput.trim() || chatSending}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-cyan-500 to-indigo-600 text-white shadow-lg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55"
                    aria-label="Send message"
                  >
                    <Send className="h-4.5 w-4.5" />
                  </button>
                </div>
              </form>
            </div>
          </div>
        </section>
      </ChatAppShell>
    );
  }

  return (
    <ChatAppShell topBar={<ChatAppTopBar />} gridClassName="grid-cols-1" className="app-shell">
      <section className="relative flex min-h-0 flex-1 overflow-hidden bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.18),rgba(15,23,42,0.98)_58%)]">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.2),rgba(15,23,42,0.78))]" />
        <div className="absolute inset-0 opacity-40">
          <div className="absolute left-1/2 top-1/2 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/20 blur-3xl" />
          <div className="absolute left-[18%] top-[20%] h-48 w-48 rounded-full bg-violet-400/15 blur-3xl" />
          <div className="absolute bottom-[10%] right-[15%] h-56 w-56 rounded-full bg-sky-400/15 blur-3xl" />
        </div>

        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-8 text-center sm:px-6">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-white/[0.06] px-4 py-2 text-xs font-semibold tracking-wide text-cyan-100 backdrop-blur">
            <Sparkles className="h-4 w-4" />
            Special Friend voice
          </div>

          <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-5xl">
            Voice Mode Coming Soon
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-slate-300 sm:text-base">
            We are polishing the voice experience for Special Friend. For now, please continue in chat mode.
          </p>

          <div className="relative my-10 flex items-center justify-center">
            <div
              className="absolute h-[28rem] w-[28rem] rounded-full bg-cyan-400/10 blur-3xl transition-transform duration-100 will-change-transform"
              style={{ transform: `translate3d(${jitter}px, ${-jitter}px, 0) scale(${1 + level * 0.08})`, opacity: auraOpacity }}
            />
            <div
              className="absolute h-72 w-72 rounded-full border border-cyan-200/20 transition-transform duration-100 will-change-transform"
              style={{ transform: `translate3d(${jitter * 0.5}px, ${jitter * 0.5}px, 0) scale(${ringScale})` }}
            />
            <div
              className="absolute h-60 w-60 rounded-full border border-cyan-300/35 bg-cyan-500/10 shadow-[0_0_70px_rgba(34,211,238,0.3)] backdrop-blur-sm transition-transform duration-100 will-change-transform"
              style={{ transform: `translate3d(${-jitter}px, ${jitter}px, 0) scale(${1 + level * 0.1})` }}
            />
            <div
              className="relative flex h-44 w-44 items-center justify-center rounded-full bg-gradient-to-br from-cyan-300 via-sky-500 to-indigo-600 shadow-[0_0_80px_rgba(34,211,238,0.5)] transition-transform duration-100 will-change-transform"
              style={{ transform: `translate3d(${jitter}px, ${jitter * 0.6}px, 0) scale(${orbScale})` }}
            >
              <span className="absolute inset-3 rounded-full border border-white/20 bg-white/[0.06]" />
              <span className="absolute inset-10 rounded-full bg-white/55 blur-lg" />
              <Volume2 className={cn('relative z-10 h-12 w-12 text-white transition-all duration-100', speaking ? 'animate-pulse' : 'opacity-85')} />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button
              type="button"
              disabled
              className="gap-2 rounded-full bg-gradient-to-r from-cyan-500/60 to-indigo-600/60 px-5 py-3 font-semibold text-white/80 opacity-80"
            >
              <MicOff className="h-4 w-4" />
              Voice coming soon
            </Button>
            <Button asChild className="gap-2 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-600 px-5 py-3 text-white hover:brightness-110">
              <button type="button" className="no-underline" onClick={() => router.push('/special-friend?mode=chat')}>
                <MessageCircle className="h-4 w-4" />
                Go to chat mode
              </button>
            </Button>
            <Button asChild variant="secondary" className="gap-2 rounded-full border-ui-border bg-white/[0.06] px-5 py-3 text-white hover:bg-white/[0.12]">
              <button type="button" className="no-underline" onClick={goToDashboard}>
                <ArrowLeft className="h-4 w-4" />
                Back to dashboard
              </button>
            </Button>
          </div>

          <p className="mt-5 text-sm font-medium text-cyan-100/90">Voice support is coming in a future update.</p>
        </div>
      </section>
    </ChatAppShell>
  );
}
