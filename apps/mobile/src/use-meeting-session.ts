import React from 'react';
import { AppState } from 'react-native';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import { mediaDevices, RTCPeerConnection, RTCSessionDescription } from 'react-native-webrtc';
import { isLikelyTranscriptNoise, suggestionSchema, type InterviewMode, type ResponseStyle, type SavedInteraction, type TranscriptSegment } from '@interview-copilot/contracts';
import { assistantActions, recordingTransition, type RecordingEvent, type RecordingState } from '@interview-copilot/sdk';
import { api } from './auth';

export type MobileInteraction = { id: string; question: string; answer: string };
type RoomStream = Awaited<ReturnType<typeof mediaDevices.getUserMedia>>;
const message = (error: unknown) => error instanceof Error ? error.message : 'Check your connection and try again.';

export function useMeetingSession() {
  const [state, dispatch] = React.useReducer(recordingTransition, 'inactive' as RecordingState);
  const [sessionId, setSessionId] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [segments, setSegments] = React.useState<TranscriptSegment[]>([]);
  const [interactions, setInteractions] = React.useState<MobileInteraction[]>([]);
  const [error, setError] = React.useState('');
  const [seconds, setSeconds] = React.useState(0);
  const [asking, setAsking] = React.useState(false);
  const [speaking, setSpeaking] = React.useState(false);
  const [hasEnded, setHasEnded] = React.useState(false);
  const [responseStyle, setResponseStyle] = React.useState<ResponseStyle>('adaptive');
  const peer = React.useRef<RTCPeerConnection | null>(null);
  const stream = React.useRef<RoomStream | null>(null);
  const currentId = React.useRef('');
  const currentMode = React.useRef<InterviewMode>('meeting');
  const transcript = React.useRef<TranscriptSegment[]>([]);
  const savedInteractions = React.useRef<SavedInteraction[]>([]);
  const generation = React.useRef(0);
  const busy = React.useRef(false);
  const saving = React.useRef(false);
  const ended = React.useRef(false);
  const alive = React.useRef(true);
  const askGeneration = React.useRef(0);
  const accumulated = React.useRef(0);
  const recordingSince = React.useRef<number | null>(null);
  const sessionSince = React.useRef(0);
  const requestAbort = React.useRef<AbortController | null>(null);
  const emit = (event: RecordingEvent) => { if (alive.current) dispatch(event); };
  const elapsed = React.useCallback(() => accumulated.current + (recordingSince.current === null ? 0 : Date.now() - recordingSince.current), []);
  const releaseAudio = React.useCallback(() => {
    generation.current += 1; requestAbort.current?.abort(); requestAbort.current = null;
    accumulated.current = elapsed(); recordingSince.current = null;
    peer.current?.close(); peer.current = null;
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
    if (alive.current) { setSeconds(Math.floor(accumulated.current / 1000)); setSpeaking(false); }
  }, [elapsed]);
  const pause = React.useCallback(() => { releaseAudio(); if (currentId.current && alive.current) dispatch('pause'); }, [releaseAudio]);
  React.useEffect(() => {
    alive.current = true;
    const listener = AppState.addEventListener('change', next => {
      if (next !== 'active' && (stream.current || busy.current)) { pause(); if (currentId.current) setError('Recording paused because Torvi left the foreground. Return and tap Resume.'); }
    });
    const timer = setInterval(() => { if (recordingSince.current !== null) setSeconds(Math.floor(elapsed() / 1000)); }, 1000);
    return () => { alive.current = false; askGeneration.current += 1; releaseAudio(); listener.remove(); clearInterval(timer); };
  }, [elapsed, pause, releaseAudio]);

  async function connectAudio(id: string) {
    const intent = ++generation.current;
    const isCurrent = () => alive.current && generation.current === intent && currentId.current === id;
    let acquired: RoomStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let permissionTimedOut = false;
    try {
      const acquisition = mediaDevices.getUserMedia({ audio: true, video: false });
      acquired = await Promise.race([
        acquisition.then(value => { if (!isCurrent()) { value.getTracks().forEach(track => track.stop()); throw new Error('Recording start cancelled.'); } return value; }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => { if (isCurrent()) { permissionTimedOut = true; generation.current++; } reject(new Error('Microphone permission timed out. Enable microphone access and retry.')); }, 20000); }),
      ]);
      clearTimeout(timer);
      if (!isCurrent()) { acquired.getTracks().forEach(track => track.stop()); return; }
      stream.current = acquired;
      const connection = new RTCPeerConnection(); peer.current = connection;
      acquired.getTracks().forEach(track => connection.addTrack(track, acquired!));
      const events = connection.createDataChannel('oai-events');
      events.onmessage = (event: { data: unknown }) => {
        if (!isCurrent()) return;
        try {
          const data = JSON.parse(String(event.data)) as { type?: string; transcript?: string; item_id?: string };
          if (data.type === 'error' || data.type === 'conversation.item.input_audio_transcription.failed') {
            releaseAudio(); emit('fail'); setError('Transcription stopped. Your text is still here. Tap Resume to reconnect.'); return;
          }
          if (data.type === 'input_audio_buffer.speech_started') { setSpeaking(true); return; }
          if (data.type === 'input_audio_buffer.speech_stopped') { setSpeaking(false); return; }
          if (data.type !== 'conversation.item.input_audio_transcription.completed' || !data.transcript?.trim() || isLikelyTranscriptNoise(data.transcript)) return;
          if (transcript.current.some(segment => data.item_id && segment.itemId === data.item_id)) return;
          if (transcript.current.length >= 2000) { pause(); setError('This session reached its transcript limit. End and save before starting another.'); return; }
          const time = Math.max(0, Date.now() - sessionSince.current);
          const segment: TranscriptSegment = { id: Crypto.randomUUID(), itemId: data.item_id, speaker: 'interviewer', text: data.transcript.trim().slice(0, 12000), startedAtMs: time, endedAtMs: time, final: true };
          transcript.current = [...transcript.current, segment]; setSegments(transcript.current);
        } catch { /* Ignore malformed transport messages; never log meeting content. */ }
      };
      connection.onconnectionstatechange = () => {
        if (!isCurrent()) return;
        if (connection.connectionState === 'connected') {
          recordingSince.current ??= Date.now(); clearTimeout(timer); emit('connected');
        } else if (['failed', 'disconnected', 'closed'].includes(connection.connectionState)) {
          releaseAudio(); emit('fail'); setError('Audio connection interrupted. Your transcript is still here. Tap Resume to reconnect.');
        }
      };
      timer = setTimeout(() => { if (isCurrent()) { releaseAudio(); emit('fail'); setError('Audio did not connect. Check your network and tap Resume.'); } }, 25000);
      const offer = await connection.createOffer(); await connection.setLocalDescription(offer);
      const lease = await api.realtime(id, 'interviewer');
      if (!isCurrent()) return;
      const controller = new AbortController(); requestAbort.current = controller;
      const response = await fetch(lease.endpoint, { method: 'POST', headers: { authorization: `Bearer ${lease.clientSecret}`, 'content-type': 'application/sdp' }, body: offer.sdp, signal: controller.signal });
      if (!response.ok) throw new Error('Audio could not connect. Check your network and retry.');
      const sdp = await response.text();
      if (isCurrent()) await connection.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));
    } catch (failure) {
      clearTimeout(timer);
      if (isCurrent() || (permissionTimedOut && generation.current === intent + 1 && alive.current)) {
        releaseAudio(); if (alive.current) { emit('fail'); setError(message(failure)); }
      }
    }
  }

  async function start(mode: InterviewMode = 'meeting', context?: { jobTargetId: string; documentIds: string[] }) {
    if (busy.current || saving.current) return;
    busy.current = true; setError(''); emit('start');
    try {
      if (ended.current) throw new Error('This session has ended. Save or discard it before starting another.');
      if (!currentId.current) {
        const nextTitle = `${mode === 'mock' ? 'Practice' : 'Conversation'} · ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
        const targetId = context?.jobTargetId ?? (await api.createMeetingContext(nextTitle)).id;
        if (!alive.current) return;
        const result = await api.startSession({ mode, locale: 'en', jobTargetId: targetId, documentIds: context?.documentIds ?? [], deviceId: Constants.sessionId ?? 'mobile', retentionChoice: 'ask-at-end', consent: { recordingAllowed: true, aiAssistanceAllowed: true, policyVersion: '2026-09-26' } });
        currentId.current = result.id; currentMode.current = mode; sessionSince.current = Date.now();
        if (!alive.current) return;
        setSessionId(result.id); setTitle(nextTitle); transcript.current = []; savedInteractions.current = []; setSegments([]); setInteractions([]); accumulated.current = 0; setSeconds(0);
      }
      if (!alive.current || AppState.currentState !== 'active') { emit('pause'); return; }
      await connectAudio(currentId.current);
    } catch (failure) { if (alive.current) { emit('fail'); setError(message(failure)); } }
    finally { busy.current = false; }
  }
  async function ask(question: string = assistantActions[0].prompt) {
    if (!currentId.current || saving.current || question.trim().length < 2) return;
    if (ended.current) { setError('This session has ended. Save it before asking another question.'); return; }
    if (savedInteractions.current.length >= 200) { setError('Save this session before requesting more answers; its AI history limit has been reached.'); return; }
    const intent = ++askGeneration.current; setAsking(true); setError('');
    try {
      const body = await api.suggest(currentId.current, { question, mode: currentMode.current, locale: 'en', responseMode: 'concise', responseStyle, action: 'answer', transcript: transcript.current.slice(-80), verifiedFacts: [], verifiedMemory: [], target: {} });
      let answer = '';
      let completed: SavedInteraction | null = null;
      for (const block of body.split(/\r?\n\r?\n/)) {
        const data = block.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
        if (!data || data === '[DONE]') continue;
        const event = JSON.parse(data);
        if (event.type === 'error' || event.type === 'suggestion.error') throw new Error(event.message || 'The response failed. Retry your question.');
        if (event.suggestion) { const suggestion = suggestionSchema.parse(event.suggestion); completed = { id: Crypto.randomUUID(), question, suggestion, createdAt: Date.now() }; answer = responseStyle === 'bullets' ? (suggestion.supportingPoints.length ? suggestion.supportingPoints : suggestion.bullets).map(point => `• ${point}`).join('\n') || suggestion.answer : suggestion.expandedAnswer || suggestion.answer; }
      }
      if (!answer) throw new Error('The answer was incomplete. Please retry.');
      if (alive.current && askGeneration.current === intent && completed) { savedInteractions.current.push(completed); setInteractions(current => [...current, { id: completed!.id, question, answer }]); }
    } catch (failure) { if (alive.current && intent === askGeneration.current) setError(message(failure)); }
    finally { if (alive.current && intent === askGeneration.current) setAsking(false); }
  }
  async function finish(choice: 'save' | 'discard') {
    if (!currentId.current || saving.current || busy.current) return null;
    saving.current = true; askGeneration.current++; setAsking(false); releaseAudio(); emit('finish'); setError('');
    const id = currentId.current;
    try {
      await api.end(id, Math.floor(accumulated.current / 1000)); ended.current = true; if (alive.current) setHasEnded(true);
      if (choice === 'save') await api.save(id, transcript.current, savedInteractions.current); else await api.discard(id);
      currentId.current = ''; transcript.current = []; savedInteractions.current = []; ended.current = false;
      if (alive.current) { setSessionId(''); setSegments([]); setInteractions([]); setHasEnded(false); emit('saved'); }
      return choice === 'save' ? id : '';
    } catch (failure) { if (alive.current) { emit('fail'); setError(`Could not ${choice}. Your transcript remains in this open app. ${message(failure)}`); } return null; }
    finally { saving.current = false; }
  }
  return { state, sessionId, title, segments, interactions, error, seconds, asking, speaking, responseStyle, setResponseStyle, start, pause, ask, finish, ended: hasEnded };
}
