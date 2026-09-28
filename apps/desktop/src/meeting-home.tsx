import React from 'react';
import { ArrowUpRight, AudioLines, CalendarDays, ChevronRight, FileText, Plus, Search, ShieldCheck } from 'lucide-react';
import { assistantProfiles, formatSessionTime, groupMeetings, matchesMeeting, meetingTitle, type MeetingRecord } from '@interview-copilot/sdk';
import type { InterviewMode } from '@interview-copilot/contracts';
import { meetingTheme } from './meeting-theme';

export type UpcomingRound = { id: string; name: string; scheduledAt: number; processTitle: string; processId: string; targetId?: string | null; objective?: string | null; interviewers: string[] };
export function MeetingHome({ sessions, upcoming, activeTitle, recording, sourceCount, mode, onMode, onStart, onOpenLive, onOpenSession, onHistory, onContext, onReadiness, onPrepare }: {
  sessions: MeetingRecord[]; upcoming: UpcomingRound[]; activeTitle?: string; recording: boolean; sourceCount: number;
  mode: InterviewMode; onMode: (mode: InterviewMode) => void; onStart: () => void; onOpenLive: () => void;
  onOpenSession: (id: string) => void; onHistory: () => void; onContext: () => void; onReadiness: () => void; onPrepare: (round: UpcomingRound) => void;
}) {
  const [query, setQuery] = React.useState('');
  const recent = sessions.filter(item => matchesMeeting(item, query)).slice(0, 8);
  const profile = assistantProfiles.find(item => item.id === mode);
  return <div className="workspace-view meeting-home" style={meetingTheme}>
    <header className="meeting-heading"><div><span className="meeting-eyebrow">YOUR WORKSPACE</span><h1>A little clarity.<br />Right when you need it.</h1><p>Prepare here. Stay present with the floating assistant.</p></div><span className="meeting-date">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</span></header>
    <section className="meeting-start" aria-label="Start a conversation">
      <div className="meeting-start-icon"><AudioLines aria-hidden="true" /></div>
      <div><h2>{activeTitle || 'Your next conversation'}</h2><p>{activeTitle ? recording ? 'Listening now · return to your live assistant' : 'Session open · microphone is not recording' : profile?.description}</p></div>
      <button className="meeting-primary" onClick={activeTitle ? onOpenLive : onStart}>{activeTitle ? 'Open assistant' : 'Start session'}<ArrowUpRight aria-hidden="true" /></button>
      <div className="meeting-start-options"><label>Assistant mode<select aria-label="Assistant mode" value={mode} onChange={e => onMode(e.target.value as InterviewMode)}>{assistantProfiles.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label><button onClick={onReadiness}><ShieldCheck aria-hidden="true" />Check audio & permissions</button><button onClick={onContext}><FileText aria-hidden="true" />{sourceCount ? `${sourceCount} sources ready` : 'Add context'}</button></div>
    </section>
    <div className="meeting-columns"><section className="meeting-activity"><header><div><span className="meeting-eyebrow">PICK UP WHERE YOU LEFT OFF</span><h2>Recent conversations</h2></div><button onClick={onHistory}>View all<ChevronRight aria-hidden="true" /></button></header>
      <label className="meeting-search"><Search aria-hidden="true" /><input aria-label="Search recent conversations" placeholder="Find a conversation…" value={query} onChange={e => setQuery(e.target.value)} /></label>
      {groupMeetings(recent).map(group => <section key={group.label} className="meeting-day"><h3>{group.label}</h3>{group.meetings.map(meeting => <button className="meeting-row" key={meeting.id} onClick={() => onOpenSession(meeting.id)}><span className="meeting-row-icon"><FileText aria-hidden="true" /></span><span><b>{meetingTitle(meeting)}</b><small>{new Date(meeting.startedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} · {meeting.mode.replaceAll('-', ' ')} · {meeting.status}</small></span><time>{formatSessionTime(meeting.liveSeconds)}</time><ChevronRight aria-hidden="true" /></button>)}</section>)}
      {!recent.length && <div className="meeting-empty"><FileText aria-hidden="true" /><h3>{query ? 'No conversations found' : 'Your conversations, remembered.'}</h3><p>{query ? 'Try another title or company.' : 'Save a session to keep its notes, transcript, and next steps together.'}</p><button onClick={query ? () => setQuery('') : onStart}>{query ? 'Clear search' : 'Start your first session'}</button></div>}
    </section><aside className="meeting-upcoming"><header><CalendarDays aria-hidden="true" /><h2>Before your next call</h2></header>{upcoming.length ? upcoming.slice(0, 3).map(round => <article key={round.id}><span className="meeting-eyebrow">{new Date(round.scheduledAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span><h3>{round.name}</h3><p>{round.processTitle}</p>{round.objective && <p>{round.objective}</p>}{round.interviewers.length > 0 && <small>{round.interviewers.join(', ')}</small>}<button onClick={() => onPrepare(round)}>Prepare for this call<ArrowUpRight aria-hidden="true" /></button></article>) : <div className="meeting-empty"><h3>A moment to prepare.</h3><p>No scheduled rounds. Add an objective and relevant context before your next conversation.</p><button onClick={onStart}><Plus aria-hidden="true" />Prepare a session</button><small>Calendar sync isn’t connected. Scheduled interview rounds appear here when available.</small></div>}<div className="meeting-privacy"><ShieldCheck aria-hidden="true" /><p>Listening is always your choice. Save or discard your transcript when you finish.</p></div></aside></div>
  </div>;
}
