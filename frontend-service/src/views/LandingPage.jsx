'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  LayoutDashboard,
  Lock,
  MessageCircle,
  Radio,
  Sparkles,
  Users,
  Zap
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { Button } from '@/components/ui/button';
import { AppHeaderMenu } from '@/components/AppHeaderMenu';
import { ThemeToggle } from '@/components/ThemeToggle';
import { AppBrandRow } from '@/components/AppBrandRow';
import { AppLogo } from '@/components/AppLogo';
import { cn } from '@/lib/utils';

/** Primary “Dashboard” CTA — shimmer + glow ring (header uses compact size) */
const dashboardCtaClass = (compact) =>
  cn(
    'anim-shimmer relative overflow-hidden font-semibold tracking-wide',
    'bg-gradient-to-r from-ui-grad-from to-ui-grad-to text-white',
    'shadow-[0_12px_40px_-14px_rgba(15,23,42,0.18)] ring-2 ring-[var(--ui-accent)]/45 ring-offset-2 ring-offset-white',
    'transition hover:brightness-[1.05] hover:shadow-[0_18px_48px_-12px_rgba(15,23,42,0.2)]',
    'dark:ring-[var(--ui-accent)]/35 dark:ring-offset-slate-950',
    compact ? 'px-4 py-2.5 text-sm' : 'px-7 py-3 text-base'
  );

const DashboardCtaContent = ({ compact = false, showArrow = true }) => (
  <>
    <LayoutDashboard className={cn('shrink-0 opacity-95', compact ? 'mr-1.5 h-4 w-4' : 'mr-2.5 h-5 w-5')} aria-hidden />
    Dashboard
    {showArrow && (
      <ArrowRight className={cn('shrink-0 opacity-90', compact ? 'ml-1.5 h-4 w-4' : 'ml-2 h-4 w-4')} />
    )}
  </>
);

const fadeUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.28, ease: [0.2, 0.9, 0.2, 1] }
};

