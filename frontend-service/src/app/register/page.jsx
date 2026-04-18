import dynamic from 'next/dynamic';

const RegisterPage = dynamic(() => import('@/views/RegisterPage'), {
  loading: () => (
    <div className="app-shell flex min-h-screen items-center justify-center bg-[#F3F4F6] text-sm text-slate-500 dark:bg-slate-950">
      Loading…
    </div>
  ),
});

export default function Register() {
  return <RegisterPage />;
}
