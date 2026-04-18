import dynamic from 'next/dynamic';

const LoginPage = dynamic(() => import('@/views/LoginPage'), {
  loading: () => (
    <div className="app-shell flex min-h-screen items-center justify-center bg-ui-canvas text-sm text-slate-500">
      Loading…
    </div>
  ),
});

export default function Login() {
  return <LoginPage />;
}
