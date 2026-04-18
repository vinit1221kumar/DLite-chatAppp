import dynamic from 'next/dynamic';

const LoginPage = dynamic(() => import('@/views/LoginPage'), {
  loading: () => (
    <div className="app-shell flex min-h-screen items-center justify-center bg-[#F3F4F6] text-sm text-slate-500 dark:bg-slate-950">
      Loading…
    </div>
  ),
});

export default function Login() {
  return <LoginPage />;
}
