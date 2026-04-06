'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../hooks/useAuth';
import { motion } from 'framer-motion';
import { Chrome, LayoutDashboard, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppHeaderMenu } from '@/components/AppHeaderMenu';
import { AuthCardBranding } from '@/components/AuthCardBranding';
import { AuthPageBackground } from '@/components/AuthPageBackground';
import { toAuthErrorMessage } from '@/lib/firebaseAuthErrors';

export default function LoginPage() {
  const { login, loginWithGoogle, isAuthenticated, user, loading: authLoading, logout } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await login(email, password);
      router.push('/dashboard');
    } catch (err) {
      setError(toAuthErrorMessage(err, 'login'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleSubmitting(true);
    setError('');
    try {
      await loginWithGoogle();
      router.push('/dashboard');
    } catch (err) {
      setError(toAuthErrorMessage(err, 'google'));
    } finally {
      setGoogleSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="app-shell relative flex min-h-screen items-center justify-center px-4 py-10">
        <AuthPageBackground />
        <div className="card relative z-10 w-full max-w-md p-7 shadow-2xl backdrop-blur-sm">
          <AuthCardBranding />
          <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <div className="app-shell relative flex min-h-screen items-center justify-center px-4 py-10">
        <AuthPageBackground />
        <div className="absolute right-4 top-4 z-10">
          <AppHeaderMenu
            menuLinks={[{ href: '/dashboard', label: 'Return to dashboard', icon: LayoutDashboard }]}
          />
        </div>
        <motion.div
          className="card relative z-10 w-full max-w-md p-7 shadow-2xl"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.2, 0.9, 0.2, 1] }}
        >
          <AuthCardBranding className="mb-6" />
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">You&apos;re signed in</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Logged in as <span className="font-semibold text-slate-900 dark:text-slate-100">{user?.username}</span>. Go
            to your dashboard to continue chatting.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Button asChild className="w-full sm:flex-1">
              <Link href="/dashboard">
                <LayoutDashboard className="mr-2 h-4 w-4" />
                Return to dashboard
              </Link>
            </Button>
            <Button type="button" variant="secondary" className="w-full sm:flex-1" onClick={() => logout()}>
              Log out
            </Button>
          </div>
          <p className="mt-5 text-center text-sm text-slate-500 dark:text-slate-400">
            <Link href="/">Back to home</Link>
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="app-shell relative flex min-h-screen items-center justify-center px-4 py-10">
      <AuthPageBackground />
      <div className="absolute right-4 top-4 z-10">
        <AppHeaderMenu showLogout={false} menuLinks={[]} />
      </div>
      <motion.div
        className="card anim-fade-up relative z-10 w-full max-w-md p-7 shadow-2xl backdrop-blur-sm"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.2, 0.9, 0.2, 1] }}
      >
        <div className="anim-fade-up mb-6 [animation-delay:70ms]">
          <AuthCardBranding />
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Welcome back</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Use the email and password you registered with to access your chats, groups and calls.
          </p>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Tip: we never share your email with anyone. If you forget your password, an admin can reset it for you later.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="anim-fade-up space-y-3 [animation-delay:120ms]">
          <input
            className="input"
            placeholder="Email (e.g. you@example.com)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="input"
            placeholder="Password (min. 6 characters)"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Use the same account on web and desktop.</span>
            <span className="text-slate-500 dark:text-slate-500">Forgot password? (coming soon)</span>
          </div>

          <Button className="w-full" type="submit" disabled={submitting}>
            <LogIn className="mr-2 h-4 w-4" />
            {submitting ? 'Logging in…' : 'Login'}
          </Button>

          <div className="flex items-center gap-2 py-1">
            <div className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
            <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">or</span>
            <div className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
          </div>

          <Button
            className="w-full"
            type="button"
            variant="secondary"
            onClick={handleGoogleSignIn}
            disabled={googleSubmitting || submitting}
          >
            <Chrome className="mr-2 h-4 w-4" />
            {googleSubmitting ? 'Connecting…' : 'Sign in with Google'}
          </Button>
        </form>

        {error && (
          <div className="anim-pop mt-3 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:border-red-500/30 dark:text-red-200">
            {error}
          </div>
        )}

        <p className="anim-fade-up mt-5 text-sm text-slate-600 [animation-delay:160ms] dark:text-slate-300">
          No account? <Link href="/register">Register</Link>
        </p>
      </motion.div>
    </div>
  );
}

