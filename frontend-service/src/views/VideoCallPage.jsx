'use client';

import { ChatAppShell } from '@/components/ChatAppShell';
import { ChatAppTopBar } from '@/components/ChatAppTopBar';
import CallUI from '@/components/CallUI';

export default function VideoCallPage() {
  return (
    <ChatAppShell topBar={<ChatAppTopBar />} gridClassName="grid-cols-1" className="app-shell">
      <section className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <CallUI
          defaultMode="video"
          title="Video calls"
          description="Start a direct 1:1 video call with another signed-in user. Both sides use the same accept or reject flow."
          theme="enhanced"
        />
      </section>
    </ChatAppShell>
  );
}
