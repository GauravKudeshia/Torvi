import type { InterviewMode, Suggestion, TranscriptSegment } from '@interview-copilot/contracts';
import { transcriptOffsetMs } from './transcript';

// View models over existing routes, not a second persistence model.
export type MeetingRecord = {
  id: string; title?: string; mode: string; status: string; startedAt: number;
  liveSeconds: number; endedAt?: number | null; reportId?: string | null;
  company?: string | null; role?: string | null; interviewRoundId?: string | null;
};
export type MeetingReport = {
  id: string; sessionId: string; summary: string; createdAt: number;
  score: number | null; strengths: string[]; improvements: string[];
  notes: string[]; actionItems: string[]; followUpEmail?: string | null;
};
export type MeetingCapture = { id: string; kind: string; text: string; owner?: string | null; createdAt: number };
export type MeetingDetail = {
  session: MeetingRecord;
  target: { role: string; company?: string | null } | null;
  documents: Array<{ id: string; fileName: string }>;
  transcript: TranscriptSegment[];
  interactions: Array<{ id: string; question: string; suggestion: Suggestion; createdAt: number }>;
  report: MeetingReport | null;
  captures: MeetingCapture[];
};

export const assistantProfiles: Array<{ id: InterviewMode; label: string; description: string }> = [
  { id: 'general', label: 'General', description: 'Clear answers for everyday conversations.' },
  { id: 'meeting', label: 'Meeting', description: 'Discussion, decisions, and next steps.' },
  { id: 'sales', label: 'Sales', description: 'Discovery, objections, and useful follow-ups.' },
  { id: 'technical', label: 'Engineering', description: 'Technical reasoning grounded in your verified experience.' },
  { id: 'behavioral', label: 'Interview', description: 'Your verified experience, in your own voice.' },
  { id: 'presentation', label: 'Presentation', description: 'Stay on message and answer the room.' },
  { id: 'study', label: 'Study', description: 'Explain concepts and check understanding.' },
  { id: 'custom', label: 'Custom', description: 'Use your session objective and chosen context.' },
];
export const assistantActions = [
  { id: 'assist', label: 'Assist', prompt: 'Using the current conversation, help me with the most useful next response. If context is missing, ask one short clarifying question.' },
  { id: 'say', label: 'What should I say?', prompt: 'What should I say next? Give me a concise, natural response grounded in this conversation.' },
  { id: 'follow-up', label: 'Follow-up', prompt: 'Suggest one useful follow-up question based on this conversation.' },
  { id: 'recap', label: 'Recap', prompt: 'Recap the conversation so far, separating confirmed decisions from open questions.' },
  { id: 'explain', label: 'Explain this', prompt: 'Explain what is being discussed in plain language.' },
  { id: 'actions', label: 'Action items', prompt: 'List only the action items actually mentioned. Include owners and deadlines only when stated.' },
] as const;

export function meetingTitle(meeting: Pick<MeetingRecord, 'title' | 'role' | 'mode'>) {
  return meeting.title?.trim() || meeting.role?.trim() || `${meeting.mode.replaceAll('-', ' ')} session`;
}
export function formatSessionTime(seconds: number) {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`;
}
export function groupMeetings<T extends Pick<MeetingRecord, 'startedAt'>>(meetings: T[], now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
  const groups: Array<{ label: string; meetings: T[] }> = [];
  for (const meeting of [...meetings].sort((a, b) => b.startedAt - a.startedAt)) {
    const label = meeting.startedAt >= today ? 'Today' : meeting.startedAt >= yesterday ? 'Yesterday' : 'Earlier';
    let group = groups.find(item => item.label === label);
    if (!group) { group = { label, meetings: [] }; groups.push(group); }
    group.meetings.push(meeting);
  }
  return groups;
}
export function matchesMeeting(meeting: MeetingRecord, query: string, summary = '') {
  return [meetingTitle(meeting), meeting.mode, meeting.company, meeting.status, summary].filter(Boolean).join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
}
export function meetingExport(detail: MeetingDetail) {
  return [meetingTitle(detail.session), `${new Date(detail.session.startedAt).toLocaleString()} · ${formatSessionTime(detail.session.liveSeconds)}`,
    '', 'Overview', detail.report?.summary || 'No generated summary.', '', 'Action items', ...(detail.report?.actionItems ?? []),
    '', 'Discussion points', ...(detail.report?.notes ?? []), '', 'Notes and decisions', ...detail.captures.filter(c => c.kind !== 'potential_memory').map(c => `${c.kind}: ${c.text}`),
    '', 'Transcript', ...detail.transcript.map(s => `[${formatSessionTime(transcriptOffsetMs(s.startedAtMs, detail.session.startedAt) / 1000)}] ${s.speaker === 'candidate' ? 'You' : 'Room / other speaker'}: ${s.text}`),
    '', 'AI conversation', ...detail.interactions.flatMap(i => [i.question, i.suggestion.expandedAnswer || i.suggestion.answer]),
  ].join('\n');
}

export type RecordingState = 'inactive' | 'starting' | 'recording' | 'paused' | 'processing' | 'completed' | 'error';
export type RecordingEvent = 'start' | 'connected' | 'pause' | 'finish' | 'saved' | 'fail' | 'reset';
const transitions: Record<RecordingState, Partial<Record<RecordingEvent, RecordingState>>> = {
  inactive: { start: 'starting' }, starting: { connected: 'recording', pause: 'paused', fail: 'error' },
  recording: { pause: 'paused', finish: 'processing', fail: 'error' },
  paused: { start: 'starting', finish: 'processing', reset: 'inactive' },
  processing: { saved: 'completed', fail: 'error' },
  completed: { reset: 'inactive', start: 'starting' },
  error: { start: 'starting', finish: 'processing', reset: 'inactive', pause: 'paused' },
};
export function recordingTransition(state: RecordingState, event: RecordingEvent): RecordingState {
  return transitions[state][event] ?? state;
}
