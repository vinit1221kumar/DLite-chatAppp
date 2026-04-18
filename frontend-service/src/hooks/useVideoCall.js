+
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  joinVideoRoom,
  leaveVideoRoom,
  sendVideoSignal,
  subscribeToRoomPresence,
  subscribeToVideoSignals
} from '../services/videoClient';
import { DEFAULT_ICE_SERVERS } from '@/lib/webrtc';

export function useVideoCall({ userId, roomId }) {
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const pendingLocalMediaRef = useRef(null);
  const pendingIceCandidatesRef = useRef([]);
  const remoteDescriptionSetRef = useRef(false);
  const joinedRoomRef = useRef('');
  const seenSignalsRef = useRef(new Set());
  const statusRef = useRef('idle');

  const [remoteStream, setRemoteStream] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const cleanupPeer = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.ontrack = null;
      pcRef.current.onicecandidate = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    pendingIceCandidatesRef.current = [];
    remoteDescriptionSetRef.current = false;
    setRemoteStream(null);
  }, []);

  const stopMedia = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    pendingLocalMediaRef.current = null;
    setLocalStream(null);
  }, []);

  const ensureLocalMedia = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;
    if (!pendingLocalMediaRef.current) {
      pendingLocalMediaRef.current = navigator.mediaDevices
        .getUserMedia({
          video: { facingMode: 'user' },
          audio: true
        })
        .then((stream) => {
          localStreamRef.current = stream;
          setLocalStream(stream);
          return stream;
        })
        .finally(() => {
          pendingLocalMediaRef.current = null;
        });
    }
    return pendingLocalMediaRef.current;
  }, []);

  const ensureJoinedRoom = useCallback(async () => {
    const rid = roomId?.trim();
    if (!rid || !userId) return { role: 'callee' };
    if (joinedRoomRef.current === rid) return { role: 'callee' };
    const result = await joinVideoRoom({ roomId: rid, userId });
    joinedRoomRef.current = rid;
    return result;
  }, [roomId, userId]);

  const leaveCall = useCallback(() => {
    if (roomId && userId) {
      leaveVideoRoom({ roomId: roomId.trim(), userId }).catch(() => undefined);
    }
    joinedRoomRef.current = '';
    cleanupPeer();
    stopMedia();
    setStatus('idle');
    setError('');
    seenSignalsRef.current.clear();
  }, [roomId, userId, cleanupPeer, stopMedia]);

  const buildPeerConnection = useCallback(() => {
    pendingIceCandidatesRef.current = [];
    remoteDescriptionSetRef.current = false;
    const pc = new RTCPeerConnection({
      iceServers: DEFAULT_ICE_SERVERS,
      iceCandidatePoolSize: 10,
    });
    pcRef.current = pc;

    pc.ontrack = (ev) => {
      const [stream] = ev.streams;
      if (stream) setRemoteStream(stream);
    };

    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === 'connected') setStatus('connected');
      if (st === 'failed') setError('Connection failed — try leaving and rejoining.');
    };

    pc.onicecandidate = (ev) => {
      if (ev.candidate && roomId && userId) {
        sendVideoSignal({
          roomId,
          fromUserId: userId,
          signal: { type: 'ice', candidate: ev.candidate.toJSON() }
        }).catch(() => undefined);
      }
    };

    return pc;
  }, [roomId, userId]);

  const flushPendingIceCandidates = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || !remoteDescriptionSetRef.current) return;
    const pending = pendingIceCandidatesRef.current.splice(0);
    for (const candidate of pending) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        /* ignore stale ICE */
      }
    }
  }, []);

  const applyRemoteDescription = useCallback(
    async (pc, description) => {
      await pc.setRemoteDescription(new RTCSessionDescription(description));
      remoteDescriptionSetRef.current = true;
      await flushPendingIceCandidates();
    },
    [flushPendingIceCandidates]
  );

  const attachLocalToPc = useCallback(
    (pc) => {
      const stream = localStreamRef.current;
      if (!stream) return;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    },
    []
  );

  const joinCall = useCallback(async () => {
    if (!roomId?.trim() || !userId) {
      setError('Missing room or user.');
      return;
    }
    setError('');
    setStatus('joining');
    try {
      const stream = await ensureLocalMedia();
      const rid = roomId.trim();
      const { role } = await ensureJoinedRoom();

      cleanupPeer();
      const pc = buildPeerConnection();
      attachLocalToPc(pc);

      if (role === 'caller') {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendVideoSignal({
          roomId: rid,
          fromUserId: userId,
          signal: { type: 'offer', sdp: pc.localDescription.sdp }
        });
        setStatus('calling');
      } else {
        setStatus('waiting');
      }
    } catch (e) {
      setError(e.message || 'Could not access camera or microphone.');
      setStatus('error');
    }
  }, [roomId, userId, attachLocalToPc, buildPeerConnection, cleanupPeer, ensureJoinedRoom, ensureLocalMedia]);

  useEffect(() => {
    if (!roomId?.trim() || !userId) return;

    const rid = roomId.trim();

    const onSignal = async ({ id, fromUserId, type, sdp, candidate }) => {
      if (!fromUserId || fromUserId === userId) return;
      if (!type) return;
      if (seenSignalsRef.current.has(id)) return;
      seenSignalsRef.current.add(id);

      let pc = pcRef.current;

      if (type === 'ice' && candidate) {
        if (!pc || !remoteDescriptionSetRef.current) {
          pendingIceCandidatesRef.current.push(candidate);
          return;
        }
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch {
          /* ignore stale ICE */
        }
        return;
      }

      if (type === 'offer') {
        if (!pc) {
          await ensureJoinedRoom();
          const stream = await ensureLocalMedia();
          pc = buildPeerConnection();
          attachLocalToPc(pc);
        }
        try {
          await applyRemoteDescription(pc, { type: 'offer', sdp });
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await sendVideoSignal({
            roomId: rid,
            fromUserId: userId,
            signal: { type: 'answer', sdp: pc.localDescription.sdp }
          });
          setStatus('connected');
        } catch (e) {
          setError(e.message || 'Failed to answer call');
          setStatus('error');
        }
        return;
      }

      if (type === 'answer' && pc) {
        try {
          await applyRemoteDescription(pc, { type: 'answer', sdp });
          setStatus('connected');
        } catch (e) {
          setError(e.message || 'Failed to complete connection');
          setStatus('error');
        }
      }
    };

    const offSignals = subscribeToVideoSignals({ roomId: rid, onSignal });
    const offPresence = subscribeToRoomPresence({
      roomId: rid,
      currentUserId: userId,
      onPeerLeft: () => {
        if (statusRef.current === 'idle') return;
        cleanupPeer();
        setStatus('peer_left');
        setRemoteStream(null);
      }
    });

    return () => {
      offSignals();
      offPresence();
    };
  }, [roomId, userId, applyRemoteDescription, buildPeerConnection, attachLocalToPc, cleanupPeer, ensureJoinedRoom, ensureLocalMedia]);

  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const audio = stream.getAudioTracks()[0];
    if (audio) {
      audio.enabled = !audio.enabled;
      setMicOn(audio.enabled);
    }
  }, []);

  const toggleCam = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const video = stream.getVideoTracks()[0];
    if (video) {
      video.enabled = !video.enabled;
      setCamOn(video.enabled);
    }
  }, []);

  return {
    localStream,
    remoteStream,
    status,
    error,
    micOn,
    camOn,
    joinCall,
    leaveCall,
    toggleMic,
    toggleCam
  };
}
