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
import { toAuthErrorMessage } from '@/lib/authErrors';

const cardClass =
  'w-full max-w-md rounded-3xl border border-ui-border bg-ui-panel p-8 shadow-[0_25px_80px_-24px_rgba(15,23,42,0.12)] dark:shadow-black/45';

export default function LoginPage() {
  const { login, loginWithGoogle, requestOtp, verifyOtp, isAuthenticated, user, loading: authLoading, logout } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [otpSubmitting, setOtpSubmitting] = useState(false);
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
    } catch (err) {
      setError(toAuthErrorMessage(err, 'google'));
    } finally {
      setGoogleSubmitting(false);
    }
  };

  const handleSendOtp = async () => {
    setOtpSubmitting(true);
    setError('');
    try {
      await requestOtp(email);
      setOtpSent(true);
    } catch (err) {
      setError(toAuthErrorMessage(err, 'login'));
    } finally {
      setOtpSubmitting(false);
    }
  };

  const handleVerifyOtp = async () => {
    setOtpSubmitting(true);
    setError('');
    try {
      await verifyOtp(email, otpCode);
      router.push('/dashboard');
    } catch (err) {
      setError(toAuthErrorMessage(err, 'login'));
    } finally {
      setOtpSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="app-shell flex min-h-[100dvh] flex-col bg-ui-canvas">
        <main className="flex flex-1 items-center justify-center p-4 sm:p-6">
          <div className={cardClass}>
            <AuthCardBranding />
            <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">Loading…</p>
          </div>
        </main>
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <div className="app-shell relative flex min-h-[100dvh] flex-col bg-ui-canvas">
        <div className="absolute right-3 top-3 z-10 sm:right-6 sm:top-6">
          <AppHeaderMenu
            menuLinks={[{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }]}
          />
        </div>
        <main className="flex flex-1 items-center justify-center p-4 sm:p-6">
          <motion.div
            className={cardClass}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0.9, 0.2, 1] }}
          >
            <AuthCardBranding className="mb-6" />
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Signed in</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              <span className="font-semibold text-slate-900 dark:text-slate-100">{user?.username}</span>
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Button asChild className="w-full sm:flex-1">
                <Link href="/dashboard">
                  <LayoutDashboard className="mr-2 h-4 w-4" />
                  Dashboard
                </Link>
              </Button>
              <Button type="button" variant="secondary" className="w-full sm:flex-1" onClick={() => logout()}>
                Log out
              </Button>
            </div>
            <p className="mt-5 text-center text-sm text-slate-500 dark:text-slate-400">
              <Link href="/" className="font-medium text-ui-link hover:underline">
                Home
              </Link>
            </p>
          </motion.div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell relative flex min-h-[100dvh] flex-col bg-ui-canvas">
      <div className="absolute right-3 top-3 z-10 sm:right-6 sm:top-6">
        <AppHeaderMenu showLogout={false} menuLinks={[]} collapseActionsInMenu showChatsInCollapsedMenu={false} />
      </div>
      <main className="flex flex-1 items-center justify-center p-4 sm:p-6">
        <motion.div
          className={cardClass}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.2, 0.9, 0.2, 1] }}
        >
          <AuthCardBranding />
          <h1 className="mt-6 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Welcome back</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Sign in with email and password.</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-3">
            <input
              className="input"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
            <input
              className="input"
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />

            <Button className="w-full" type="submit" disabled={submitting}>
              <LogIn className="mr-2 h-4 w-4" />
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>

            <div className="rounded-2xl border border-ui-border bg-ui-muted/60 p-3 dark:bg-ui-muted/40">
              <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">Email code</p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="secondary"
                  className="sm:flex-1"
                  disabled={!email || otpSubmitting}
                  onClick={handleSendOtp}
                >
                  {otpSubmitting ? '…' : otpSent ? 'Resend' : 'Send code'}
                </Button>
                <input
                  className="input sm:flex-1"
                  placeholder="Code"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                />
                <Button type="button" className="sm:flex-1" disabled={!otpCode || !email || otpSubmitting} onClick={handleVerifyOtp}>
                  Verify
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2 py-1">
              <div className="h-px flex-1 bg-ui-border" />
              <span className="text-[10px] uppercase tracking-wide text-slate-500">or</span>
              <div className="h-px flex-1 bg-ui-border" />
            </div>

            <Button
              className="w-full"
              type="button"
              variant="secondary"
              onClick={handleGoogleSignIn}
              disabled={googleSubmitting || submitting}
            >
              <Chrome className="mr-2 h-4 w-4" />
              {googleSubmitting ? '…' : 'Google'}
            </Button>
          </form>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:border-red-500/30 dark:text-red-200">
              {error}
            </div>
          ) : null}

          <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
            No account?{' '}
            <Link href="/register" className="font-semibold text-ui-link hover:underline">
              Register
            </Link>
          </p>
        </motion.div>
      </main>
    </div>
  );
}
