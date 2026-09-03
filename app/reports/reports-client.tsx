'use client';
/* eslint-disable @next/next/no-html-link-for-pages */

import { useEffect, useState } from 'react';
import { BrainCircuit, CheckCircle2, ClipboardList, Copy, Mail, Sparkles, Target } from 'lucide-react';

type Report = {
  id: string;
  sessionId: string;
  mode: string;
  score: number | null;
  summary: string;
  strengths: string[];
  improvements: string[];
  notes: string[];
  actionItems: string[];
  followUpEmail: string | null;
  createdAt: number;
};
type MemoryCandidate = { id: string; text: string };

export function ReportsClient() {
  const [reports, setReports] = useState<Report[]>([]);
  const [selected, setSelected] = useState<Report | null>(null);
  const [memoryCandidates, setMemoryCandidates] = useState<MemoryCandidate[]>([]);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    fetch('/api/v1/reports').then(async (response) => response.ok ? await response.json() as { reports?: Report[] } : { reports: [] }).then((payload) => {
      setReports(payload.reports ?? []);
      setSelected(payload.reports?.[0] ?? null);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!selected || selected.mode !== 'meeting') return;
    fetch(`/api/v1/sessions/${selected.sessionId}/memory-candidates`).then(async (response) => response.ok ? await response.json() as { candidates?: MemoryCandidate[] } : {})
      .then((payload) => setMemoryCandidates(payload.candidates ?? [])).catch(() => undefined);
  }, [selected]);

  async function addToMemory(candidate: MemoryCandidate) {
    if (!selected) return;
    const response = await fetch(`/api/v1/sessions/${selected.sessionId}/memory-candidates`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ captureId: candidate.id, experienceTitle: 'Meeting-derived experience', claimText: candidate.text }),
    });
    if (!response.ok) return setNotice('The potential memory could not be added.');
    setMemoryCandidates((current) => current.filter((item) => item.id !== candidate.id));
    setNotice('Added as a proposed claim. Confirm it in Professional Memory before the copilot can use it autobiographically.');
  }

  return <div className="suite-page">
    <header className="suite-header"><div><span className="section-kicker">Session intelligence</span><h1>Turn conversations into progress.</h1><p>Saved sessions include performance feedback, notes, next steps, and an editable follow-up email. Raw audio is never retained.</p></div></header>
    {notice && <div className="app-notice">{notice}</div>}
    {!reports.length ? <section className="report-empty"><Sparkles size={27} /><h2>Your first report starts with a saved session.</h2><p>Run a mock or live coaching session, then choose Save &amp; finish.</p><a className="pill-button pill-button-small" href="/session/new?mode=mock">Start a mock</a></section> : <div className="reports-layout"><aside className="report-list">{reports.map((report) => <button className={selected?.id === report.id ? 'active' : ''} key={report.id} onClick={() => { setMemoryCandidates([]); setSelected(report); }}><strong>{report.score ?? '—'}</strong><span><b>{report.mode === 'meeting' ? 'Meeting' : 'Interview'} session</b><small>{new Date(report.createdAt).toLocaleDateString()}</small></span></button>)}</aside>{selected && <section className="report-detail"><div className="report-score"><div><span>Overall coaching score</span><strong>{selected.score ?? '—'}</strong></div><p>{selected.summary}</p></div><div className="report-two"><article><h2><CheckCircle2 size={18} /> Strengths</h2>{selected.strengths.map((item) => <p key={item}>{item}</p>)}</article><article><h2><Target size={18} /> Improvements</h2>{selected.improvements.map((item) => <p key={item}>{item}</p>)}</article></div><article className="report-section"><h2><ClipboardList size={18} /> {selected.mode === 'meeting' ? 'Meeting notes' : 'Interview notes'}</h2>{selected.notes.length ? selected.notes.map((item) => <p key={item}>{item}</p>) : <p>No notes were captured.</p>}</article><article className="report-section"><h2><CheckCircle2 size={18} /> Action items</h2>{selected.actionItems.map((item) => <label key={item}><input type="checkbox" />{item}</label>)}</article>{selected.mode === 'meeting' && memoryCandidates.length > 0 && <article className="report-section potential-memory"><h2><BrainCircuit size={18} /> Potential career memories</h2><p>Nothing below is a verified career fact. Add a candidate, then confirm or edit it in Professional Memory.</p>{memoryCandidates.map((candidate) => <div key={candidate.id}><span>{candidate.text}</span><button onClick={() => addToMemory(candidate)}>Add to Career Memory</button></div>)}</article>}{selected.followUpEmail && <article className="report-section followup"><div><h2><Mail size={18} /> Follow-up email draft</h2><button onClick={() => navigator.clipboard.writeText(selected.followUpEmail ?? '')}><Copy size={14} /> Copy</button></div><pre>{selected.followUpEmail}</pre></article>}</section>}</div>}
  </div>;
}
