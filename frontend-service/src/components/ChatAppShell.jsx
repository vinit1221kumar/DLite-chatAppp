'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export function ChatAppShell({ topBar = null, children, gridClassName, className }) {
  return (
    <div
      className={cn('flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-ui-canvas', className)}
    >
      {topBar}
      <motion.main
        className="flex min-h-0 flex-1 flex-col overflow-hidden p-2 sm:p-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.2, 0.9, 0.2, 1] }}
      >
        <div
          className={cn(
            'mx-auto grid min-h-0 w-full max-w-[1660px] flex-1 overflow-hidden rounded-3xl border border-ui-border bg-ui-shell shadow-[0_25px_80px_-24px_rgba(15,23,42,0.12)] dark:shadow-black/45',
            gridClassName
          )}
        >
          {children}
        </div>
      </motion.main>
    </div>
  );
}
