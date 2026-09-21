import React from 'react';
import {
  CalendarDays,
  Check,
  Clipboard,
  Copy,
  Download,
  FileText,
  MessageSquareText,
  RefreshCw,
  Search,
  Sparkles,
  Users,
} from 'lucide-react';
import type { Suggestion } from '@interview-copilot/contracts';
import { desktopApi } from './desktop-api';
import './session-history.css';

export type SessionRecord = {
  id: string;
  mode: string;
  locale: string;
  status: string;
  startedAt: number;
  liveSeconds: number;
  reportId?: string | null;
};

export type SessionReport = {
  id: string;
  sessionId: string;
  score: number | null;
  summary: string;
  createdAt: number;
  strengths: string[];
  improvements: string[];
  notes: string[];
  actionItems: string[];
  followUpEmail?: string | null;
};

type TranscriptSegment = { id: string; speaker: 'interviewer' | 'candidate'; text: string; startedAtMs: number; endedAtMs: number };
type Interaction = { id: string; question: string; suggestion: Suggestion; createdAt: number };
type Capture = { id: string; kind: string; text: string; owner?: string | null; dueAt?: number | null; createdAt: number };
type SessionDetail = {
  session: SessionRecord & { title: string; endedAt?: number | null };
  target: { role: string; company?: string | null } | null;
  documents: Array<{ id: string; fileName: string }>;
  transcript: TranscriptSegment[];
  interactions: Interaction[];
  report: SessionReport | null;
  captures: Capture[];
};
type SessionTab = 'summary' | 'transcript' | 'chat';
type SessionFilter = 'all' | 'interviews' | 'meetings' | 'practice';

const interviewModes = new Set(['behavioral', 'technical', 'coding', 'system-design', 'case']);

function titleCase(value: string) {
  return value.replaceAll('-', ' ').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: number) {
  return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return seconds % 60 ? `${minutes}m ${seconds % 60}s` : `${minutes}m`;
}

