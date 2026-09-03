'use client';
/* eslint-disable @next/next/no-html-link-for-pages */

import { useEffect, useMemo, useState } from 'react';
import { Copy, Download, FileText, MessageSquareText, Pencil, Plus, Search, Sparkles, Trash2 } from 'lucide-react';
import type { Suggestion } from '@interview-copilot/contracts';

type SessionSummary = { id: string; title: string; mode: string; locale: string; status: string; startedAt: number; liveSeconds: number; role?: string | null; company?: string | null };
type HistoryDetail = {
  session: SessionSummary & { retentionChoice: string };
  target: { role: string; company: string | null; jobDescription: string | null } | null;
  documents: Array<{ id: string; fileName: string; kind: string }>;
  transcript: Array<{ id: string; speaker: string; text: string; startedAtMs: number }>;
  interactions: Array<{ id: string; question: string; suggestion: Suggestion; createdAt: number }>;
  report: { summary: string; notes: string[]; actionItems: string[]; strengths: string[]; improvements: string[] } | null;
  captures: Array<{ id: string; kind: string; text: string }>;
};

function duration(seconds: number) {
  if (!seconds) return 'Under a minute';
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function HistoryClient() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<HistoryDetail | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  async function loadSessions(preferredId?: string) {
    const response = await fetch('/api/v1/sessions');
    const payload = response.ok ? await response.json() as { sessions?: SessionSummary[] } : {};
    const next = payload.sessions?.filter((session) => session.status === 'saved') ?? [];
    setSessions(next);
    setSelectedId(preferredId && next.some((session) => session.id === preferredId) ? preferredId : next[0]?.id ?? '');
    setLoading(false);
  }

  useEffect(() => {
    let active = true;
    void fetch('/api/v1/sessions').then(async (response) => response.ok ? await response.json() as { sessions?: SessionSummary[] } : {}).then((payload) => {
      if (!active) return;
      const next = payload.sessions?.filter((session) => session.status === 'saved') ?? [];
      setSessions(next);
      setSelectedId(next[0]?.id ?? '');
      setLoading(false);
    }).catch(() => {
      if (!active) return;
      setLoading(false);
      setNotice('Session history could not be loaded.');
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    void fetch(`/api/v1/sessions/${selectedId}/history`).then(async (response) => {
      if (!response.ok) throw new Error('Session details could not be loaded.');
      return await response.json() as HistoryDetail;
    }).then((payload) => { if (active) setDetail(payload); }).catch((error) => { if (active) setNotice(error instanceof Error ? error.message : 'Session details could not be loaded.'); });
    return () => { active = false; };
  }, [selectedId]);

  const filtered = useMemo(() => sessions.filter((session) => `${session.title} ${session.mode} ${session.company ?? ''}`.toLowerCase().includes(query.toLowerCase())), [query, sessions]);

  async function rename() {
    if (!detail) return;
    const title = window.prompt('Rename this session', detail.session.title)?.trim();
    if (!title || title === detail.session.title) return;
    const response = await fetch(`/api/v1/sessions/${detail.session.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }) });
    if (!response.ok) return setNotice('The session could not be renamed.');
    setDetail({ ...detail, session: { ...detail.session, title } });
    setSessions((current) => current.map((session) => session.id === detail.session.id ? { ...session, title } : session));
    setNotice('Session renamed.');
  }

  async function remove() {
    if (!detail || !window.confirm(`Delete “${detail.session.title}” and its saved transcript, AI interactions, and report?`)) return;
    const response = await fetch(`/api/v1/sessions/${detail.session.id}`, { method: 'DELETE' });
    if (!response.ok) return setNotice('The session could not be deleted.');
    setDetail(null);
    await loadSessions();
    setNotice('Session permanently deleted.');
  }

  function exportSession() {
    if (!detail) return;
    const blob = new Blob([JSON.stringify(detail, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${detail.session.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'live-copilot-session'}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return <div className="history-page">
    <header className="history-header"><div><span className="section-kicker">Conversation memory</span><h1>History that stays useful.</h1><p>Search saved conversations, inspect the transcript and AI interactions, and return to the setup that worked.</p></div><a className="pill-button pill-button-small" href="/session/new"><Plus size={15} /> New session</a></header>
    {notice && <div className="app-notice">{notice}</div>}
    {loading ? <section className="history-loading"><i /><i /><i /></section> : !sessions.length ? <section className="history-empty"><Sparkles size={25} /><h2>No saved sessions yet.</h2><p>Finish a live conversation with Save, notes &amp; finish to build a searchable history.</p><a href="/session/new">Prepare your first session</a></section> : <div className="history-layout">
      <aside className="history-list"><label><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sessions" /></label><nav>{filtered.map((session) => <button key={session.id} className={selectedId === session.id ? 'active' : ''} onClick={() => setSelectedId(session.id)}><i>{session.mode === 'meeting' ? '≋' : session.mode === 'study' ? '⌁' : '✦'}</i><span><b>{session.title}</b><small>{new Date(session.startedAt).toLocaleDateString()} · {duration(session.liveSeconds)}</small></span><em>{session.mode.replace('-', ' ')}</em></button>)}</nav>{!filtered.length && <p>No sessions match “{query}”.</p>}</aside>
      <section className="history-detail">{detail?.session.id === selectedId ? <><header><div><span>{detail.session.mode.replace('-', ' ')} · {new Date(detail.session.startedAt).toLocaleString()}</span><h2>{detail.session.title}</h2><p>{duration(detail.session.liveSeconds)} · {detail.session.locale.toUpperCase()} · {detail.documents.length} context sources</p></div><div><button onClick={rename} title="Rename session"><Pencil size={14} /></button><button onClick={exportSession} title="Export session"><Download size={14} /></button><a href={`/session/new?mode=${detail.session.mode}&source=${detail.session.id}`} title="Duplicate setup"><Copy size={14} /></a><button className="danger" onClick={remove} title="Delete session"><Trash2 size={14} /></button></div></header>{detail.report && <article className="history-summary"><span>Summary</span><p>{detail.report.summary}</p><div>{detail.report.actionItems.map((item) => <label key={item}><input type="checkbox" />{item}</label>)}</div></article>}<div className="history-columns"><article><h3><FileText size={15} /> Transcript</h3>{detail.transcript.length ? detail.transcript.map((turn) => <div className="history-turn" key={turn.id}><span>{turn.speaker === 'candidate' ? 'You' : 'Other speaker'}</span><p>{turn.text}</p></div>) : <p className="history-muted">No transcript was retained for this session.</p>}</article><article><h3><MessageSquareText size={15} /> AI interactions</h3>{detail.interactions.length ? detail.interactions.map((interaction) => <div className="history-interaction" key={interaction.id}><b>{interaction.question}</b><p>{interaction.suggestion.answer || interaction.suggestion.directAnswer}</p></div>) : <p className="history-muted">No AI interactions were retained.</p>}{detail.captures.length > 0 && <><h3 className="moments-title">Important moments</h3>{detail.captures.map((capture) => <div className="history-capture" key={capture.id}><span>{capture.kind.replace('_', ' ')}</span>{capture.text}</div>)}</>}</article></div></> : <div className="history-detail-loading">Loading conversation…</div>}</section>
    </div>}
  </div>;
}
