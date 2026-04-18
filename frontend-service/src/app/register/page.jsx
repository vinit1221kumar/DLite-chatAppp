import dynamic from 'next/dynamic';

const RegisterPage = dynamic(() => import('@/views/RegisterPage'), {
  loading: () => (
    <div className="app-shell flex min-h-screen items-center justify-center bg-ui-canvas text-sm text-slate-500">
      Loading…
    </div>
  ),
});

export default function Register() {
  return <RegisterPage />;
}
