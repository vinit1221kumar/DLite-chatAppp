 'use client';
 
 import { X } from 'lucide-react';
 import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
 import { useToasts } from '@/context/ToastContext';
 import { cn } from '@/lib/utils';
 
 function toneClasses(tone) {
   if (tone === 'success') return 'border-emerald-200/70 bg-emerald-50 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/35 dark:text-emerald-50';
   if (tone === 'warning') return 'border-amber-200/70 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/35 dark:text-amber-50';
   if (tone === 'danger') return 'border-red-200/70 bg-red-50 text-red-950 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-50';
   return 'border-ui-border bg-ui-panel text-ui-fg';
 }
 
 export function ToastViewport() {
   const { toasts, removeToast } = useToasts();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || typeof document === 'undefined') return null;
 
   const node = (
     <div className="pointer-events-none fixed bottom-4 right-4 z-[300] flex w-[min(92vw,360px)] flex-col gap-2">
       {toasts.map((t) => (
         <div
           key={t.id}
           className={cn(
             'pointer-events-auto anim-pop overflow-hidden rounded-2xl border shadow-xl shadow-slate-900/10 dark:shadow-black/40',
             toneClasses(t.tone)
           )}
           role="status"
           aria-live="polite"
         >
           <div className="flex items-start gap-3 px-3 py-2.5">
             <div className="min-w-0 flex-1">
               {t.title ? <p className="truncate text-sm font-bold">{t.title}</p> : null}
               {t.message ? <p className="mt-0.5 line-clamp-3 text-[12px] leading-snug opacity-90">{t.message}</p> : null}
             </div>
             <button
               type="button"
               className="inline-flex h-8 w-8 items-center justify-center rounded-xl transition hover:bg-black/5 dark:hover:bg-white/10"
               onClick={() => removeToast(t.id)}
               aria-label="Dismiss notification"
             >
               <X className="h-4 w-4 opacity-70" />
             </button>
           </div>
         </div>
       ))}
     </div>
   );
 
   return createPortal(node, document.body);
 }
