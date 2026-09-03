'use client';
/* eslint-disable @next/next/no-html-link-for-pages */

import { useEffect, useState } from 'react';
import { ArrowUpRight, BriefcaseBusiness, Check, ClipboardCheck, Clock3, Code2, FileText, FileUp, GraduationCap, Headphones, MessageSquareText, Plus, Presentation, ShieldCheck, Sparkles, Target, UsersRound, WandSparkles } from 'lucide-react';

type Quota = { plan: string; liveLimitMinutes: number; remainingLiveSeconds: number; remainingMockSessions: number | null };
type Session = { id: string; mode: string; locale: string; status: string; startedAt: number; liveSeconds: number };
type Report = { id: string; sessionId: string; score: number | null; summary: string };

export function DashboardClient() {
  const [quota, setQuota] = useState<Quota | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/v1/entitlements').then(async (response) => response.ok ? await response.json() as Quota : null),
      fetch('/api/v1/sessions').then(async (response) => response.ok ? await response.json() as { sessions: Session[] } : { sessions: [] }),
      fetch('/api/v1/reports').then(async (response) => response.ok ? await response.json() as { reports: Report[] } : { reports: [] }),
    ]).then(([quotaResult, sessionResult, reportResult]) => {
      setQuota(quotaResult);
      setSessions(sessionResult.sessions ?? []);
      setReports(reportResult.reports ?? []);
    }).catch(() => setNotice('The local data service is starting. Refresh in a moment.'));
  }, []);

  const usedMinutes = quota ? quota.liveLimitMinutes - Math.ceil(quota.remainingLiveSeconds / 60) : 0;
  const progress = quota ? Math.min(100, Math.max(0, (usedMinutes / quota.liveLimitMinutes) * 100)) : 0;

  return (
    <>
      <header className="app-header"><div><span className="section-kicker">Today&apos;s workspace</span><h1>Good to see you.</h1></div><a className="pill-button pill-button-small" href="/session/new?mode=general"><Plus size={16} /> Start Torvi</a></header>
      {notice && <div className="app-notice">{notice}</div>}
      <section className="dashboard-grid">
        <article className="dashboard-hero">
          <div><span className="dashboard-chip"><Sparkles size={13} /> General-purpose live assistant</span><h2>Bring the conversation, screen, and sources that matter.</h2><p>Real-time audio · optional screen context · grounded answers · useful notes</p></div>
          <a href="/session/new?mode=general">Prepare a session <ArrowUpRight size={17} /></a>
        </article>
        <article className="quota-card">
          <div className="quota-head"><span>Live assistance</span><b>{quota?.plan ?? 'free'}</b></div>
          <strong>{quota ? Math.floor(quota.remainingLiveSeconds / 60) : '—'}<small> minutes left</small></strong>
          <div className="quota-track"><i style={{ width: `${progress}%` }} /></div>
          <p>{usedMinutes} of {quota?.liveLimitMinutes ?? 15} minutes used this month</p>
        </article>
      </section>
      <section className="quick-start"><div className="section-heading"><div><span className="section-kicker">Start a new session</span><h2>Choose what you&apos;re walking into.</h2></div></div><div>{[{ mode: 'meeting', label: 'Meeting', copy: 'Notes + decisions', icon: UsersRound }, { mode: 'behavioral', label: 'Interview', copy: 'Speakable answers', icon: MessageSquareText }, { mode: 'sales', label: 'Sales', copy: 'Discovery + objections', icon: BriefcaseBusiness }, { mode: 'presentation', label: 'Presentation', copy: 'Questions + speaker cues', icon: Presentation }, { mode: 'study', label: 'Study', copy: 'Explain + examples', icon: GraduationCap }, { mode: 'general', label: 'General', copy: 'Adapt to the moment', icon: Sparkles }, { mode: 'custom', label: 'Custom', copy: 'Your own objective', icon: WandSparkles }].map(({ mode, label, copy, icon: Icon }) => <a key={mode} href={`/session/new?mode=${mode}`}><Icon size={17} /><span><b>{label}</b><small>{copy}</small></span><ArrowUpRight size={13} /></a>)}</div></section>
      <section className="conversation-loop" aria-labelledby="conversation-loop-title">
        <div className="section-heading"><div><span className="section-kicker">Your conversation loop</span><h2 id="conversation-loop-title">Prepare once. Get help in the moment. Leave with follow-through.</h2></div></div>
        <div className="conversation-loop-grid">
          <a href="/session/new?mode=general"><i>Before</i><span><Target size={18} /></span><b>Set the conversation context</b><small>Add your goal, participants, and any private sources the copilot may use.</small><em>Prepare context <ArrowUpRight size={13} /></em></a>
          <a href="/session/new?mode=general"><i>During</i><span><Headphones size={18} /></span><b>Listen, see, and assist</b><small>Hear both sides, optionally read the visible screen, and answer at the length you need.</small><em>Go live <ArrowUpRight size={13} /></em></a>
          <a href="/reports"><i>After</i><span><ClipboardCheck size={18} /></span><b>Turn talk into action</b><small>Review notes, decisions, open questions, follow-up drafts, and useful memory candidates.</small><em>Open reports <ArrowUpRight size={13} /></em></a>
        </div>
      </section>
      <section className="dashboard-columns">
        <article className="dashboard-panel" id="reports">
          <div className="panel-title"><div><span>Recent sessions</span><h2>Keep the momentum</h2></div><a href="/history">View history</a></div>
          <div className="session-list">
            {sessions.length ? sessions.slice(0, 5).map((session) => (
              <div className="session-item" key={session.id}><i className={session.status} /><div><b>{session.mode.replace('-', ' ')}</b><span>{new Date(session.startedAt).toLocaleDateString()} · {session.locale.toUpperCase()}</span></div><strong>{session.status}</strong></div>
            )) : <div className="empty-state"><Clock3 size={23} /><b>No sessions yet</b><p>Your conversations and live sessions will appear here.</p></div>}
          </div>
        </article>
        <article className="dashboard-panel setup-panel" id="documents">
          <div className="panel-title"><div><span>Your grounding</span><h2>Ready for truthful answers</h2></div><ShieldCheck size={23} /></div>
          <div className="setup-row"><span><Check size={14} /></span><div><b>Candidate profile</b><p>Add only facts you can stand behind.</p></div></div>
          <div className="setup-row"><span><FileUp size={14} /></span><div><b>Resume + job description</b><p>Upload and verify parsed facts.</p></div></div>
          <a className="panel-link" href="/memory">Review professional memory <ArrowUpRight size={14} /></a>
        </article>
      </section>
      <section className="dashboard-tools"><div className="section-heading"><div><span className="section-kicker">Preparation suite</span><h2>Everything around the interview</h2></div><a href="/tools">View all tools <ArrowUpRight size={14} /></a></div><div className="dashboard-tool-grid"><a href="/practice"><span><MessageSquareText size={17} /></span><b>Mock interviews</b><small>Tailored practice and feedback</small></a><a href="/session/new?mode=coding"><span><Code2 size={17} /></span><b>Coding copilot</b><small>Approach, debugging, and tests</small></a><a href="/tools"><span><FileText size={17} /></span><b>Resume + letters</b><small>ATS review and tailored drafts</small></a><a href="/jobs"><span><BriefcaseBusiness size={17} /></span><b>Job tracker</b><small>Fit, materials, and application stages</small></a></div></section>
      {reports[0] && <section className="report-highlight"><span>Latest report</span><b>{reports[0].score ?? '—'}</b><p>{reports[0].summary}</p></section>}
    </>
  );
}
