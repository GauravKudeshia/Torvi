'use client';

import { useEffect, useRef, useState } from 'react';
import { AudioLines, BookOpenText, Camera, ChevronDown, ChevronLeft, ClipboardList, Copy, List, MessageCircleQuestion, Mic, MicOff, MonitorUp, RefreshCw, Save, Send, Sparkles, Trash2 } from 'lucide-react';
import {
  isLikelyInterviewQuestion,
  isLikelyTranscriptNoise,
  mergeTranscriptFragments,
  transcriptFingerprint,
  type InterviewMode,
  type ResponseMode,
  type ResponseStyle,
  type Suggestion,
  type TranscriptSegment,
} from '@interview-copilot/contracts';

type SessionMeta = { id: string; mode: InterviewMode; locale: 'en' | 'es' | 'fr' | 'de' | 'hi' };
type SessionContext = {
  session: SessionMeta;
  target: { role: string; company: string | null; jobDescription: string | null } | null;
  documents: Array<{ id: string; fileName: string; kind: string; parseStatus: string }>;
};
type View = 'assist' | 'follow-ups' | 'recap';
type AudioChannel = 'interviewer' | 'candidate';
type ActiveChannels = Record<AudioChannel, boolean>;
type AudioDiagnostic = { level: number; source: string; muted: boolean; lastAudibleAt: number | null };
type AudioDiagnostics = Record<AudioChannel, AudioDiagnostic>;
type RealtimeCredential = { clientSecret?: string; endpoint?: string; clientTurnDetection?: boolean; error?: { message?: string } };
type PendingQuestionTurn = { parts: string[]; openedAt: number; timer: number | null };
type DesktopLink = { code: string; expiresAt: number };

const responseModes: Array<{ key: ResponseMode; label: string }> = [
  { key: 'concise', label: 'Short' },
  { key: 'standard', label: 'Medium' },
  { key: 'detailed', label: 'Detailed' },
];

const responseStyles: Array<{ key: ResponseStyle; label: string }> = [
  { key: 'adaptive', label: 'Smart' },
  { key: 'bullets', label: 'Points' },
  { key: 'paragraph', label: 'Paragraph' },
];

const emptyDiagnostics = (): AudioDiagnostics => ({
  interviewer: { level: 0, source: 'No laptop source', muted: false, lastAudibleAt: null },
  candidate: { level: 0, source: 'No microphone', muted: false, lastAudibleAt: null },
});

function captureError(error: unknown, channel: AudioChannel) {
  if (!(error instanceof Error)) return 'Audio capture could not start. Please retry.';
  if (error.name === 'NotAllowedError') {
    return channel === 'interviewer'
      ? 'Audio sharing was cancelled or blocked. Click Listen to laptop audio, choose the tab/window/screen playing sound, and enable Share audio.'
      : 'Microphone access is blocked. Allow this site in your browser microphone settings, then retry.';
  }
  if (error.name === 'NotFoundError') return 'No usable audio source was found. Check your microphone or choose a different shared source.';
  if (error.name === 'NotReadableError') return 'macOS or another app blocked the audio device. Check System Settings → Privacy & Security, then retry.';
  if (error.name === 'InvalidStateError') return 'Click the audio button again before choosing what to share.';
  if (error.name === 'AbortError') return 'The live audio connection timed out. Please retry.';
  return error.message;
}

