import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFile } from 'node:fs/promises';
import { assistantProfiles, formatSessionTime, groupMeetings, matchesMeeting, meetingExport, meetingTitle, recordingTransition, type MeetingDetail } from '../packages/sdk/src/meetings';
import { InterviewCopilotClient } from '../packages/sdk/src/index';
import { MeetingHome } from '../apps/desktop/src/meeting-home';
import { LiveTranscript } from '../apps/desktop/src/live-transcript';
import { themes } from '../packages/design-tokens/src/index';

const noop = () => undefined;
const sample = { id: 'one', title: 'Launch review', mode: 'meeting', status: 'completed', startedAt: new Date(2026, 8, 26, 9).getTime(), liveSeconds: 120 };

test('meetings group by local calendar days, sort newest first, and keep input unchanged', () => {
  const older = { ...sample, id: 'older', startedAt: new Date(2026, 8, 24, 23).getTime() };
  const yesterday = { ...sample, id: 'yesterday', startedAt: new Date(2026, 8, 25, 23, 59).getTime() };
  const items = [older, sample, yesterday];
  const groups = groupMeetings(items, new Date(2026, 8, 26, 12));
  assert.deepEqual(groups.map(g => g.label), ['Today', 'Yesterday', 'Earlier']);
  assert.deepEqual(groups.flatMap(g => g.meetings.map(m => m.id)), ['one', 'yesterday', 'older']);
  assert.equal(items[0], older);
});

test('meeting labels, search and timers tolerate missing or unusual values', () => {
  assert.equal(meetingTitle({ mode: 'sales', title: ' ', role: 'Discovery' }), 'Discovery');
  assert.equal(meetingTitle({ mode: 'system-design' }), 'system design session');
  assert.equal(matchesMeeting({ ...sample, company: 'Northwind' }, ' northWIND '), true);
  assert.equal(matchesMeeting(sample, 'unrelated'), false);
  assert.equal(formatSessionTime(3601.9), '60:01');
  assert.equal(formatSessionTime(-1), '00:00');
  assert.equal(formatSessionTime(NaN), '00:00');
  assert.equal(new Set(assistantProfiles.map(p => p.id)).size, assistantProfiles.length);
});

test('recording transitions cover pause/resume, save retry and late transport events', () => {
  let state = recordingTransition('inactive', 'start');
  state = recordingTransition(state, 'connected');
  assert.equal(state, 'recording');
  state = recordingTransition(state, 'pause');
  assert.equal(state, 'paused');
  assert.equal(recordingTransition(state, 'connected'), 'paused');
  state = recordingTransition(recordingTransition(state, 'start'), 'connected');
  state = recordingTransition(state, 'finish');
  assert.equal(state, 'processing');
  assert.equal(recordingTransition(state, 'pause'), 'processing');
  state = recordingTransition(state, 'fail');
  state = recordingTransition(state, 'finish');
  assert.equal(recordingTransition(state, 'saved'), 'completed');
});

test('desktop home renders coherent history and actionable honest empty states', () => {
  const props = { sessions: [sample], upcoming: [], recording: false, sourceCount: 2, mode: 'meeting' as const, onMode: noop, onStart: noop, onOpenLive: noop, onOpenSession: noop, onHistory: noop, onContext: noop, onReadiness: noop, onPrepare: noop };
  const html = renderToStaticMarkup(React.createElement(MeetingHome, props));
  assert.match(html, /Launch review/); assert.match(html, /02:00/);
  assert.match(html, /Assistant mode/); assert.match(html, /Check audio &amp; permissions/);
  const empty = renderToStaticMarkup(React.createElement(MeetingHome, { ...props, sessions: [] }));
  assert.match(empty, /Start your first session/); assert.match(empty, /Calendar sync isn’t connected/);
});

test('full live workspace renders paused and listening states without losing transcript', () => {
  const props = { segments: [{ id: 't1', speaker: 'candidate' as const, text: 'Agree the launch date.', startedAtMs: 1000, endedAtMs: 2000, final: true }], active: false, seconds: 61, title: 'Release planning', onAssistant: noop, onPause: noop, onFinish: noop, busy: false };
  const paused = renderToStaticMarkup(React.createElement(LiveTranscript, props));
  assert.match(paused, /Audio paused/); assert.match(paused, /01:01/); assert.match(paused, /Agree the launch date/); assert.match(paused, /Resume listening/);
  const recording = renderToStaticMarkup(React.createElement(LiveTranscript, { ...props, active: true }));
  assert.match(recording, /Pause listening/); assert.match(recording, /Search live transcript/);
});

test('sharing combines one meeting record without exposing unapproved memory suggestions', () => {
  const detail: MeetingDetail = { session: sample, target: null, documents: [], transcript: [], interactions: [], report: null, captures: [{ id: 'n', kind: 'note', text: 'Confirmed date', createdAt: 0 }, { id: 'p', kind: 'potential_memory', text: 'Not approved', createdAt: 0 }] };
  const exported = meetingExport(detail);
  assert.match(exported, /Launch review/); assert.match(exported, /Confirmed date/); assert.match(exported, /AI conversation/); assert.doesNotMatch(exported, /Not approved/);
});

test('meeting SDK uses existing APIs and bounds usage reporting', async () => {
  const original = globalThis.fetch;
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => { calls.push({ path: new URL(String(input)).pathname, init }); return new Response(JSON.stringify({ id: 'new', sessions: [] }), { status: 200 }); };
  try {
    const client = new InterviewCopilotClient('https://torvi.example', async () => null);
    await client.sessions(); await client.renameMeeting('abc', 'Review'); await client.createMeetingContext('Planning'); await client.end('abc', 99999);
    assert.deepEqual(calls.map(c => c.path), ['/api/v1/sessions', '/api/v1/sessions/abc', '/api/v1/job-targets', '/api/v1/sessions/abc/end']);
    assert.equal(JSON.parse(String(calls[2].init?.body)).company, 'Personal workspace');
    assert.equal(JSON.parse(String(calls[3].init?.body)).liveSeconds, 28800);
    assert.ok(calls.every(c => c.init?.signal));
  } finally { globalThis.fetch = original; }
});

test('mobile capture has foreground cleanup, retained failed saves, native sharing and record controls', async () => {
  const hook = await readFile(new URL('../apps/mobile/src/use-meeting-session.ts', import.meta.url), 'utf8');
  const live = await readFile(new URL('../apps/mobile/src/live-session.tsx', import.meta.url), 'utf8');
  const detail = await readFile(new URL('../apps/mobile/src/meeting-detail.tsx', import.meta.url), 'utf8');
  assert.match(hook, /AppState.addEventListener/); assert.match(hook, /getTracks\(\).forEach\(track => track.stop\(\)\)/);
  assert.match(hook, /Your transcript remains in this open app/);
  for (const text of ['AI chat', 'Transcript', 'Pause', 'Resume', 'End session', 'Assist']) assert.ok(live.includes(text));
  assert.match(detail, /Share.share/); assert.match(detail, /renameMeeting/);
});

test('semantic text colors maintain WCAG AA contrast on their primary surfaces', () => {
  const luminance = (hex: string) => {
    const channels = hex.slice(1).match(/../g)!.map(c => parseInt(c, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  };
  for (const theme of Object.values(themes)) for (const foreground of [theme.text, theme.secondary, theme.tertiary, theme.accent]) for (const background of [theme.background, theme.surface]) {
    const a = luminance(foreground), b = luminance(background);
    assert.ok((Math.max(a, b) + .05) / (Math.min(a, b) + .05) >= 4.5, `${foreground} on ${background}`);
  }
});
