import dynamic from 'next/dynamic';
import { PrivateRoute } from '@/components/PrivateRoute';

const SpecialFriendPage = dynamic(() => import('@/views/SpecialFriendPage'), {
  loading: () => (
    <div className="flex min-h-[50vh] items-center justify-center bg-ui-canvas px-4 text-sm text-slate-600 dark:text-slate-400">
      Loading Special Friend…
    </div>
  )
});

export default function SpecialFriendRoute() {
  return (
    <PrivateRoute>
      <SpecialFriendPage />
    </PrivateRoute>
  );
}