function formatTimestamp(milliseconds: number) {
  const total = Math.max(0, Math.floor(milliseconds / 1_000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function answerText(suggestion: Suggestion) {
  return suggestion.expandedAnswer || suggestion.answer || suggestion.directAnswer || suggestion.supportingPoints.join('\n');
}

function downloadText(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function SessionLoading() {
  return <div className="session-detail-loading" aria-label="Loading session detail" aria-busy="true"><i /><i /><i /><i /></div>;
}

function SessionEmpty({ icon: Icon = FileText, title, copy }: { icon?: typeof FileText; title: string; copy: string }) {
  return <div className="session-detail-empty"><Icon aria-hidden="true" /><b>{title}</b><p>{copy}</p></div>;
}

export function SessionHistory({ sessions, reports, initialSessionId, onSelectSession, onStart }: {
  sessions: SessionRecord[];
  reports: SessionReport[];
  initialSessionId?: string;
  onSelectSession: (sessionId: string) => void;
  onStart: () => void;
}) {
  const requestSequence = React.useRef(0);
  React.useEffect(() => () => { requestSequence.current += 1; }, []);
  const [filter, setFilter] = React.useState<SessionFilter>('all');
  const [query, setQuery] = React.useState('');
  const [selectedId, setSelectedId] = React.useState(initialSessionId ?? sessions[0]?.id ?? '');
  const [detail, setDetail] = React.useState<SessionDetail | null>(null);
  const [detailState, setDetailState] = React.useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [detailError, setDetailError] = React.useState('');
  const [tab, setTab] = React.useState<SessionTab>('summary');
  const [transcriptQuery, setTranscriptQuery] = React.useState('');
  const [copied, setCopied] = React.useState('');

  React.useEffect(() => {
    if (!initialSessionId) return;
    const timer = window.setTimeout(() => setSelectedId(initialSessionId), 0);
    return () => window.clearTimeout(timer);
  }, [initialSessionId]);

  const loadDetail = React.useCallback(async (sessionId: string) => {
    if (!sessionId) return;
    const request = ++requestSequence.current;
    setDetail(null);
    setDetailState('loading');
    setDetailError('');
    try {
      const result = await desktopApi<SessionDetail>('GET', `/api/v1/sessions/${sessionId}/history`);
      if (request !== requestSequence.current) return;
      setDetail(result);
      setDetailState('ready');
    } catch (error) {
      if (request !== requestSequence.current) return;
      setDetail(null);
      setDetailState('error');
      setDetailError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  React.useEffect(() => {
    if (!selectedId) return;
    const timer = window.setTimeout(() => void loadDetail(selectedId), 0);
    return () => { requestSequence.current += 1; window.clearTimeout(timer); };
  }, [selectedId, loadDetail]);

  const filtered = React.useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return sessions.filter((session) => {
      const filterMatch = filter === 'all'
        || (filter === 'meetings' && session.mode === 'meeting')
        || (filter === 'practice' && session.mode === 'mock')
        || (filter === 'interviews' && interviewModes.has(session.mode));
      const report = reports.find((item) => item.sessionId === session.id);
      const searchMatch = !normalized || [session.mode, session.status, report?.summary].filter(Boolean).join(' ').toLowerCase().includes(normalized);
      return filterMatch && searchMatch;
    });
  }, [filter, query, reports, sessions]);

  const transcriptMatches = React.useMemo(() => {
    const normalized = transcriptQuery.trim().toLowerCase();
    return (detail?.transcript ?? []).filter((segment) => !normalized || segment.text.toLowerCase().includes(normalized) || segment.speaker.includes(normalized));
  }, [detail?.transcript, transcriptQuery]);

  function selectSession(sessionId: string) {
    if (sessionId === selectedId) return;
    requestSequence.current += 1;
    setDetail(null); setDetailState('loading');
    setSelectedId(sessionId);
    setTab('summary');
    setTranscriptQuery('');
    onSelectSession(sessionId);
  }

  async function copyValue(id: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(id);
    window.setTimeout(() => setCopied(''), 1_200);
  }

  function exportSession() {
    if (!detail) return;
    const report = detail.report;
    const lines = [
      detail.session.title,
      `${formatDate(detail.session.startedAt)} · ${formatDuration(detail.session.liveSeconds)}`,
      '',
      'SUMMARY', report?.summary ?? 'No summary available.',
      '',
      'KEY POINTS', ...(report?.notes ?? []),
      '',
      'ACTION ITEMS', ...(report?.actionItems ?? []),
      '',
      'TRANSCRIPT', ...detail.transcript.map((segment) => `[${formatTimestamp(segment.startedAtMs)}] ${titleCase(segment.speaker)}: ${segment.text}`),
    ];
    downloadText(`${detail.session.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-torvi.txt`, lines.join('\n'));
  }

  return <div className="session-history-workspace">
    <aside className="session-browser" aria-label="Session history">
      <label className="session-search"><Search aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sessions…" aria-label="Search sessions" /></label>
      <nav aria-label="Filter sessions">{(['all', 'interviews', 'meetings', 'practice'] as SessionFilter[]).map((item) => <button type="button" key={item} className={filter === item ? 'active' : ''} aria-pressed={filter === item} onClick={() => setFilter(item)}>{titleCase(item)}</button>)}</nav>
      <div className="session-list" role="listbox" aria-label="Saved sessions">
        {filtered.map((session) => {
          const report = reports.find((item) => item.sessionId === session.id);
          return <button type="button" role="option" aria-selected={selectedId === session.id} key={session.id} className={selectedId === session.id ? 'active' : ''} onClick={() => selectSession(session.id)}>
            <span className={`session-kind mode-${session.mode}`}>{session.mode === 'meeting' ? '≋' : session.mode === 'mock' ? '◎' : '✦'}</span>
            <span><b>{titleCase(session.mode)}</b><small>{formatDate(session.startedAt)} · {formatDuration(session.liveSeconds)}</small><em>{report?.summary ?? `${titleCase(session.status)} session`}</em></span>
            {report?.score != null && <strong>{Math.round(report.score)}</strong>}
          </button>;
        })}
        {!filtered.length && <SessionEmpty icon={Search} title="No matching sessions" copy={query ? 'Try a different search or filter.' : 'Completed sessions will appear here.'} />}
      </div>
    </aside>

    <section className="session-detail" aria-live="polite">
      {!selectedId && <SessionEmpty title="No sessions yet" copy="Start the assistant and save a session to build your searchable history." />}
      {detailState === 'loading' && <SessionLoading />}
      {detailState === 'error' && <div className="session-detail-error" role="alert"><b>Session couldn’t be loaded</b><p>{detailError || 'Check your connection and try again.'}</p><button onClick={() => void loadDetail(selectedId)}><RefreshCw aria-hidden="true" />Retry</button></div>}
      {detailState === 'ready' && detail && <>
        <header className="session-detail-header">
          <div><span>{titleCase(detail.session.mode)} · {titleCase(detail.session.status)}</span><h2>{detail.session.title}</h2><p><CalendarDays aria-hidden="true" />{formatDate(detail.session.startedAt)} <i /> {formatDuration(detail.session.liveSeconds)} {detail.target && <><i /><Users aria-hidden="true" />{[detail.target.role, detail.target.company].filter(Boolean).join(' at ')}</>}</p></div>
          <div>
            <button aria-label="Copy session summary" title="Copy session summary" disabled={!detail.report?.summary} onClick={() => detail.report && void copyValue('summary', detail.report.summary)}>{copied === 'summary' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}<span>{copied === 'summary' ? 'Copied' : 'Copy'}</span></button>
            <button aria-label="Export session" title="Export session" onClick={exportSession}><Download aria-hidden="true" /><span>Export</span></button>
          </div>
        </header>
        <nav className="session-tabs" aria-label="Session detail tabs">
          <button className={tab === 'summary' ? 'active' : ''} aria-current={tab === 'summary' ? 'page' : undefined} onClick={() => setTab('summary')}><Clipboard aria-hidden="true" />Summary</button>
          <button className={tab === 'transcript' ? 'active' : ''} aria-current={tab === 'transcript' ? 'page' : undefined} onClick={() => setTab('transcript')}><FileText aria-hidden="true" />Transcript <em>{detail.transcript.length}</em></button>
          <button className={tab === 'chat' ? 'active' : ''} aria-current={tab === 'chat' ? 'page' : undefined} onClick={() => setTab('chat')}><MessageSquareText aria-hidden="true" />AI Chat <em>{detail.interactions.length}</em></button>
        </nav>

        <div className="session-tab-content">
          {tab === 'summary' && (detail.report ? <div className="session-summary-view">
            <article className="summary-overview"><div><span>Overview</span><button onClick={() => void copyValue('overview', detail.report?.summary ?? '')}>{copied === 'overview' ? 'Copied' : 'Copy'}</button></div><p>{detail.report.summary}</p></article>
            <div className="summary-grid">
              <article><span>Key points</span>{detail.report.notes.length ? detail.report.notes.map((item) => <p key={item}><i>•</i>{item}</p>) : <small>No key points were generated.</small>}</article>
              <article><span>Decisions</span>{detail.captures.filter((item) => item.kind === 'decision').length ? detail.captures.filter((item) => item.kind === 'decision').map((item) => <p key={item.id}><Check aria-hidden="true" />{item.text}</p>) : <small>No decisions were captured.</small>}</article>
              <article><span>Action items</span>{detail.report.actionItems.length ? detail.report.actionItems.map((item) => <label key={item}><input type="checkbox" />{item}</label>) : <small>No action items were captured.</small>}</article>
              <article><span>Follow-up</span>{detail.report.followUpEmail ? <><p>{detail.report.followUpEmail}</p><button onClick={() => void copyValue('followup', detail.report?.followUpEmail ?? '')}>{copied === 'followup' ? 'Copied' : 'Copy draft'}</button></> : <small>No follow-up draft is available.</small>}</article>
            </div>
          </div> : <SessionEmpty title="No summary available" copy="This session was not saved with a generated report." />)}

          {tab === 'transcript' && <div className="transcript-view">
            <label className="transcript-search"><Search aria-hidden="true" /><input value={transcriptQuery} onChange={(event) => setTranscriptQuery(event.target.value)} placeholder="Find in transcript…" aria-label="Find in transcript" /><span>{transcriptMatches.length} matches</span></label>
            <div className="transcript-list">{transcriptMatches.map((segment) => <article key={segment.id}><time>{formatTimestamp(segment.startedAtMs)}</time><div><b>{segment.speaker === 'candidate' ? 'You' : 'Other speaker'}</b><p>{segment.text}</p></div></article>)}{!transcriptMatches.length && <SessionEmpty icon={FileText} title="No transcript available" copy={transcriptQuery ? 'No transcript lines match this search.' : 'No transcript was saved for this session.'} />}</div>
          </div>}

          {tab === 'chat' && <div className="session-chat-view">{detail.interactions.map((interaction) => <article key={interaction.id}>
            <div className="chat-question"><span>You</span><p>{interaction.question}</p></div>
            <div className="chat-answer"><span><Sparkles aria-hidden="true" />Torvi <time>{new Date(interaction.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</time></span><p>{answerText(interaction.suggestion)}</p><button onClick={() => void copyValue(interaction.id, answerText(interaction.suggestion))}>{copied === interaction.id ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copied === interaction.id ? 'Copied' : 'Copy'}</button></div>
          </article>)}{!detail.interactions.length && <SessionEmpty icon={MessageSquareText} title="No AI chat history" copy="Questions you ask Torvi during a saved session will appear here." />}</div>}
        </div>
      </>}
      {!sessions.length && <button className="session-empty-start" onClick={onStart}>Start Assistant</button>}
    </section>
  </div>;
}
