'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Mic, MicOff, Sparkles, Volume2 } from 'lucide-react';
import { useReducedMotion } from 'framer-motion';
import { ChatAppShell } from '@/components/ChatAppShell';
import { ChatAppTopBar } from '@/components/ChatAppTopBar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function useVoiceMeter() {
  const prefersReducedMotion = useReducedMotion();
  const [listening, setListening] = useState(false);
  const [level, setLevel] = useState(0.08);
  const [status, setStatus] = useState('Idle');
  const [error, setError] = useState('');

  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const rafRef = useRef(0);
  const tickRef = useRef(0);
  const lastFrameRef = useRef(0);

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
            Independent Special Friend experience
          </div>

          <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-5xl">
            Special Friend
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-slate-300 sm:text-base">
            A separate AI space with a glowing talking circle, animated voice reaction, and no connection to the chat system.
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
              onClick={listening ? stopListening : startListening}
              aria-pressed={listening}
              className={cn(
                'gap-2 rounded-full px-5 py-3 font-semibold text-white shadow-lg transition-transform duration-150 will-change-transform',
                listening
                  ? 'bg-gradient-to-r from-red-500 to-rose-600 hover:brightness-110'
                  : 'bg-gradient-to-r from-cyan-500 to-indigo-600 hover:brightness-110'
              )}
            >
              {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              {listening ? 'Stop voice' : 'Start voice'}
            </Button>
            <Button asChild variant="secondary" className="gap-2 rounded-full border-ui-border bg-white/[0.06] px-5 py-3 text-white hover:bg-white/[0.12]">
              <Link href="/dashboard" className="no-underline">
                <ArrowLeft className="h-4 w-4" />
                Back to dashboard
              </Link>
            </Button>
          </div>

          <p className="mt-5 text-sm font-medium text-cyan-100/90">{voiceLabel}</p>
          <p className="mt-2 text-xs text-slate-400">Status: {status}</p>
          {error ? (
            <p className="mt-3 rounded-full border border-red-400/30 bg-red-500/10 px-4 py-2 text-xs font-medium text-red-100">
              {error}
            </p>
          ) : null}
        </div>
      </section>
    </ChatAppShell>
  );
}
