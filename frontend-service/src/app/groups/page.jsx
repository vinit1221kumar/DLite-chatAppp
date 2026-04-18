import dynamic from 'next/dynamic';
import { PrivateRoute } from '@/components/PrivateRoute';

const GroupChatPage = dynamic(() => import('@/views/GroupChatPage'), {
  loading: () => (
    <div className="flex min-h-[50vh] items-center justify-center bg-ui-canvas px-4 text-sm text-slate-600 dark:text-slate-400">
      Loading groups…
    </div>
  ),
});

export default function Groups() {
  return (
    <PrivateRoute>
      <GroupChatPage />
    </PrivateRoute>
  );
}
