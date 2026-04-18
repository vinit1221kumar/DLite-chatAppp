import dynamic from 'next/dynamic';
import { PrivateRoute } from '@/components/PrivateRoute';

const ChatDashboardPage = dynamic(() => import('@/views/ChatDashboardPage'), {
  loading: () => (
    <div className="flex min-h-[50vh] items-center justify-center bg-ui-canvas px-4 text-sm text-slate-600 dark:text-slate-400">
      Loading chat…
    </div>
  ),
});

export default function Dashboard() {
  return (
    <PrivateRoute>
      <ChatDashboardPage />
    </PrivateRoute>
  );
}
