import dynamic from 'next/dynamic';
import { PrivateRoute } from '@/components/PrivateRoute';

const CallScreenPage = dynamic(() => import('@/views/CallScreenPage'), {
  loading: () => (
    <div className="flex min-h-[40vh] items-center justify-center bg-ui-canvas p-8 text-center text-sm text-slate-600 dark:text-slate-400">
      Loading call…
    </div>
  ),
});

export default function Call() {
  return (
    <PrivateRoute>
      <CallScreenPage />
    </PrivateRoute>
  );
}
