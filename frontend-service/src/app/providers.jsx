'use client';

import dynamic from 'next/dynamic';
import { ThemeProvider } from '@/context/ThemeContext';
import { AuthProvider } from '@/context/AuthContext';
import { SocketProvider } from '@/context/SocketContext';
import { IncomingCallProvider } from '@/context/IncomingCallContext';
import { ToastProvider } from '@/context/ToastContext';

const IncomingCallOverlay = dynamic(() => import('@/components/IncomingCallOverlay'), {
  ssr: false,
  loading: () => null,
});

const ToastViewport = dynamic(() => import('@/components/ToastViewport').then((m) => m.ToastViewport), {
  ssr: false,
  loading: () => null,
});

const InAppNotificationListener = dynamic(() => import('@/components/InAppNotificationListener'), {
  ssr: false,
  loading: () => null,
});

export function Providers({ children }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <SocketProvider>
            <IncomingCallProvider>
              <IncomingCallOverlay />
              <InAppNotificationListener />
              <ToastViewport />
              {children}
            </IncomingCallProvider>
          </SocketProvider>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
