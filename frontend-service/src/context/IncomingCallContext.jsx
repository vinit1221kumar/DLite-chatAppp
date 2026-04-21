'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { getUserProfileById } from '@/services/chatClient';
import { listenForIncomingCall, rejectCall } from '@/lib/call';

const IncomingCallContext = createContext(null);

function createBeeper() {
  let intervalId = null;
  let ac = null;
  function beep() {
    try {
      if (!ac) ac = new AudioContext();
      if (ac.state === 'suspended') ac.resume().catch(() => undefined);
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = 840;
      gain.gain.value = 0.07;
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start();
      osc.stop(ac.currentTime + 0.18);
    } catch { /* ignore audio errors */ }
  }
  return {
    start() { if (intervalId) return; beep(); intervalId = setInterval(beep, 1200); },
    stop() { if (intervalId) { clearInterval(intervalId); intervalId = null; } }
  };
}

export function IncomingCallProvider({ children }) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [offer, setOffer] = useState(null);
  const [callerProfile, setCallerProfile] = useState(null);
  const beeper = useRef(createBeeper());

  // When on the /call page, CallUI handles incoming calls itself — don't duplicate
  const isOnCallPage = pathname?.startsWith('/call') || pathname?.startsWith('/webrtc-call');

  useEffect(() => {
    if (!user?.id) return;
    const unsub = listenForIncomingCall(user.id, (incoming) => {
      if (isOnCallPage) return;
      if (!incoming) {
        setOffer(null);
        beeper.current.stop();
        return;
      }
      setOffer((prev) => {
        if (prev?.createdAt === incoming.createdAt && prev?.fromUserId === incoming.fromUserId) return prev;
        return incoming;
      });
      beeper.current.start();
    });
    return () => {
      unsub();
      beeper.current.stop();
    };
  }, [user?.id, isOnCallPage]);

  // When navigating to /call page, hide global overlay
  useEffect(() => {
    if (isOnCallPage) {
      setOffer(null);
      beeper.current.stop();
    }
  }, [isOnCallPage]);

  useEffect(() => {
    if (!offer?.fromUserId) { setCallerProfile(null); return; }
    getUserProfileById(offer.fromUserId)
      .then(setCallerProfile)
      .catch(() => setCallerProfile(null));
  }, [offer?.fromUserId]);

  const accept = useCallback(() => {
    if (!offer) return;
    beeper.current.stop();
    const mode = offer.mode || 'audio';
    const callerId = offer.fromUserId;
    setOffer(null);
    // Store flag so CallUI auto-accepts on mount
    try { sessionStorage.setItem('dlite-auto-accept-from', callerId); } catch { /* ignore */ }
    router.push(`/call?callee=${encodeURIComponent(callerId)}&mode=${mode}&ready=1`);
  }, [offer, router]);

  const reject = useCallback(async () => {
    if (!offer || !user?.id) return;
    beeper.current.stop();
    try { await rejectCall({ userId: user.id, callerId: offer.fromUserId }); } catch { /* ignore */ }
    setOffer(null);
  }, [offer, user?.id]);

  return (
    <IncomingCallContext.Provider value={{ offer, callerProfile, accept, reject }}>
      {children}
    </IncomingCallContext.Provider>
  );
}

export function useIncomingCall() {
  return useContext(IncomingCallContext);
}