export default function LandingPage() {
  const { isAuthenticated, user } = useAuth();

  return (
    <div className="app-shell min-h-screen">
      {/* Background: dots + glow */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="landing-dots absolute inset-0 opacity-80" />
        <div className="anim-glow absolute -left-24 top-20 h-72 w-72 rounded-full bg-violet-400/25 dark:bg-violet-600/20" />
        <div className="anim-glow absolute -right-20 top-36 h-64 w-64 rounded-full bg-indigo-300/20 [animation-delay:2s] dark:bg-indigo-500/15" />
      </div>

      {/* Sticky glass header */}
      <header className="sticky top-0 z-50 border-b border-ui-border bg-ui-shell/95 backdrop-blur-xl dark:bg-ui-shell/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4">
          <AppBrandRow asHomeLink />

          <nav className="hidden items-center gap-1 sm:flex">
            {isAuthenticated && (
              <Button asChild className={dashboardCtaClass(true)}>
                <Link href="/dashboard" className="inline-flex items-center no-underline">
                  <DashboardCtaContent compact showArrow={false} />
                </Link>
              </Button>
            )}
            <Button asChild variant="ghost" size="sm">
              <a href="#features" className="no-underline">
                Features
              </a>
            </Button>
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            {/* Mobile: same CTA as hero (nav hidden below sm) */}
            {isAuthenticated && (
              <Button asChild className={cn(dashboardCtaClass(true), 'sm:hidden')}>
                <Link href="/dashboard" className="inline-flex items-center no-underline">
                  <DashboardCtaContent compact showArrow={false} />
                </Link>
              </Button>
            )}
            {isAuthenticated ? (
              <>
                <span className="hidden text-sm text-slate-600 dark:text-slate-300 md:inline">
                  Hi, <span className="font-semibold text-slate-900 dark:text-slate-100">{user?.username}</span>
                </span>
                <AppHeaderMenu
                  menuLinks={[{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }]}
                />
              </>
            ) : (
              <>
                <ThemeToggle />
                <Button asChild variant="secondary" size="sm">
                  <Link href="/login">Login</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/register">
                    Sign up <ArrowRight className="ml-1.5 h-4 w-4 hidden sm:inline" />
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-10 px-4 pb-6 pt-10 md:grid-cols-2 md:gap-12 md:pt-14">
          <section>
            <motion.div {...fadeUp} className="badge mb-4 inline-flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-violet-600 dark:text-violet-300" />
              Fast. Simple. Real-time.
            </motion.div>

            <motion.h1
              className="text-4xl font-bold leading-[1.08] tracking-tight text-slate-900 dark:text-slate-50 sm:text-5xl lg:text-[3.25rem]"
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: 0.06 }}
            >
              Messaging that feels{' '}
              <span className="bg-gradient-to-r from-violet-600 via-violet-500 to-indigo-500 bg-clip-text text-transparent dark:from-violet-300 dark:via-violet-200 dark:to-indigo-200">
                instant
              </span>
              .
            </motion.h1>

            <motion.p
              className="mt-5 max-w-lg text-base leading-relaxed text-slate-600 dark:text-slate-300"
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: 0.12 }}
            >
              Private chat, group rooms, and calls — all in one clean dashboard. Built for teams and friends who want a
              fast, reliable messaging experience.
            </motion.p>

            <motion.div
              className="mt-7 flex flex-wrap items-center gap-3"
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: 0.18 }}
            >
              {isAuthenticated ? (
                <Button asChild className={dashboardCtaClass(false)}>
                  <Link href="/dashboard" className="inline-flex items-center">
                    <DashboardCtaContent />
                  </Link>
                </Button>
              ) : (
                <>
                  <Button asChild className="anim-shimmer relative overflow-hidden">
                    <Link href="/register">
                      Get started free <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                  <Button asChild variant="secondary">
                    <Link href="/login">I have an account</Link>
                  </Button>
                </>
              )}
            </motion.div>

            {/* Quick tags */}
            <motion.div
              className="mt-8 flex flex-wrap gap-2"
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: 0.24 }}
            >
              <span className="badge inline-flex items-center gap-1.5">
                <MessageCircle className="h-3.5 w-3.5 text-violet-600 dark:text-violet-300" />
                DMs
              </span>
              <span className="badge inline-flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-violet-700 dark:text-violet-300" />
                Groups
              </span>
              <span className="badge inline-flex items-center gap-1.5">
                <Radio className="h-3.5 w-3.5 text-pink-600 dark:text-pink-300" />
                WebSockets
              </span>
            </motion.div>
          </section>

          {/* Preview card */}
          <motion.section
            id="preview"
            className="card anim-fade-up relative scroll-mt-24 p-5 md:p-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, delay: 0.06, ease: [0.2, 0.9, 0.2, 1] }}
          >
            <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-violet-500/10 via-transparent to-indigo-400/10" />
            <div className="relative mb-4 flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Live preview</p>
                <p className="text-sm text-slate-600 dark:text-slate-300">How the app feels — glass-style UI</p>
              </div>
              <span className="badge border-emerald-600/30 bg-emerald-500/15 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
                Online
              </span>
            </div>
            <div className="relative grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Private Chat</div>
                <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">Message a specific user by user ID.</div>
                <div className="mt-4 space-y-2">
                  <div className="relative w-[92%] rounded-2xl border border-slate-200/80 bg-white px-3 py-2 text-xs text-slate-800 dark:border-transparent dark:bg-white/7 dark:text-slate-200">
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">You</div>
                    Hey! quick update?
                  </div>
                  <div className="relative ml-auto w-[86%] rounded-2xl bg-violet-600/15 px-3 py-2 text-xs text-slate-900 dark:bg-violet-500/20 dark:text-slate-100">
                    <div className="text-[10px] text-slate-600 dark:text-slate-300">Teammate</div>
                    Done. Shipping now.
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Group Chat</div>
                <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">Broadcast to a group by group ID.</div>
                <div className="mt-4 space-y-2">
                  <div className="relative w-[90%] rounded-2xl border border-slate-200/80 bg-white px-3 py-2 text-xs text-slate-800 dark:border-transparent dark:bg-white/7 dark:text-slate-200">
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">#design</div>
                    New landing animations?
                  </div>
                  <div className="relative ml-auto w-[84%] rounded-2xl bg-emerald-500/10 px-3 py-2 text-xs text-slate-900 dark:text-slate-100">
                    <div className="text-[10px] text-slate-600 dark:text-slate-300">#team</div>
                    Looks clean. Approved.
                  </div>
                </div>
              </div>

            </div>
          </motion.section>
        </div>

        {/* Stats strip */}
        <div className="mx-auto mt-4 max-w-6xl px-4">
          <motion.div
            className="grid grid-cols-1 gap-3 sm:grid-cols-3"
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.28 }}
          >
            {[
              { label: 'Stack', value: 'Next.js + React', sub: 'Modern frontend' },
              { label: 'Realtime', value: 'Socket.io', sub: 'Low-latency events' },
              { label: 'UX', value: 'One dashboard', sub: 'Chat, groups, calls' }
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-2xl border border-slate-200 bg-white/80 px-5 py-4 backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.04]"
              >
                <div className="text-xs font-medium uppercase tracking-wider text-slate-500">{s.label}</div>
                <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{s.value}</div>
                <div className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{s.sub}</div>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Features */}
        <section id="features" className="mx-auto mt-20 max-w-6xl scroll-mt-24 px-4 pb-4">
          <motion.div
            className="mb-10 max-w-2xl"
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.28 }}
          >
            <p className="badge mb-3 inline-flex">Why D-Lite</p>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-3xl">
              Everything in one place
            </h2>
            <p className="mt-2 text-slate-600 dark:text-slate-400">
              Less clutter, more speed. The cards below summarize the core features — tell us what you want to add or
              remove next.
            </p>
          </motion.div>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                icon: MessageCircle,
                title: 'Private messages',
                desc: 'Direct userId based chat — simple API, clear UI.',
                accent: 'from-violet-500/25 to-transparent'
              },
              {
                icon: Users,
                title: 'Group rooms',
                desc: 'Broadcast with a group ID — team updates stay in one thread.',
                accent: 'from-indigo-500/25 to-transparent'
              },
              {
                icon: Zap,
                title: 'Realtime feel',
                desc: 'WebSockets for instant updates — typing indicators and delivery receipts can come later.',
                accent: 'from-violet-400/15 to-transparent'
              }
            ].map((f, i) => (
              <motion.div
                key={f.title}
                className="card group relative overflow-hidden p-6"
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.28, delay: i * 0.04 }}
              >
                <div
                  className={`pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br ${f.accent} opacity-80`}
                />
                <div className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-violet-200/80 bg-violet-50 text-violet-800 dark:border-violet-500/30 dark:bg-violet-950/40 dark:text-violet-200">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="relative mt-4 text-lg font-semibold text-slate-900 dark:text-slate-100">{f.title}</h3>
                <p className="relative mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{f.desc}</p>
              </motion.div>
            ))}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <motion.div
              className="card flex items-start gap-4 p-5"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.28, delay: 0.08 }}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-violet-600 dark:border-white/10 dark:bg-white/5 dark:text-violet-200">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-slate-100">Account & access</h3>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  JWT-based auth — one login to move between chat, groups, and calls. Customize this security messaging
                  anytime.
                </p>
              </div>
            </motion.div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto mt-16 max-w-6xl px-4 pb-6">
          <motion.div
            className="card relative overflow-hidden p-8 md:flex md:items-center md:justify-between md:gap-8 md:p-10"
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.28 }}
          >
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-violet-600/15 via-transparent to-indigo-500/12" />
            <div className="relative max-w-xl">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50 md:text-3xl">Ready to try?</h2>
              <p className="mt-2 text-slate-600 dark:text-slate-300">
                Create an account, open the dashboard, and try private chat. Next up: pick colors, add sections like
                pricing, testimonials, or FAQ — whatever you need.
              </p>
            </div>
            <div className="relative mt-6 flex flex-wrap gap-3 md:mt-0 md:shrink-0">
              {isAuthenticated ? (
                <Button asChild size="lg">
                  <Link href="/dashboard">
                    Open dashboard <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              ) : (
                <>
                  <Button asChild size="lg">
                    <Link href="/register">
                      Create account <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                  <Button asChild variant="secondary" size="lg">
                    <Link href="/login">Login</Link>
                  </Button>
                </>
              )}
            </div>
          </motion.div>
        </section>
      </main>

      <footer className="mx-auto mt-8 max-w-6xl border-t border-slate-200 px-4 py-10 dark:border-white/10">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <AppLogo variant="footer" />
              <span className="font-semibold text-slate-800 dark:text-slate-200">D-Lite</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-slate-600 dark:text-slate-500">
              Chat, groups & calls — a lightweight experience.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Product</div>
              <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-400">
                <li>
                  <a href="#features" className="no-underline hover:text-slate-900 dark:hover:text-slate-200">
                    Features
                  </a>
                </li>
                {isAuthenticated && (
                  <li>
                    <Link href="/dashboard" className="no-underline hover:text-slate-900 dark:hover:text-slate-200">
                      Dashboard
                    </Link>
                  </li>
                )}
              </ul>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Account</div>
              <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-400">
                <li>
                  <Link href="/login" className="no-underline hover:text-slate-900 dark:hover:text-slate-200">
                    Login
                  </Link>
                </li>
                <li>
                  <Link href="/register" className="no-underline hover:text-slate-900 dark:hover:text-slate-200">
                    Register
                  </Link>
                </li>
              </ul>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Build</div>
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-500">Next.js · React · Tailwind</p>
            </div>
          </div>
        </div>
        <div className="mt-8 flex flex-col items-center gap-1 text-center text-xs text-slate-500 dark:text-slate-600">
          <p>Contact the developer: <a className="underline underline-offset-2 hover:text-slate-900 dark:hover:text-slate-200" href="mailto:developer@d-lite.com">developer@d-lite.com</a></p>
          <p>© {new Date().getFullYear()} D-Lite</p>
        </div>
      </footer>
    </div>
  );
}
