'use client';
/* eslint-disable @next/next/no-html-link-for-pages */
import { useEffect, useState } from 'react';
import { ArrowUpRight, Clock3, Plus } from 'lucide-react';
import { clientApi } from '@/lib/client-api';

type Quota = { plan: string; remainingLiveSeconds: number };
type Session = { id: string; title?: string; mode: string; status: string; startedAt: number };

export function DashboardClient() {
  const [quota, setQuota] = useState<Quota | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      clientApi<Quota>('/api/v1/entitlements', { signal: controller.signal }),
      clientApi<{ sessions: Session[] }>('/api/v1/sessions', { signal: controller.signal }),
    ]).then(([nextQuota, result]) => {
      setQuota(nextQuota); setSessions(result.sessions); setError('');
    }).catch((reason) => { if (!controller.signal.aborted) setError(reason.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);

  return <div className="home-workspace">
    <header className="app-header"><div><span className="section-kicker">Your workspace</span><h1>Ready when you are.</h1><p>Get help in the moment. Keep what matters afterward.</p></div></header>
    <section className="home-start"><div><h2>Start a conversation</h2><p>Ask a question, listen with permission, or add screen context.</p></div><a className="pill-button" href="/session/new?mode=general"><Plus size={18} /> New session</a></section>
    {quota && <p className="home-usage">{Math.max(0, Math.floor(quota.remainingLiveSeconds / 60))} live minutes available <span>· {quota.plan} plan</span><a href="/pricing">Manage plan</a></p>}
    <section className="home-history"><header><h2>Recent sessions</h2><a href="/history">View saved sessions <ArrowUpRight size={16} /></a></header>
      {loading ? <p role="status" aria-busy="true">Loading your workspace…</p> : error ? <div role="alert" className="request-error"><p>{error}</p><button onClick={() => { setLoading(true); setError(''); setAttempt((value) => value + 1); }}>Retry</button><a href="/api/auth/login">Sign in</a></div> : sessions.length ? <div className="home-session-list">{sessions.slice(0, 5).map((session) => <a key={session.id} href={session.status === 'saved' ? `/history?session=${session.id}` : ['created', 'active', 'paused'].includes(session.status) ? `/session/${session.id}` : `/session/new?mode=${session.mode}`}><Clock3 size={18} /><span><b>{session.title || session.mode.replaceAll('-', ' ')}</b><small>{new Date(session.startedAt).toLocaleDateString()} · {session.status}</small></span><ArrowUpRight size={16} /></a>)}</div> : <div className="empty-state"><Clock3 size={24} /><h3>Your conversations will appear here</h3><p>Start a session above. You choose whether to save notes when it ends.</p></div>}
    </section>
    <details className="home-more"><summary>Prepare for an interview</summary><p>Bring verified experience, practice answers, and organize your next opportunity.</p><div><a href="/memory">Your context</a><a href="/practice">Practice</a><a href="/tools">Career tools</a><a href="/jobs">Job tracker</a></div></details>
  </div>;
}
