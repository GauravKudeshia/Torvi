import React from 'react';
import type { TranscriptSegment } from '@interview-copilot/contracts';
import { formatSessionTime } from '@interview-copilot/sdk';
import { meetingTheme } from './meeting-theme';

export function LiveTranscript({ segments, active, seconds, title, onAssistant, onPause, onFinish, busy }: {
  segments: TranscriptSegment[]; active: boolean; seconds: number; title: string; onAssistant: () => void;
  onPause: () => void; onFinish: () => void; busy: boolean;
}) {
  const [query, setQuery] = React.useState('');
  const [follow, setFollow] = React.useState(true);
  const scroll = React.useRef<HTMLDivElement>(null);
  const visible = React.useMemo(() => segments.filter(s => s.text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [segments, query]);
  React.useEffect(() => { if (follow && !query && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; }, [segments, follow, query]);
  return <section className="live-transcript-workspace" style={meetingTheme}><header><div><span className="meeting-eyebrow">LIVE WORKSPACE</span><h1>{title}</h1><p role="status">{active ? 'Listening' : 'Audio paused'} · {formatSessionTime(seconds)} · Transcript stays in memory until you save.</p></div><button className="meeting-primary" onClick={onAssistant}>Open assistant</button></header>
    <label className="meeting-search"><input aria-label="Search live transcript" placeholder="Find in this conversation…" value={query} onChange={e => setQuery(e.target.value)} /></label>
    <div ref={scroll} className="live-transcript-scroll" tabIndex={0} aria-label="Live transcript" onScroll={e => { const el = e.currentTarget; setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 40); }}>{visible.map(s => <article key={s.id}><time>{formatSessionTime(s.startedAtMs / 1000)}</time><div><b>{s.speaker === 'candidate' ? 'You' : 'Room / other speaker'}</b><p>{s.text}</p></div></article>)}{!visible.length && <div className="meeting-empty"><h3>{query ? 'No matching words' : 'The conversation will appear here.'}</h3><p>{query ? 'Try a different search.' : 'Start listening in the assistant. You can scroll back without being pulled to the latest turn.'}</p></div>}</div>
    <div className="live-transcript-toolbar"><button onClick={() => { setQuery(''); setFollow(true); }}>Follow latest</button><span>{follow && !query ? 'Following live' : 'Reading earlier turns'}</span><button disabled={busy} onClick={onPause}>{active ? 'Pause listening' : 'Resume listening'}</button><button disabled={busy} onClick={onFinish}>{busy ? 'Finishing…' : 'End & save notes'}</button></div>
  </section>;
}
