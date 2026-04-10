import { cn } from '@/lib/utils';

export function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl bg-amber-200/60 dark:bg-navy-800/60',
        'before:absolute before:inset-0 before:-translate-x-full before:bg-gradient-to-r before:from-transparent before:via-white/35 before:to-transparent before:animate-[shimmer_2.2s_ease-in-out_infinite]',
        className
      )}
      {...props}
    />
  );
}