export function LiveSession({ sessionId }: { sessionId: string }) {
  const [status, setStatus] = useState('Ready — choose an audio source');
  const [question, setQuestion] = useState('Tell me about a time you aligned teams around a difficult decision.');
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [streamingAnswer, setStreamingAnswer] = useState('');
  const [showExpandedAnswer, setShowExpandedAnswer] = useState(false);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [activeChannels, setActiveChannels] = useState<ActiveChannels>({ interviewer: false, candidate: false });
  const [startingChannel, setStartingChannel] = useState<AudioChannel | null>(null);
  const [analysis, setAnalysis] = useState('');
  const [captureText, setCaptureText] = useState('');
  const [view, setView] = useState<View>('assist');
  const [autoAssist, setAutoAssist] = useState(true);
  const [responseMode, setResponseMode] = useState<ResponseMode>('concise');
  const [responseStyle, setResponseStyle] = useState<ResponseStyle>('adaptive');
  const [mode, setMode] = useState<InterviewMode>('behavioral');
  const [locale, setLocale] = useState<SessionMeta['locale']>('en');
  const [finishing, setFinishing] = useState(false);
  const [context, setContext] = useState<SessionContext | null>(null);
  const [desktopLink, setDesktopLink] = useState<DesktopLink | null>(null);
  const [linkingDesktop, setLinkingDesktop] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState<Record<AudioChannel, string>>({ interviewer: '', candidate: '' });
  const [diagnostics, setDiagnostics] = useState<AudioDiagnostics>(emptyDiagnostics);
  const connectionsRef = useRef<Partial<Record<AudioChannel, RTCPeerConnection>>>({});
  const streamsRef = useRef<Partial<Record<AudioChannel, MediaStream>>>({});
  const partialsRef = useRef<Record<AudioChannel, Record<string, string>>>({ interviewer: {}, candidate: {} });
  const audioContextsRef = useRef<Partial<Record<AudioChannel, AudioContext>>>({});
  const monitorFramesRef = useRef<Partial<Record<AudioChannel, number>>>({});
  const eventsRef = useRef<Partial<Record<AudioChannel, RTCDataChannel>>>({});
  const levelsRef = useRef<Record<AudioChannel, number>>({ interviewer: 0, candidate: 0 });
  const segmentsRef = useRef<TranscriptSegment[]>([]);
  const configRef = useRef({ mode, locale, responseMode, responseStyle });
  const autoAssistRef = useRef(autoAssist);
  const lastAutoQuestionRef = useRef({ key: '', at: 0 });
  const recentTranscriptRef = useRef<Record<AudioChannel, { key: string; at: number }>>({
    interviewer: { key: '', at: 0 }, candidate: { key: '', at: 0 },
  });
  const pendingQuestionRef = useRef<PendingQuestionTurn>({ parts: [], openedAt: 0, timer: null });
  const suggestionAbortRef = useRef<AbortController | null>(null);
  const suggestionRequestRef = useRef(0);
  const active = activeChannels.interviewer || activeChannels.candidate;

  useEffect(() => { autoAssistRef.current = autoAssist; }, [autoAssist]);
  useEffect(() => { configRef.current = { mode, locale, responseMode, responseStyle }; }, [mode, locale, responseMode, responseStyle]);
  useEffect(() => {
    fetch(`/api/v1/sessions/${sessionId}`).then(async (response) => response.ok ? await response.json() as SessionContext : null)
      .then((payload) => {
        if (payload) {
          setContext(payload);
          setMode(payload.session.mode);
          setLocale(payload.session.locale);
        }
      }).catch(() => undefined);
  }, [sessionId]);

  useEffect(() => {
    fetch('/api/v1/memory/communication-profile').then(async (response) => response.ok ? await response.json() as { communicationProfile?: { preferredAnswerLength: ResponseMode; bulletPreference: 'progressive' | 'bullets' | 'narrative' } } : {})
      .then((payload) => {
        const profile = payload.communicationProfile;
        if (!profile) return;
        setResponseMode(profile.preferredAnswerLength === 'tiny' ? 'concise' : profile.preferredAnswerLength);
        setResponseStyle(profile.bulletPreference === 'bullets' ? 'bullets' : profile.bulletPreference === 'narrative' ? 'paragraph' : 'adaptive');
      }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!active) return;
    const interval = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, [active]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        askCoach().catch(() => undefined);
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  });

  useEffect(() => () => {
    if (pendingQuestionRef.current.timer) window.clearTimeout(pendingQuestionRef.current.timer);
    suggestionAbortRef.current?.abort();
    Object.values(streamsRef.current).forEach((stream) => stream?.getTracks().forEach((track) => track.stop()));
    Object.values(connectionsRef.current).forEach((connection) => connection?.close());
    Object.values(monitorFramesRef.current).forEach((frame) => frame && window.cancelAnimationFrame(frame));
    Object.values(audioContextsRef.current).forEach((audioContext) => audioContext?.close().catch(() => undefined));
  }, []);

  function scheduleQuestionFlush(delayMs: number) {
    if (pendingQuestionRef.current.timer) window.clearTimeout(pendingQuestionRef.current.timer);
    pendingQuestionRef.current.timer = window.setTimeout(() => flushPendingQuestionTurn(), delayMs);
  }

  function flushPendingQuestionTurn(force = false) {
    const pending = pendingQuestionRef.current;
    if (pending.timer) window.clearTimeout(pending.timer);
    pending.timer = null;
    if (!pending.parts.length) return;
    if (!force && levelsRef.current.interviewer > 0.018 && Date.now() - pending.openedAt < 4_000) {
      scheduleQuestionFlush(450);
      return;
    }

    const mergedQuestion = mergeTranscriptFragments(pending.parts);
    pendingQuestionRef.current = { parts: [], openedAt: 0, timer: null };
    const currentConfig = configRef.current;
    if (!isLikelyInterviewQuestion(mergedQuestion, currentConfig.locale)) {
      setStatus('Listening for the next question');
      return;
    }

    setQuestion(mergedQuestion);
    setStatus('Question detected — preparing your answer');
    const key = transcriptFingerprint(mergedQuestion);
    const previous = lastAutoQuestionRef.current;
    if (autoAssistRef.current && key && (key !== previous.key || Date.now() - previous.at > 20_000)) {
      lastAutoQuestionRef.current = { key, at: Date.now() };
      askCoach(mergedQuestion, segmentsRef.current);
    } else if (!autoAssistRef.current) {
      setStatus('Question detected — press Ask AI when ready');
    } else {
      setStatus('Repeated question detected — keeping the current answer');
    }
  }

  function handleRealtimeEvent(channel: AudioChannel, raw: string) {
    let payload: Record<string, unknown>;
    try { payload = JSON.parse(raw) as Record<string, unknown>; } catch { return; }
    if (payload.type === 'error') {
      const realtimeError = payload.error && typeof payload.error === 'object' ? payload.error as Record<string, unknown> : null;
      setStatus(typeof realtimeError?.message === 'string' ? realtimeError.message : 'The realtime service reported an error.');
      return;
    }
    if (payload.type === 'conversation.item.input_audio_transcription.delta' && typeof payload.delta === 'string') {
      const itemId = typeof payload.item_id === 'string' ? payload.item_id : 'active';
      partialsRef.current[channel][itemId] = `${partialsRef.current[channel][itemId] ?? ''}${payload.delta}`;
      setPartialTranscript((current) => ({ ...current, [channel]: partialsRef.current[channel][itemId] }));
      setStatus(channel === 'interviewer' ? 'Hearing the interviewer…' : 'Hearing your answer…');
      return;
    }
    if (payload.type !== 'conversation.item.input_audio_transcription.completed' || typeof payload.transcript !== 'string') return;
    const transcript = payload.transcript.trim();
    const completedItemId = typeof payload.item_id === 'string' ? payload.item_id : 'active';
    delete partialsRef.current[channel][completedItemId];
    setPartialTranscript((current) => ({ ...current, [channel]: '' }));
    if (isLikelyTranscriptNoise(transcript)) {
      setStatus(channel === 'interviewer' ? 'Ignored non-speech audio — still listening' : 'Ignored non-speech microphone audio');
      return;
    }
    const now = Date.now();
    const transcriptKey = transcriptFingerprint(transcript);
    const recent = recentTranscriptRef.current[channel];
    if (transcriptKey && transcriptKey === recent.key && now - recent.at < 4_000) return;
    recentTranscriptRef.current[channel] = { key: transcriptKey, at: now };
    if (channel === 'candidate') flushPendingQuestionTurn(true);
    const segment: TranscriptSegment = {
      id: crypto.randomUUID(), speaker: channel, text: transcript,
      startedAtMs: now, endedAtMs: now + 1, final: true,
      itemId: typeof payload.item_id === 'string' ? payload.item_id : undefined,
    };
    const next = [...segmentsRef.current, segment];
    segmentsRef.current = next;
    setSegments(next);
    if (channel === 'interviewer') {
      const pending = pendingQuestionRef.current;
      if (!pending.parts.length) pending.openedAt = now;
      pending.parts.push(transcript);
      setStatus('Interviewer turn detected — listening for the end…');
      scheduleQuestionFlush(/[?？]\s*$/.test(transcript) ? 700 : 1_100);
    } else {
      setStatus('Your answer was transcribed');
    }
  }

  function startAudioMonitor(channel: AudioChannel, media: MediaStream, sourceLabel: string, clientTurnDetection: boolean) {
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.65;
    audioContext.createMediaStreamSource(media).connect(analyser);
    audioContextsRef.current[channel] = audioContext;
    setDiagnostics((current) => ({ ...current, [channel]: { ...current[channel], source: sourceLabel, lastAudibleAt: Date.now() } }));
    const samples = new Uint8Array(analyser.fftSize);
    let lastUpdate = 0;
    let speechStartedAt: number | null = null;
    let silenceStartedAt: number | null = null;
    let lastCommitAt = 0;

    const commitTurn = (timestamp: number) => {
      const events = eventsRef.current[channel];
      if (!events || events.readyState !== 'open' || timestamp - lastCommitAt < 500) return;
      events.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
      lastCommitAt = timestamp;
      speechStartedAt = null;
      silenceStartedAt = null;
    };

    const measure = (timestamp: number) => {
      analyser.getByteTimeDomainData(samples);
      let energy = 0;
      for (const sample of samples) {
        const normalized = (sample - 128) / 128;
        energy += normalized * normalized;
      }
      const level = Math.min(1, Math.sqrt(energy / samples.length) * 4.5);
      levelsRef.current[channel] = level;
      if (clientTurnDetection) {
        const audible = level > (channel === 'interviewer' ? 0.018 : 0.025);
        if (audible) {
          speechStartedAt ??= timestamp;
          silenceStartedAt = null;
        } else if (speechStartedAt !== null) {
          silenceStartedAt ??= timestamp;
          if (timestamp - silenceStartedAt > (channel === 'interviewer' ? 750 : 900)) commitTurn(timestamp);
        }
        if (speechStartedAt !== null && timestamp - speechStartedAt > 18_000) commitTurn(timestamp);
      }
      if (timestamp - lastUpdate > 120) {
        lastUpdate = timestamp;
        setDiagnostics((current) => ({
          ...current,
          [channel]: {
            ...current[channel],
            source: sourceLabel,
            level,
            lastAudibleAt: level > 0.025 ? Date.now() : current[channel].lastAudibleAt,
          },
        }));
      }
      monitorFramesRef.current[channel] = window.requestAnimationFrame(measure);
    };
    monitorFramesRef.current[channel] = window.requestAnimationFrame(measure);
  }

  function stopAudioMonitor(channel: AudioChannel) {
    const frame = monitorFramesRef.current[channel];
    if (frame) window.cancelAnimationFrame(frame);
    delete monitorFramesRef.current[channel];
    delete eventsRef.current[channel];
    audioContextsRef.current[channel]?.close().catch(() => undefined);
    delete audioContextsRef.current[channel];
    partialsRef.current[channel] = {};
    levelsRef.current[channel] = 0;
    setPartialTranscript((current) => ({ ...current, [channel]: '' }));
    setDiagnostics((current) => ({ ...current, [channel]: emptyDiagnostics()[channel] }));
  }

  async function startAudio(channel: AudioChannel) {
    if (connectionsRef.current[channel] || startingChannel) return;
    let media: MediaStream | null = null;
    let connection: RTCPeerConnection | null = null;
    let selectedSourceLabel = channel === 'interviewer' ? 'Shared laptop audio' : 'Microphone';
    try {
      if (!window.isSecureContext || !navigator.mediaDevices) throw new Error('Live audio requires a secure Chrome or Edge window.');
      setStartingChannel(channel);
      if (channel === 'interviewer') {
        if (!navigator.mediaDevices.getDisplayMedia) throw new Error('This browser cannot share laptop audio. Open this page in the latest Chrome or Edge.');
        setStatus('Choose the tab, window, or screen playing the interview and enable Share audio…');
        media = await navigator.mediaDevices.getDisplayMedia({
          video: { displaySurface: 'browser' },
          audio: { suppressLocalAudioPlayback: false },
          preferCurrentTab: false,
          selfBrowserSurface: 'exclude',
          systemAudio: 'include',
          surfaceSwitching: 'include',
        } as unknown as DisplayMediaStreamOptions);
        if (!media.getAudioTracks().length) {
          media.getTracks().forEach((track) => track.stop());
          throw new Error('The selected source did not share audio. Retry, choose the YouTube/interview tab or screen, and turn on Share audio.');
        }
        const surface = media.getVideoTracks()[0]?.getSettings().displaySurface;
        const audioLabel = media.getAudioTracks()[0]?.label;
        selectedSourceLabel = audioLabel || (surface ? `Shared ${surface}` : 'Shared laptop audio');
        setDiagnostics((current) => ({ ...current, interviewer: { ...current.interviewer, source: selectedSourceLabel } }));
        media.getVideoTracks().forEach((track) => { track.enabled = false; });
      } else {
        setStatus('Requesting microphone permission…');
        media = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        selectedSourceLabel = media.getAudioTracks()[0]?.label || 'Microphone';
      }

      setStatus('Creating a secure realtime connection…');
      connection = new RTCPeerConnection();
      connection.addTrack(media.getAudioTracks()[0], media);
      const events = connection.createDataChannel('oai-events');
      eventsRef.current[channel] = events;
      events.onmessage = (event) => handleRealtimeEvent(channel, event.data as string);
      connection.onconnectionstatechange = () => {
        if (connection?.connectionState === 'failed') stopChannel(channel, 'The live connection was interrupted. Retry this audio source.');
        else if (connection?.connectionState === 'disconnected') setStatus('Reconnecting live audio…');
      };

      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      const credentialResponse = await fetch(`/api/v1/sessions/${sessionId}/realtime`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channel, clientTurnDetection: true }),
      });
      const credential = await credentialResponse.json() as RealtimeCredential;
      if (!credentialResponse.ok) throw new Error(credential.error?.message ?? 'Realtime connection failed.');
      if (!credential.clientSecret) throw new Error('The realtime session credential was missing.');

      const sdpResponse = await fetch(credential.endpoint ?? 'https://api.openai.com/v1/realtime/calls', {
        method: 'POST', body: offer.sdp,
        headers: { authorization: `Bearer ${credential.clientSecret}`, 'content-type': 'application/sdp' },
        signal: AbortSignal.timeout(30_000),
      });
      const answerSdp = await sdpResponse.text();
      if (!sdpResponse.ok) throw new Error('OpenAI could not establish the live audio channel. Please retry.');
      await connection.setRemoteDescription({ type: 'answer', sdp: answerSdp });

      connectionsRef.current[channel] = connection;
      streamsRef.current[channel] = media;
      const audioTrack = media.getAudioTracks()[0];
      const sourceLabel = audioTrack.label || selectedSourceLabel;
      audioTrack.addEventListener('mute', () => setDiagnostics((current) => ({ ...current, [channel]: { ...current[channel], muted: true } })));
      audioTrack.addEventListener('unmute', () => setDiagnostics((current) => ({ ...current, [channel]: { ...current[channel], muted: false } })));
      startAudioMonitor(channel, media, sourceLabel, credential.clientTurnDetection === true);
      const endMessage = channel === 'interviewer' ? 'Shared laptop audio stopped.' : 'Microphone stopped.';
      media.getTracks().forEach((track) => track.addEventListener('ended', () => stopChannel(channel, endMessage), { once: true }));
      setActiveChannels((current) => ({ ...current, [channel]: true }));
      setStatus(channel === 'interviewer' ? 'Listening to laptop audio for questions' : 'Listening to your microphone');
    } catch (error) {
      media?.getTracks().forEach((track) => track.stop());
      connection?.close();
      delete eventsRef.current[channel];
      setStatus(captureError(error, channel));
    } finally {
      setStartingChannel(null);
    }
  }

  function stopChannel(channel: AudioChannel, nextStatus = 'Audio source paused') {
    const media = streamsRef.current[channel];
    const connection = connectionsRef.current[channel];
    delete streamsRef.current[channel];
    delete connectionsRef.current[channel];
    media?.getTracks().forEach((track) => track.stop());
    connection?.close();
    stopAudioMonitor(channel);
    setActiveChannels((current) => ({ ...current, [channel]: false }));
    const otherChannel: AudioChannel = channel === 'interviewer' ? 'candidate' : 'interviewer';
    setStatus(connectionsRef.current[otherChannel]
      ? (otherChannel === 'interviewer' ? 'Listening to laptop audio for questions' : 'Listening to your microphone')
      : nextStatus);
  }

  function stopAllAudio() {
    if (pendingQuestionRef.current.timer) window.clearTimeout(pendingQuestionRef.current.timer);
    pendingQuestionRef.current = { parts: [], openedAt: 0, timer: null };
    suggestionAbortRef.current?.abort();
    suggestionRequestRef.current += 1;
    (['interviewer', 'candidate'] as AudioChannel[]).forEach((channel) => {
      const media = streamsRef.current[channel];
      const connection = connectionsRef.current[channel];
      delete streamsRef.current[channel];
      delete connectionsRef.current[channel];
      media?.getTracks().forEach((track) => track.stop());
      connection?.close();
      stopAudioMonitor(channel);
    });
    setActiveChannels({ interviewer: false, candidate: false });
    setStatus('Paused');
  }

  async function askCoach(nextQuestion = question, nextSegments = segmentsRef.current, action: 'answer' | 'regenerate' | 'simplify' | 'natural' | 'explain' | 'example' | 'key-points' | 'action-items' | 'follow-up' = 'answer') {
    if (nextQuestion.trim().length < 2) return setStatus('Add a question first.');
    suggestionAbortRef.current?.abort();
    const controller = new AbortController();
    suggestionAbortRef.current = controller;
    const requestId = ++suggestionRequestRef.current;
    const currentConfig = configRef.current;
    setStatus('Thinking…');
    setStreamingAnswer('');
    setView('assist');
    try {
      const response = await fetch(`/api/v1/sessions/${sessionId}/suggestions`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          question: nextQuestion,
          mode: currentConfig.mode,
          locale: currentConfig.locale,
          responseMode: currentConfig.responseMode,
          responseStyle: currentConfig.responseStyle,
          action,
          transcript: nextSegments,
          verifiedFacts: [],
          target: {},
        }),
        signal: controller.signal,
      });
      if (requestId !== suggestionRequestRef.current) return;
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({})) as { error?: { message?: string } };
        setStatus(payload.error?.message ?? 'The coach is unavailable.');
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalSuggestion: Suggestion | null = null;
      const consume = (block: string) => {
        const type = block.split(/\r?\n/).find((line) => line.startsWith('event:'))?.slice(6).trim();
        const data = block.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
        if (!type || !data) return;
        const payload = JSON.parse(data) as { delta?: string; suggestion?: Suggestion; message?: string };
        if (type === 'suggestion.delta' && payload.delta) setStreamingAnswer((current) => current + payload.delta);
        if (type === 'suggestion.final' && payload.suggestion) finalSuggestion = payload.suggestion;
        if (type === 'suggestion.error') throw new Error(payload.message ?? 'The coach could not complete this answer.');
      };
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() ?? '';
        blocks.forEach(consume);
      }
      buffer += decoder.decode();
      if (buffer.trim()) consume(buffer);
      if (requestId !== suggestionRequestRef.current) return;
      const completedSuggestion = finalSuggestion as Suggestion | null;
      if (completedSuggestion) {
        setSuggestion(completedSuggestion);
        setStreamingAnswer('');
        setShowExpandedAnswer(false);
        setStatus(completedSuggestion.grounded ? 'Grounded answer ready' : 'Answer frame ready — add your facts');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (requestId === suggestionRequestRef.current) setStatus('The coach was interrupted. Use Ask AI to retry.');
    } finally {
      if (suggestionAbortRef.current === controller) suggestionAbortRef.current = null;
    }
  }

  async function analyzeVisibleScreen() {
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const video = document.createElement('video');
      video.srcObject = display;
      await video.play();
      await new Promise((resolve) => setTimeout(resolve, 350));
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d')?.drawImage(video, 0, 0);
      display.getTracks().forEach((track) => track.stop());
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
      if (!blob) throw new Error('Could not capture the selected screen.');
      const form = new FormData();
      form.set('image', blob, 'screen.jpg');
      setStatus('Analyzing selected screen…');
      const response = await fetch(`/api/v1/sessions/${sessionId}/screen-context`, { method: 'POST', body: form });
      const payload = await response.json() as { analysis?: string; error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? 'Screen analysis failed.');
      setAnalysis(payload.analysis ?? '');
      setStatus('Transient screen analysis ready');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Screen sharing was cancelled.');
    }
  }

  async function captureMeeting(kind: 'note' | 'decision' | 'action' | 'bookmark') {
    const text = captureText.trim() || segmentsRef.current.at(-1)?.text || question.trim();
    if (!text) return setStatus('Add a note or wait for a conversation turn first.');
    const response = await fetch(`/api/v1/sessions/${sessionId}/captures`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, text }),
    });
    if (!response.ok) return setStatus('The meeting item could not be captured.');
    setCaptureText('');
    setStatus(`${kind[0].toUpperCase()}${kind.slice(1)} captured`);
  }

  async function createDesktopLink() {
    setLinkingDesktop(true);
    try {
      const response = await fetch(`/api/v1/sessions/${sessionId}/desktop-link`, { method: 'POST' });
      const payload = await response.json() as DesktopLink & { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? 'Could not create a Mac connection code.');
      setDesktopLink({ code: payload.code, expiresAt: payload.expiresAt });
      setStatus('Mac connection code ready — enter it in the desktop app');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not create a Mac connection code.');
    } finally {
      setLinkingDesktop(false);
    }
  }

  async function close(choice: 'save' | 'discard') {
    setFinishing(true);
    stopAllAudio();
    await fetch(`/api/v1/sessions/${sessionId}/end`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ liveSeconds: seconds }) });
    const response = await fetch(`/api/v1/sessions/${sessionId}/${choice}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: choice === 'save' ? JSON.stringify({ segments }) : undefined,
    });
    if (!response.ok) { setFinishing(false); setStatus('Could not finish the session. Try again.'); return; }
    window.location.href = choice === 'save' ? '/reports' : '/dashboard';
  }

  const recap = segments.length
    ? segments.slice(-6).map((segment) => `${segment.speaker === 'candidate' ? 'You' : 'Interviewer'}: ${segment.text}`)
    : ['Start laptop audio or your microphone to build a live recap.'];

  return <main className="live-shell">
    <header className="live-top"><a href="/dashboard"><ChevronLeft size={17} /> Dashboard</a><div><i className={active ? 'active' : ''} />{status}</div><time>{String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</time></header>
    <section className="live-workspace">
      <aside className="live-transcript"><div className="transcript-head"><span className="section-kicker">Live transcript</span><span>{segments.length} turns</span></div>{segments.length ? segments.map((segment) => <div key={segment.id}><b>{segment.speaker === 'candidate' ? 'You' : 'Interviewer'}</b><p>{segment.text}</p></div>) : <div className="transcript-empty"><AudioLines size={22} /><p>Start laptop audio to detect YouTube or interview questions automatically. Nothing is saved until you choose Save.</p></div>}{partialTranscript.interviewer && <div className="partial-turn"><b>Interviewer · live</b><p>{partialTranscript.interviewer}<i /></p></div>}{partialTranscript.candidate && <div className="partial-turn"><b>You · live</b><p>{partialTranscript.candidate}<i /></p></div>}</aside>
      <section className="live-answer">
        <div className="live-answer-head"><div><Sparkles size={17} /><span>Realtime copilot</span></div><div className="live-answer-status">{suggestion && <span className={`confidence ${suggestion.confidence}`}>{suggestion.confidence} confidence</span>}<span className="privacy-badge">Ephemeral</span></div></div>
        <div className="live-context-bar"><span><b>{context?.target?.role ?? 'Interview'}</b>{context?.target?.company ? ` at ${context.target.company}` : ''}</span><span><BookOpenText size={13} /> {(context?.documents.length ?? 0) + (context?.target?.jobDescription ? 1 : 0)} grounding sources</span><button type="button" onClick={createDesktopLink} disabled={linkingDesktop}><MonitorUp size={13} /> {linkingDesktop ? 'Creating…' : 'Connect Mac app'}</button></div>
        {desktopLink && <div className="desktop-link-card"><div><span>One-time Mac connection code</span><strong>{desktopLink.code}</strong><small>Expires at {new Date(desktopLink.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. The desktop app only receives access to this interview session.</small></div><button type="button" onClick={() => navigator.clipboard.writeText(desktopLink.code)}><Copy size={15} /> Copy</button></div>}
        {!activeChannels.interviewer && <div className="web-audio-guide"><MonitorUp size={18} /><div><b>For YouTube, Meet, or any browser interview</b><span>Click <strong>Listen to laptop audio</strong>, select the tab/window/screen playing sound, and enable <strong>Share audio</strong>. Questions are then detected and answered automatically.</span></div></div>}
        {active && <div className="audio-health" aria-label="Live audio health">{(['interviewer', 'candidate'] as AudioChannel[]).filter((channel) => activeChannels[channel]).map((channel) => { const diagnostic = diagnostics[channel]; const silent = diagnostic.lastAudibleAt !== null && Date.now() - diagnostic.lastAudibleAt > 7_000; return <div key={channel} className={diagnostic.muted || silent ? 'warning' : ''}><span>{channel === 'interviewer' ? <MonitorUp size={13} /> : <Mic size={13} />}<b>{channel === 'interviewer' ? 'Laptop audio' : 'Microphone'}</b></span><div className="level-track"><i style={{ width: `${Math.max(3, Math.round(diagnostic.level * 100))}%` }} /></div><small>{diagnostic.muted ? 'Source is muted' : silent ? 'Connected, but no sound detected' : diagnostic.source}</small></div>; })}</div>}
        <nav className="live-tabs"><button className={view === 'assist' ? 'active' : ''} onClick={() => setView('assist')}>Assist</button><button className={view === 'follow-ups' ? 'active' : ''} onClick={() => setView('follow-ups')}>Follow-ups</button><button className={view === 'recap' ? 'active' : ''} onClick={() => setView('recap')}>Recap</button></nav>
        {view === 'assist' && <><div className="live-response-controls"><div className="response-mode-row"><span>Style</span><div>{responseStyles.map((option) => <button key={option.key} className={responseStyle === option.key ? 'active' : ''} onClick={() => setResponseStyle(option.key)}>{option.label}</button>)}</div></div><div className="response-mode-row"><span>Length</span><div>{responseModes.map((option) => <button key={option.key} className={responseMode === option.key ? 'active' : ''} onClick={() => setResponseMode(option.key)}>{option.label}</button>)}</div></div></div><div className="question-box"><label htmlFor="question">Detected or typed question</label><textarea id="question" value={question} onChange={(event) => setQuestion(event.target.value)} /></div>{suggestion && suggestion.recommendation !== 'answer' && <div className={`answer-recommendation recommendation-${suggestion.recommendation}`}><b>{suggestion.recommendation === 'clarify_first' ? 'Clarify first' : suggestion.recommendation === 'closest_verified_example' ? 'Closest real experience' : 'No verified personal example found'}</b><span>{suggestion.clarificationSuggestion ?? 'Use a truthful general answer without presenting it as personal history.'}</span></div>}<article className="suggestion-copy"><span>{responseStyle === 'bullets' ? 'Point answer' : responseStyle === 'paragraph' ? 'Paragraph answer' : 'Smart answer'}</span><p className={streamingAnswer ? 'streaming' : ''}>{streamingAnswer || suggestion?.directAnswer || suggestion?.answer || 'Start laptop audio for automatic question detection, or ask the coach manually. Your response will stream here as it is generated.'}</p></article>{suggestion?.supportingPoints?.length || suggestion?.bullets?.length ? <div className={`suggestion-points progressive-points ${responseStyle === 'bullets' ? 'primary-points' : ''}`}><b>{responseStyle === 'bullets' ? 'Conversational points' : 'Supporting points'}</b>{(suggestion.supportingPoints.length ? suggestion.supportingPoints : suggestion.bullets).map((bullet) => <span key={bullet}>{bullet}</span>)}</div> : null}{suggestion?.expandedAnswer && <div className="expanded-answer"><button onClick={() => setShowExpandedAnswer((current) => !current)}>{responseMode === 'detailed' ? 'Full response' : 'Expand answer'} <ChevronDown size={14} className={showExpandedAnswer ? 'open' : ''} /></button>{showExpandedAnswer && <p>{suggestion.expandedAnswer}</p>}</div>}{suggestion && <div className="context-actions" aria-label="Context-aware response actions"><button onClick={() => askCoach(question, segmentsRef.current, 'regenerate')}><RefreshCw size={13} /> Regenerate</button><button onClick={() => askCoach(question, segmentsRef.current, 'simplify')}>Simplify</button><button onClick={() => askCoach(question, segmentsRef.current, 'natural')}>More natural</button><button onClick={() => askCoach(question, segmentsRef.current, mode === 'meeting' ? 'action-items' : 'key-points')}><List size={13} /> {mode === 'meeting' ? 'Action items' : 'Key points'}</button><button onClick={() => askCoach(question, segmentsRef.current, 'follow-up')}>Follow-up</button></div>}{suggestion && <div className="grounding-summary"><div><span>Grounding</span><b>{suggestion.grounding.level} · {suggestion.grounding.verifiedClaimIds.length} verified {suggestion.grounding.verifiedClaimIds.length === 1 ? 'claim' : 'claims'}</b></div><div><span>Challengeability</span><b>{suggestion.challengeability.label.replaceAll('_', ' ')}</b></div></div>}{suggestion?.citations?.length ? <div className="answer-sources"><div><BookOpenText size={14} /><b>Why this answer</b></div>{suggestion.citations.map((citation) => <article key={citation.documentId}><span>{citation.kind === 'resume' ? 'Verified resume' : citation.kind === 'job-description' ? 'Job description' : 'Supporting source'}</span><b>{citation.label}</b><p>{citation.excerpt}</p></article>)}</div> : null}{suggestion?.grounding.unsupportedElements.length ? <p className="grounding-caution">Needs evidence: {suggestion.grounding.unsupportedElements.join(' · ')}</p> : suggestion?.caution ? <p className="grounding-caution">{suggestion.caution}</p> : null}{analysis && <article className="screen-analysis"><b>Visible screen context</b><p>{analysis}</p></article>}{mode === 'meeting' && <div className="meeting-capture"><label htmlFor="capture-text">Capture from this conversation</label><input id="capture-text" value={captureText} onChange={(event) => setCaptureText(event.target.value)} placeholder="Type a note, or leave blank to use the latest turn" /><div><button onClick={() => captureMeeting('note')}>Note</button><button onClick={() => captureMeeting('decision')}>Decision</button><button onClick={() => captureMeeting('action')}>Action item</button><button onClick={() => captureMeeting('bookmark')}>Bookmark</button></div></div>}<div className="live-actions"><button onClick={() => askCoach()}><Send size={15} /> Ask AI <kbd>⌘↵</kbd></button><button onClick={analyzeVisibleScreen}><Camera size={15} /> Analyze screen</button>{suggestion && <button onClick={() => navigator.clipboard.writeText(responseStyle === 'bullets' ? (suggestion.supportingPoints.length ? suggestion.supportingPoints : suggestion.bullets).map((point) => `• ${point}`).join('\n') : suggestion.expandedAnswer || suggestion.answer || suggestion.directAnswer)}><Copy size={15} /> Copy</button>}</div></>}
        {view === 'follow-ups' && <div className="copilot-list"><MessageCircleQuestion size={23} /><h2>Likely follow-up questions</h2>{suggestion?.likelyFollowUps?.length ? suggestion.likelyFollowUps.map((item) => <button key={item.question} onClick={() => { setQuestion(item.question); setView('assist'); }}><span>{item.type.replaceAll('_', ' ')}</span>{item.question}</button>) : suggestion?.followUps?.length ? suggestion.followUps.map((item) => <button key={item} onClick={() => { setQuestion(item); setView('assist'); }}>{item}</button>) : <p>Ask the coach once and likely follow-ups will appear here.</p>}</div>}
        {view === 'recap' && <div className="copilot-list recap-list"><ClipboardList size={23} /><h2>Conversation recap</h2>{recap.map((item) => <p key={item}>{item}</p>)}</div>}
      </section>
    </section>
    <footer className="live-controls"><div className="capture-controls"><button className={activeChannels.interviewer ? 'source-control active' : 'source-control'} disabled={startingChannel !== null && startingChannel !== 'interviewer'} onClick={() => activeChannels.interviewer ? stopChannel('interviewer') : startAudio('interviewer')}>{activeChannels.interviewer ? <MicOff /> : <MonitorUp />}</button><div><span>{startingChannel === 'interviewer' ? 'Opening audio picker…' : activeChannels.interviewer ? 'Stop laptop audio' : 'Listen to laptop audio'}</span><small>YouTube · Meet · Teams · Zoom · Webex</small></div><button className={activeChannels.candidate ? 'source-control mic-source active' : 'source-control mic-source'} disabled={startingChannel !== null && startingChannel !== 'candidate'} onClick={() => activeChannels.candidate ? stopChannel('candidate') : startAudio('candidate')}>{activeChannels.candidate ? <MicOff /> : <Mic />}</button><div><span>{startingChannel === 'candidate' ? 'Opening microphone…' : activeChannels.candidate ? 'Stop my microphone' : 'Add my microphone'}</span><label><input type="checkbox" checked={autoAssist} onChange={(event) => setAutoAssist(event.target.checked)} /> Auto-answer detected questions</label></div></div><div className="retention-actions"><button disabled={finishing} onClick={() => close('discard')}><Trash2 size={15} /> Discard</button><button disabled={finishing} className="save" onClick={() => close('save')}><Save size={15} /> {finishing ? 'Finishing…' : 'Save, notes & finish'}</button></div></footer>
  </main>;
}
