import React from 'react';
import ReactDOM from 'react-dom/client';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  interviewModes,
  isLikelyInterviewQuestion,
  isLikelyTranscriptNoise,
  modeRequiresVerifiedResume,
  shouldReviseQuestion,
  transcriptFingerprint,
  type InterviewMode,
  type ResponseStyle,
  type Suggestion,
  type TranscriptSegment,
} from '@interview-copilot/contracts';
import {
  chunkLevel,
  createSystemAudioBridge,
  decodeAudioChunk,
  type AudioChunk,
  type SystemAudioBridge,
} from './system-audio-bridge';
import { ControlCenter, type DesktopAccount, type NativeSessionContext } from './control-center';
import { AssistantOverlay, type AssistantPanelState } from './assistant-overlay';
import { desktopApi } from './desktop-api';
import { ShortcutManager, type ShortcutConflict } from './shortcuts';
import {
  DEFAULT_ASSISTANT_PREFERENCES,
  DEFAULT_DESKTOP_PREFERENCES,
  DEFAULT_SHORTCUT_PREFERENCES,
  MIN_ASSISTANT_OPACITY,
  WindowStateManager,
  clampAssistantOpacity,
  type AssistantPreferences,
  type AssistantSize,
  type DesktopPreferences,
  type Density,
  type ShortcutAction,
  type ShortcutPreferences,
} from './window-state';
import './styles.css';
import './audio-status.css';
import './window-controls.css';
import './control-center.css';
import './assistant-overlay.css';
import './experience.css';

type Surface = 'workspace' | 'live';
type AnswerLayer = 'five' | 'twenty' | 'sixty' | 'deep';
type TranscriptView = 'hidden' | 'compact' | 'expanded';
type Channel = 'interviewer' | 'candidate';
type SystemAudioState = 'unknown' | 'checking' | 'permissionRequired' | 'restartRequired' | 'authorized' | 'starting' | 'running' | 'captureFailed';
type CaptureIntent = 'idle' | 'starting' | 'stopping';
type SystemAudioDiagnostics = {
  bundleIdentifier: string; appVersion: string; executablePath: string; macosVersion: string; preflightGranted: boolean;
  requestInitiated: boolean; signingIdentity: string; teamIdentifier: string | null; cdHash: string | null;
  designatedRequirement: string | null; signingStable: boolean; lastStage: string; logPath: string;
};
type SystemAudioStatus = { state: SystemAudioState; permissionGranted: boolean; captureActive: boolean; reason: string; diagnostics: SystemAudioDiagnostics | null };
type SystemAudioFailure = { state: SystemAudioState; category: string; message: string; stage: string; domain?: string | null; code?: number | null };
type RealtimeCredential = { clientSecret: string; endpoint: string; clientTurnDetection: boolean };
type SessionContext = NativeSessionContext;
type MemoryCandidate = { claimId: string; experienceId: string; experienceTitle: string; company?: string | null; role?: string | null; claimText: string; claimType: string; evidenceExcerpt?: string | null };
type SessionBrainResponse = { sourceVersion: string; brain: { verifiedMemory: MemoryCandidate[]; evidenceCoverage: Array<{ competency: string; strength: string }>; openConcerns: Array<{ id: string; category: string; summary: string }>; likelyQuestions: string[] } };
type MeetingCapture = { id: string; kind: string; text: string; owner?: string | null; createdAt: number };
type PipelineMetrics = {
  source: 'partial' | 'final' | 'manual'; audioReceivedAt?: number; transcriptFirstDeltaAt?: number;
  questionDetectedAt?: number; suggestionRequestedAt?: number; firstTokenAt?: number; renderedAt?: number;
  completedAt?: number; retrievalLatencyMs?: number;
};
type SuggestionChunk = { requestId: string; bytes: number[] };
type SuggestionStreamEvent = { type: string; requestId: string; delta?: string; suggestion?: Suggestion; message?: string; retrievalLatencyMs?: number };
type ScreenContextImage = { bytes: number[]; contentType: string };
type ActiveSuggestion = { requestId: string; question: string; parser: SuggestionSseParser; metrics: PipelineMetrics };

class SuggestionSseParser {
  private readonly decoder = new TextDecoder();
  private buffer = '';

  feed(bytes: number[], consume: (event: SuggestionStreamEvent) => void) {
    this.buffer += this.decoder.decode(new Uint8Array(bytes), { stream: true });
    const blocks = this.buffer.split(/\r?\n\r?\n/);
    this.buffer = blocks.pop() ?? '';
    blocks.forEach((block) => this.consumeBlock(block, consume));
  }

  finish(consume: (event: SuggestionStreamEvent) => void) {
    this.buffer += this.decoder.decode();
    if (this.buffer.trim()) this.consumeBlock(this.buffer, consume);
    this.buffer = '';
  }

  private consumeBlock(block: string, consume: (event: SuggestionStreamEvent) => void) {
    const data = block.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
    if (!data || data === '[DONE]') return;
    try { consume(JSON.parse(data) as SuggestionStreamEvent); } catch { /* wait for the next valid SSE event */ }
  }
}

function elapsed(from?: number, to?: number) {
  return from != null && to != null ? Math.max(0, Math.round(to - from)) : null;
}

const desktopAppVersion = '0.6.1';
const desktopPreview = import.meta.env.MODE === 'preview' && new URLSearchParams(window.location.search).has('preview');
const previewParams = new URLSearchParams(window.location.search);
const desktopPreviewLive = desktopPreview && previewParams.get('surface') === 'live';
const desktopPreviewFocus = desktopPreviewLive && previewParams.get('focus') === '1';
const desktopPreviewDensity: Density = previewParams.get('density') === 'minimal' ? 'minimal' : previewParams.get('density') === 'compact' ? 'compact' : 'comfortable';
const desktopPreviewPreferences: AssistantPreferences = {
  appearanceMode: ['dark', 'light', 'adaptive', 'glass'].includes(previewParams.get('appearance') ?? '') ? previewParams.get('appearance') as AssistantPreferences['appearanceMode'] : DEFAULT_ASSISTANT_PREFERENCES.appearanceMode,
  assistantSize: ['compact', 'standard', 'expanded'].includes(previewParams.get('size') ?? '') ? previewParams.get('size') as AssistantSize : DEFAULT_ASSISTANT_PREFERENCES.assistantSize,
  responseStyle: ['adaptive', 'bullets', 'paragraph'].includes(previewParams.get('format') ?? '') ? previewParams.get('format') as ResponseStyle : DEFAULT_ASSISTANT_PREFERENCES.responseStyle,
  windowOpacity: clampAssistantOpacity(Number(previewParams.get('opacity') ?? DEFAULT_ASSISTANT_PREFERENCES.windowOpacity)),
};
const answerLayers: Array<{ id: AnswerLayer; label: string; hint: string }> = [
  { id: 'five', label: '5 sec', hint: 'Direct' }, { id: 'twenty', label: '20 sec', hint: 'Talking points' },
  { id: 'sixty', label: '60 sec', hint: 'Full example' }, { id: 'deep', label: 'Go deeper', hint: 'Evidence + trade-offs' },
];

const initialSystemAudioStatus: SystemAudioStatus = { state: 'unknown', permissionGranted: false, captureActive: false, reason: 'System audio has not been checked yet.', diagnostics: null };

function nativeAudioFailure(error: unknown): SystemAudioFailure | null {
  if (!error || typeof error !== 'object') return null;
  const value = error as Record<string, unknown>;
  if (typeof value.message !== 'string' || typeof value.state !== 'string') return null;
  return { state: value.state as SystemAudioState, category: typeof value.category === 'string' ? value.category : 'capture', message: value.message, stage: typeof value.stage === 'string' ? value.stage : 'unknown', domain: typeof value.domain === 'string' ? value.domain : null, code: typeof value.code === 'number' ? value.code : null };
}

function realtimeFailure(error: unknown) {
  if (error instanceof DOMException && error.name === 'NotAllowedError') return 'Microphone permission was denied. System audio can still run; enable the microphone in macOS settings when ready.';
  const nativeFailure = nativeAudioFailure(error);
  if (nativeFailure) return nativeFailure.message;
  return error instanceof Error ? error.message : String(error);
}

function statusCopy(value: string) { return value.replaceAll('_', ' ').replaceAll('-', ' '); }
function eventTimestamp() { return Date.now(); }

function App() {
  const [surface, setSurface] = React.useState<Surface>(desktopPreviewLive ? 'live' : 'workspace');
  const [active, setActive] = React.useState(false);
  const [density, setDensity] = React.useState<Density>(desktopPreviewDensity);
  const [context, setContext] = React.useState<SessionContext | null>(desktopPreview ? {
    session: { id: 'preview-session', mode: 'general', locale: 'en', status: 'prepared' },
    target: { id: 'preview-target', role: 'Weekly product sync', company: 'Northstar', jobDescription: 'Clarify launch decisions, ownership, and next steps.' },
    documents: [{ id: 'preview-notes', fileName: 'Product brief.pdf', kind: 'other', parseStatus: 'ready' }],
  } : null);
  const [account, setAccount] = React.useState<DesktopAccount | null>(desktopPreview ? { tokenExpiresAt: 4_102_444_800_000, deviceId: 'preview-device', scope: 'account' } : null);
  const [question, setQuestion] = React.useState(desktopPreviewLive ? 'How should I explain the launch trade-off and confirm the next step?' : 'Ask anything about your screen or conversation…');
  const [partial, setPartial] = React.useState('');
  const [suggestion, setSuggestion] = React.useState<Suggestion | null>(null);
  const [streamingAnswer, setStreamingAnswer] = React.useState(desktopPreviewLive ? 'Lead with the decision, name the trade-off plainly, and close by confirming the owner and deadline: “We are protecting launch quality by narrowing scope today; I’ll share the revised plan by 3 PM, and we’ll confirm readiness tomorrow.”' : '');
  const [suggestionLoading, setSuggestionLoading] = React.useState(false);
  const [pipelineMetrics, setPipelineMetrics] = React.useState<PipelineMetrics>({ source: 'manual' });
  const [answerLayer, setAnswerLayer] = React.useState<AnswerLayer>('five');
  const [lastResponseMode, setLastResponseMode] = React.useState('concise');
  const [status, setStatus] = React.useState(desktopPreview ? 'Desktop interface preview' : 'Opening Torvi');
  const [level, setLevel] = React.useState(0);
  const [micLevel, setMicLevel] = React.useState(0);
  const [micConnected, setMicConnected] = React.useState(false);
  const [sourceVerified, setSourceVerified] = React.useState(false);
  const [systemAudio, setSystemAudio] = React.useState<SystemAudioStatus>(desktopPreviewLive ? { ...initialSystemAudioStatus, state: 'authorized', permissionGranted: true, reason: 'System audio is ready.' } : initialSystemAudioStatus);
  const [droppedChunks, setDroppedChunks] = React.useState(0);
  const [seconds, setSeconds] = React.useState(0);
  const [finishing, setFinishing] = React.useState(false);
  const [captureIntent, setCaptureIntent] = React.useState<CaptureIntent>('idle');
  const [segments, setSegments] = React.useState<TranscriptSegment[]>([]);
  const [transcriptView, setTranscriptView] = React.useState<TranscriptView>('compact');
  const [brain, setBrain] = React.useState<SessionBrainResponse | null>(null);
  const [online, setOnline] = React.useState(navigator.onLine);
  const [reconnectAttempts, setReconnectAttempts] = React.useState<Record<Channel, number>>({ interviewer: 0, candidate: 0 });
  const [focusMode, setFocusMode] = React.useState(desktopPreviewFocus);
  const [privateOverlay, setPrivateOverlay] = React.useState(false);
  const [screenContextEnabled, setScreenContextEnabled] = React.useState(false);
  const [copilotMode, setCopilotMode] = React.useState<InterviewMode>('general');
  const [clickThrough, setClickThrough] = React.useState(false);
  const [assistantPreferences, setAssistantPreferences] = React.useState<AssistantPreferences>(desktopPreview ? desktopPreviewPreferences : DEFAULT_ASSISTANT_PREFERENCES);
  const [assistantPanelState, setAssistantPanelState] = React.useState<AssistantPanelState>('collapsed');
  const [assistantFocusRequest, setAssistantFocusRequest] = React.useState(0);
  const [shortcuts, setShortcuts] = React.useState<ShortcutPreferences>(DEFAULT_SHORTCUT_PREFERENCES);
  const [shortcutConflicts, setShortcutConflicts] = React.useState<ShortcutConflict[]>([]);
  const [desktopPreferences, setDesktopPreferences] = React.useState<DesktopPreferences>(DEFAULT_DESKTOP_PREFERENCES);
  const responseStyle = assistantPreferences.responseStyle;
  const [screenAnalysis, setScreenAnalysis] = React.useState('');
  const [screenAnalyzing, setScreenAnalyzing] = React.useState(false);
  const [captureText, setCaptureText] = React.useState('');
  const [captures, setCaptures] = React.useState<MeetingCapture[]>([]);
  const [captureNotice, setCaptureNotice] = React.useState('');
  const activeRef = React.useRef(false);
  const captureBusyRef = React.useRef(false);
  const nativeCaptureStartedRef = React.useRef(false);
  const contextRef = React.useRef<SessionContext | null>(null);
  const questionRef = React.useRef(question);
  const segmentsRef = React.useRef<TranscriptSegment[]>([]);
  const channelsRef = React.useRef<Partial<Record<Channel, { peer: RTCPeerConnection; events: RTCDataChannel }>>>({});
  const systemAudioBridgeRef = React.useRef<SystemAudioBridge | null>(null);
  const micStreamRef = React.useRef<MediaStream | null>(null);
  const micMonitorRef = React.useRef<{ audioContext: AudioContext; frame: number } | null>(null);
  const partialsRef = React.useRef<Record<Channel, Record<string, string>>>({ interviewer: {}, candidate: {} });
  const lastQuestionRef = React.useRef({ key: '', text: '', at: 0 });
  const lastNativeAudioAtRef = React.useRef(0);
  const partialMetricItemRef = React.useRef('');
  const partialQuestionTimerRef = React.useRef<number | null>(null);
  const activeSuggestionRef = React.useRef<ActiveSuggestion | null>(null);
  const windowStateRef = React.useRef<WindowStateManager | null>(null);
  const shortcutManagerRef = React.useRef(new ShortcutManager());
  const pipelineMetricsRef = React.useRef<PipelineMetrics>({ source: 'manual' });
  const askRef = React.useRef<(nextQuestion?: string, responseMode?: 'tiny' | 'concise' | 'standard' | 'detailed', source?: PipelineMetrics['source']) => Promise<void>>(async () => undefined);
  const toggleRef = React.useRef<() => Promise<void>>(async () => undefined);
  const focusRef = React.useRef<() => Promise<void>>(async () => undefined);
  const layerRef = React.useRef<(direction: -1 | 1) => void>(() => undefined);
  const opacityRef = React.useRef<(delta: number) => void>(() => undefined);
  const reconnectTimersRef = React.useRef<Partial<Record<Channel, number>>>({});
  const reconnectAttemptRef = React.useRef<Record<Channel, number>>({ interviewer: 0, candidate: 0 });
  const assistantPreferencesRef = React.useRef<AssistantPreferences>(desktopPreview ? desktopPreviewPreferences : DEFAULT_ASSISTANT_PREFERENCES);
  const shortcutsRef = React.useRef<ShortcutPreferences>(DEFAULT_SHORTCUT_PREFERENCES);
  const focusModeRef = React.useRef(desktopPreviewFocus);
  const panelStateRef = React.useRef<AssistantPanelState>('collapsed');

  React.useEffect(() => { contextRef.current = context; }, [context]);
  React.useEffect(() => { questionRef.current = question; }, [question]);
  React.useEffect(() => { segmentsRef.current = segments; }, [segments]);
  React.useEffect(() => { assistantPreferencesRef.current = assistantPreferences; }, [assistantPreferences]);
  React.useEffect(() => { shortcutsRef.current = shortcuts; }, [shortcuts]);
  React.useEffect(() => { focusModeRef.current = focusMode; }, [focusMode]);
  React.useEffect(() => { panelStateRef.current = assistantPanelState; }, [assistantPanelState]);

  function updatePipelineMetrics(next: PipelineMetrics | ((current: PipelineMetrics) => PipelineMetrics)) {
    const value = typeof next === 'function' ? next(pipelineMetricsRef.current) : next;
    pipelineMetricsRef.current = value;
    setPipelineMetrics(value);
  }

  async function restoreConnection() {
    try {
      const [accountState, restored] = await Promise.all([invoke<DesktopAccount | null>('desktop_account_status'), invoke<SessionContext | null>('restore_desktop_connection')]);
      setAccount(accountState);
      if (restored) { setContext(restored); setCopilotMode(restored.session.mode); setStatus('Prepared session restored — open Torvi when ready'); }
      else if (accountState?.scope === 'account') setStatus('Native workspace ready');
      else setStatus('Sign in to open your workspace');
      setSurface('workspace');
    } catch (error) { setStatus(realtimeFailure(error)); }
  }

  async function loadSessionIntelligence(nextContext: SessionContext) {
    try {
      const result = await desktopApi<SessionBrainResponse>('GET', `/api/v1/sessions/${nextContext.session.id}/brain`);
      setBrain(result);
      const captureResult = await desktopApi<{ captures: MeetingCapture[] }>('GET', `/api/v1/sessions/${nextContext.session.id}/captures`);
      setCaptures(captureResult.captures ?? []);
    } catch { setBrain(null); }
  }

  function appendSegment(segment: TranscriptSegment) {
    const next = [...segmentsRef.current, segment];
    segmentsRef.current = next;
    setSegments(next);
  }

  function handleRealtimeEvent(channel: Channel, raw: string) {
    let payload: Record<string, unknown>;
    try { payload = JSON.parse(raw) as Record<string, unknown>; } catch { return; }
    if (payload.type === 'error') {
      const detail = payload.error && typeof payload.error === 'object' ? payload.error as Record<string, unknown> : null;
      setStatus(typeof detail?.message === 'string' ? detail.message : 'The realtime service reported an error. Retrying keeps this session open.');
      scheduleReconnect(channel);
      return;
    }
    if (payload.type === 'conversation.item.input_audio_transcription.delta' && typeof payload.delta === 'string') {
      const itemId = typeof payload.item_id === 'string' ? payload.item_id : 'active';
      const now = eventTimestamp();
      if (channel === 'interviewer' && partialMetricItemRef.current !== itemId) {
        partialMetricItemRef.current = itemId;
        updatePipelineMetrics({
          source: 'partial',
          audioReceivedAt: lastNativeAudioAtRef.current || now,
          transcriptFirstDeltaAt: now,
        });
      }
      partialsRef.current[channel][itemId] = `${partialsRef.current[channel][itemId] ?? ''}${payload.delta}`;
      if (channel === 'interviewer') {
        const transcript = partialsRef.current[channel][itemId];
        setPartial(transcript);
        if (partialQuestionTimerRef.current != null) window.clearTimeout(partialQuestionTimerRef.current);
        if (transcript.trim().split(/\s+/).length >= 4 && isLikelyInterviewQuestion(transcript, contextRef.current?.session.locale ?? 'en')) {
          partialQuestionTimerRef.current = window.setTimeout(() => dispatchDetectedQuestion(transcript, 'partial'), 380);
        }
      }
      setStatus(channel === 'interviewer' ? 'Hearing the other side…' : 'Hearing you…');
      return;
    }
    if (payload.type !== 'conversation.item.input_audio_transcription.completed' || typeof payload.transcript !== 'string') return;
    const transcript = payload.transcript.trim();
    const itemId = typeof payload.item_id === 'string' ? payload.item_id : 'active';
    delete partialsRef.current[channel][itemId];
    if (channel === 'interviewer') {
      setPartial('');
      if (partialQuestionTimerRef.current != null) window.clearTimeout(partialQuestionTimerRef.current);
      partialQuestionTimerRef.current = null;
    }
    if (isLikelyTranscriptNoise(transcript)) return;
    const now = eventTimestamp();
    appendSegment({ id: crypto.randomUUID(), speaker: channel, text: transcript, startedAtMs: now, endedAtMs: now + 1, final: true, itemId: typeof payload.item_id === 'string' ? payload.item_id : undefined });
    if (channel === 'candidate') { setStatus('Your side was transcribed'); return; }
    setQuestion(transcript);
    if (!isLikelyInterviewQuestion(transcript, contextRef.current?.session.locale ?? 'en')) { setStatus('Listening for a completed question'); return; }
    dispatchDetectedQuestion(transcript, 'final');
  }

  function dispatchDetectedQuestion(transcript: string, source: 'partial' | 'final') {
    const now = eventTimestamp();
    const normalized = transcript.trim();
    const key = transcriptFingerprint(normalized);
    if (!key) return;
    const previous = lastQuestionRef.current;
    const revision = source === 'final' && previous.text && now - previous.at < 10_000 && shouldReviseQuestion(previous.text, normalized);
    if (!revision && key === previous.key && now - previous.at <= 20_000) return;
    lastQuestionRef.current = { key, text: normalized, at: now };
    setQuestion(normalized);
    updatePipelineMetrics((current) => ({
      ...(source === 'final' && current.transcriptFirstDeltaAt ? current : {
        source,
        audioReceivedAt: lastNativeAudioAtRef.current || now,
        transcriptFirstDeltaAt: now,
      }),
      source,
      questionDetectedAt: now,
    }));
    setStatus(revision ? 'Request refined — updating the answer' : 'Request detected — reading the live context');
    void askRef.current(normalized, 'concise', source);
  }

  function streamForChannel(channel: Channel): MediaStream | null {
    return channel === 'interviewer' ? systemAudioBridgeRef.current?.stream ?? null : micStreamRef.current;
  }

  function scheduleReconnect(channel: Channel) {
    if (!activeRef.current || reconnectTimersRef.current[channel] || !navigator.onLine) return;
    const attempt = reconnectAttemptRef.current[channel] + 1;
    reconnectAttemptRef.current[channel] = attempt;
    setReconnectAttempts({ ...reconnectAttemptRef.current });
    const waitMs = Math.min(8_000, 700 * 2 ** Math.min(attempt - 1, 4));
    setStatus(`${channel === 'interviewer' ? 'System audio' : 'Microphone'} transcription interrupted — reconnecting automatically (${attempt})`);
    reconnectTimersRef.current[channel] = window.setTimeout(async () => {
      delete reconnectTimersRef.current[channel];
      if (!activeRef.current) return;
      let stream = streamForChannel(channel);
      if (channel === 'candidate' && (!stream || stream.getAudioTracks().every((track) => track.readyState === 'ended'))) {
        try {
          micStreamRef.current?.getTracks().forEach((track) => track.stop());
          stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
          micStreamRef.current = stream; setMicConnected(true);
          if (micMonitorRef.current) { window.cancelAnimationFrame(micMonitorRef.current.frame); void micMonitorRef.current.audioContext.close(); micMonitorRef.current = null; }
          startMicMonitor(stream);
        } catch { setMicConnected(false); stream = null; }
      }
      if (!stream) return;
      try { channelsRef.current[channel]?.peer.close(); delete channelsRef.current[channel]; await connectRealtime(channel, stream); setStatus(`${channel === 'interviewer' ? 'System audio' : 'Microphone'} transcription recovered`); }
      catch { scheduleReconnect(channel); }
    }, waitMs);
  }

  async function connectRealtime(channel: Channel, stream: MediaStream) {
    const credential = await invoke<RealtimeCredential>('desktop_realtime', { channel, clientTurnDetection: false });
    const peer = new RTCPeerConnection();
    const track = stream.getAudioTracks()[0];
    if (!track) throw new Error(`${channel === 'interviewer' ? 'System audio' : 'Microphone'} did not provide an audio track.`);
    peer.addTrack(track, stream);
    const events = peer.createDataChannel('oai-events');
    events.onmessage = (event) => handleRealtimeEvent(channel, event.data as string);
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'connected') { reconnectAttemptRef.current[channel] = 0; setReconnectAttempts({ ...reconnectAttemptRef.current }); }
      if (['failed', 'disconnected'].includes(peer.connectionState)) scheduleReconnect(channel);
    };
    const opened = new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('The realtime channel timed out.')), 20_000);
      events.onopen = () => { window.clearTimeout(timeout); resolve(); };
      events.onerror = () => { window.clearTimeout(timeout); reject(new Error('The realtime event channel failed.')); };
    });
    const offer = await peer.createOffer(); await peer.setLocalDescription(offer);
    const sdp = await fetch(credential.endpoint || 'https://api.openai.com/v1/realtime/calls', { method: 'POST', headers: { authorization: `Bearer ${credential.clientSecret}`, 'content-type': 'application/sdp' }, body: offer.sdp, signal: AbortSignal.timeout(30_000) });
    const answer = await sdp.text();
    if (!sdp.ok) throw new Error('OpenAI could not establish the live transcription channel. The session remains open so you can retry.');
    await peer.setRemoteDescription({ type: 'answer', sdp: answer }); await opened;
    channelsRef.current[channel] = { peer, events };
  }

  function startMicMonitor(stream: MediaStream) {
    const audioContext = new AudioContext(); const analyser = audioContext.createAnalyser(); analyser.fftSize = 256; audioContext.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    const measure = () => { analyser.getByteTimeDomainData(samples); let energy = 0; for (const sample of samples) { const value = (sample - 128) / 128; energy += value * value; } setMicLevel(Math.min(1, Math.sqrt(energy / samples.length) * 4)); const frame = window.requestAnimationFrame(measure); if (micMonitorRef.current) micMonitorRef.current.frame = frame; };
    micMonitorRef.current = { audioContext, frame: window.requestAnimationFrame(measure) };
  }

  async function refreshSystemAudio(announce = false) {
    if (desktopPreview) {
      const next: SystemAudioStatus = { state: 'authorized', permissionGranted: true, captureActive: activeRef.current, reason: activeRef.current ? 'Preview audio is connected.' : 'System audio is ready.', diagnostics: null };
      setSystemAudio(next); if (announce) setStatus(next.reason); return next;
    }
    setSystemAudio((current) => ({ ...current, state: 'checking', reason: 'Checking macOS Screen & System Audio Recording access…' }));
    try { const next = await invoke<SystemAudioStatus>('system_audio_status'); setSystemAudio(next); if (announce) setStatus(next.reason); return next; }
    catch (error) { const message = realtimeFailure(error); const next: SystemAudioStatus = { ...initialSystemAudioStatus, state: 'captureFailed', reason: message }; setSystemAudio(next); if (announce) setStatus(message); return next; }
  }
  async function grantSystemAudio() {
    if (desktopPreview) { const next = { ...initialSystemAudioStatus, state: 'authorized' as const, permissionGranted: true, reason: 'System audio access granted in preview.' }; setSystemAudio(next); setStatus(next.reason); return; }
    setSystemAudio((current) => ({ ...current, state: 'checking', reason: 'Opening the macOS permission request…' })); setStatus('Requesting Screen & System Audio Recording access…');
    try { const next = await invoke<SystemAudioStatus>('request_system_audio_permission'); setSystemAudio(next); setStatus(next.reason); }
    catch (error) { const message = realtimeFailure(error); setSystemAudio((current) => ({ ...current, state: 'captureFailed', reason: message })); setStatus(message); }
  }
  async function repairSystemAudio() {
    if (desktopPreview) { const next = { ...initialSystemAudioStatus, state: 'authorized' as const, permissionGranted: true, reason: 'System audio access repaired in preview.' }; setSystemAudio(next); setStatus(next.reason); return; }
    setStatus('Resetting Torvi’s macOS permission record…');
    try { const next = await invoke<SystemAudioStatus>('repair_system_audio_permission'); setSystemAudio(next); setStatus(next.reason); }
    catch (error) { const message = realtimeFailure(error); setSystemAudio((current) => ({ ...current, state: 'captureFailed', reason: message })); setStatus(message); }
  }
  function applyNativeAudioFailure(failure: SystemAudioFailure) {
    setSystemAudio((current) => ({ ...current, state: failure.state, permissionGranted: failure.state !== 'permissionRequired', captureActive: false, reason: `${failure.message} (${failure.category} · ${failure.stage}${failure.code == null ? '' : ` · ${failure.code}`})` })); setStatus(failure.message);
  }

  async function startCapture() {
    if (!contextRef.current) return setStatus('Prepare a live session in the Mac workspace first.');
    const permission = await refreshSystemAudio();
    if (permission.state === 'permissionRequired') return setStatus('System audio permission is required. Press Grant system audio once.');
    if (permission.state === 'restartRequired') return setStatus('Quit Torvi completely and reopen it before starting system audio.');
    if (desktopPreview) {
      setSystemAudio({ ...permission, state: 'starting', reason: 'Connecting preview audio…' }); setStatus('Connecting preview audio…');
      await new Promise((resolve) => window.setTimeout(resolve, 420));
      activeRef.current = true; setActive(true); setSeconds(0); setSystemAudio({ ...permission, state: 'running', captureActive: true, reason: 'Preview audio is connected.' }); setStatus('Both transcription channels are live');
      return;
    }
    setSystemAudio((current) => ({ ...current, state: 'starting', reason: 'Starting ScreenCaptureKit…' })); setStatus('Starting native system audio…');
    const capability = await invoke<{ systemAudio: boolean; microphone: boolean; backend: string }>('audio_capabilities');
    if (!capability.systemAudio) throw new Error('System audio capture is unavailable on this computer.');
    setSystemAudio(await invoke<SystemAudioStatus>('start_audio_capture', { includeSystemAudio: true })); nativeCaptureStartedRef.current = true;
    const systemAudioBridge = await createSystemAudioBridge(); systemAudioBridgeRef.current = systemAudioBridge;
    await connectRealtime('interviewer', systemAudioBridge.stream);
    activeRef.current = true; setActive(true); setSeconds(0); setSourceVerified(false); setStreamingAnswer(''); updatePipelineMetrics({ source: 'partial' }); setStatus(`System audio transcription connected with ${capability.backend}`);
    try {
      const microphone = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      micStreamRef.current = microphone; setMicConnected(true); startMicMonitor(microphone); await connectRealtime('candidate', microphone); setStatus('Both transcription channels are live');
    } catch (error) { setStatus(`${realtimeFailure(error)} System audio remains live.`); }
  }

  async function stopCapture(nextStatus = 'Live audio paused', failure?: SystemAudioFailure) {
    cancelActiveSuggestion();
    if (!desktopPreview && (activeRef.current || nativeCaptureStartedRef.current || systemAudio.captureActive)) await invoke('stop_audio_capture').catch(() => undefined);
    nativeCaptureStartedRef.current = false;
    activeRef.current = false; setActive(false); setLevel(0); setMicLevel(0); setSourceVerified(false);
    Object.values(reconnectTimersRef.current).forEach((timer) => window.clearTimeout(timer)); reconnectTimersRef.current = {};
    reconnectAttemptRef.current = { interviewer: 0, candidate: 0 }; setReconnectAttempts({ interviewer: 0, candidate: 0 });
    micStreamRef.current?.getTracks().forEach((track) => track.stop()); micStreamRef.current = null; setMicConnected(false);
    if (micMonitorRef.current) { window.cancelAnimationFrame(micMonitorRef.current.frame); void micMonitorRef.current.audioContext.close(); micMonitorRef.current = null; }
    const systemAudioBridge = systemAudioBridgeRef.current; systemAudioBridgeRef.current = null; await systemAudioBridge?.close().catch(() => undefined);
    Object.values(channelsRef.current).forEach((channel) => channel?.peer.close()); channelsRef.current = {};
    if (failure) { applyNativeAudioFailure(failure); return; }
    const nextAudio = await invoke<SystemAudioStatus>('system_audio_status').catch(() => null); if (nextAudio) setSystemAudio(nextAudio); setStatus(nextStatus);
  }
  async function toggleCapture() {
    if (captureBusyRef.current) return;
    captureBusyRef.current = true;
    setCaptureIntent(activeRef.current ? 'stopping' : 'starting');
    try {
      if (activeRef.current) await stopCapture();
      else await startCapture();
    }
    catch (error) { const nativeFailure = nativeAudioFailure(error); await stopCapture(realtimeFailure(error), nativeFailure ?? undefined); }
    finally { captureBusyRef.current = false; setCaptureIntent('idle'); }
  }

  async function runCapturePrimaryAction() {
    if (captureBusyRef.current || finishing) return;
    if (activeRef.current) return toggleCapture();
    if (systemAudio.state === 'permissionRequired') return grantSystemAudio();
    if (systemAudio.state === 'restartRequired') { relaunchApp(); return; }
    if (systemAudio.state === 'captureFailed') { await refreshSystemAudio(true); return; }
    return toggleCapture();
  }

  function emitTiming(event: 'question.detected' | 'transcription.delta' | 'suggestion.first_useful' | 'generation.failed', durationMs: number | null, status: 'ready' | 'warning' | 'failed' | 'success' = 'success') {
    if (desktopPreview || durationMs == null || !contextRef.current) return;
    void desktopApi('POST', '/api/v1/telemetry', {
      event, platform: 'macos', durationMs, status, appVersion: desktopAppVersion,
      locale: contextRef.current.session.locale, mode: contextRef.current.session.mode,
    }).catch(() => undefined);
  }

  function cancelActiveSuggestion() {
    const current = activeSuggestionRef.current;
    if (!current) return;
    activeSuggestionRef.current = null;
    void invoke('cancel_desktop_suggestion', { requestId: current.requestId }).catch(() => undefined);
  }

  function handleSuggestionStreamEvent(event: SuggestionStreamEvent) {
    const current = activeSuggestionRef.current;
    if (!current || event.requestId !== current.requestId) return;
    if (event.type === 'suggestion.started') {
      current.metrics.retrievalLatencyMs = event.retrievalLatencyMs;
      updatePipelineMetrics({ ...current.metrics });
      return;
    }
    if (event.type === 'suggestion.delta' && event.delta) {
      const now = eventTimestamp();
      if (!current.metrics.firstTokenAt) {
        current.metrics.firstTokenAt = now;
        emitTiming('suggestion.first_useful', elapsed(current.metrics.suggestionRequestedAt, now));
      }
      setStreamingAnswer((answer) => answer + event.delta);
      updatePipelineMetrics({ ...current.metrics });
      requestAnimationFrame(() => {
        const activeRequest = activeSuggestionRef.current;
        if (!activeRequest || activeRequest.requestId !== event.requestId || activeRequest.metrics.renderedAt) return;
        activeRequest.metrics.renderedAt = eventTimestamp();
        updatePipelineMetrics({ ...activeRequest.metrics });
      });
      return;
    }
    if (event.type === 'suggestion.final' && event.suggestion) {
      current.metrics.completedAt = eventTimestamp();
      setSuggestion(event.suggestion);
      setStreamingAnswer('');
      setLastResponseMode(event.suggestion.responseMode ?? 'concise');
      setSuggestionLoading(false);
      updatePipelineMetrics({ ...current.metrics });
      activeSuggestionRef.current = null;
      setStatus(event.suggestion.grounded ? 'Grounded answer ready' : 'Truthful answer frame ready — no personal evidence was invented');
      return;
    }
    if (event.type === 'suggestion.error') {
      activeSuggestionRef.current = null;
      setSuggestionLoading(false);
      setStreamingAnswer('');
      emitTiming('generation.failed', elapsed(current.metrics.suggestionRequestedAt, eventTimestamp()), 'failed');
      setStatus(event.message || 'The coaching service could not complete this answer. Retry keeps the session open.');
    }
  }

  async function askCoach(nextQuestion = questionRef.current, responseMode: 'tiny' | 'concise' | 'standard' | 'detailed' = 'concise', source: PipelineMetrics['source'] = 'manual') {
    if (!contextRef.current || nextQuestion.trim().length < 2) return setStatus('Wait for a question or type one before asking the copilot.');
    const liveScreenContext = source === 'manual' && screenContextEnabled
      ? await captureCurrentScreen()
      : screenAnalysis;
    cancelActiveSuggestion();
    const now = eventTimestamp();
    const metrics: PipelineMetrics = source === 'manual'
      ? { source, questionDetectedAt: now, suggestionRequestedAt: now }
      : { ...pipelineMetricsRef.current, source, suggestionRequestedAt: now };
    updatePipelineMetrics(metrics);
    emitTiming('question.detected', elapsed(metrics.audioReceivedAt, metrics.questionDetectedAt));
    if (metrics.transcriptFirstDeltaAt) emitTiming('transcription.delta', elapsed(metrics.audioReceivedAt, metrics.transcriptFirstDeltaAt));
    const requestId = crypto.randomUUID();
    const parser = new SuggestionSseParser();
    activeSuggestionRef.current = { requestId, question: nextQuestion, parser, metrics };
    setSuggestionLoading(true); setSuggestion(null); setStreamingAnswer('');
    if (responseMode !== 'detailed') setAnswerLayer('five');
    setStatus(responseMode === 'detailed' ? 'Going deeper with context and trade-offs…' : 'Reading the live context and streaming a speakable answer…');
    try {
      await invoke('desktop_suggest', { requestId, payload: { question: nextQuestion, screenContext: liveScreenContext || undefined, mode: copilotMode, locale: contextRef.current.session.locale, responseMode, responseStyle, transcript: segmentsRef.current, verifiedFacts: [], target: {} } });
      const current = activeSuggestionRef.current;
      if (current?.requestId === requestId) {
        current.parser.finish((event) => handleSuggestionStreamEvent({ ...event, requestId }));
        if (activeSuggestionRef.current?.requestId === requestId) throw new Error('The coach returned an incomplete answer. Retry keeps the session open.');
      }
    } catch (error) {
      if (activeSuggestionRef.current?.requestId !== requestId) return;
      activeSuggestionRef.current = null; setStreamingAnswer(''); setStatus(realtimeFailure(error));
      emitTiming('generation.failed', elapsed(metrics.suggestionRequestedAt, eventTimestamp()), 'failed');
    } finally {
      if (activeSuggestionRef.current?.requestId === requestId) activeSuggestionRef.current = null;
      setSuggestionLoading((loading) => activeSuggestionRef.current ? loading : false);
    }
  }

  function moveAnswerLayer(direction: -1 | 1) {
    setAnswerLayer((current) => { const index = answerLayers.findIndex((item) => item.id === current); const next = answerLayers[Math.max(0, Math.min(answerLayers.length - 1, index + direction))].id; if (next === 'deep' && suggestion && lastResponseMode !== 'detailed') void askRef.current(questionRef.current, 'detailed'); return next; });
  }
  function chooseAnswerLayer(layer: AnswerLayer) { setAnswerLayer(layer); if (layer === 'deep' && suggestion && lastResponseMode !== 'detailed') void askCoach(question, 'detailed'); }

  async function captureCurrentScreen(): Promise<string | null> {
    if (desktopPreview) {
      const preview = 'Visible screen: a weekly product meeting with a launch timeline, two open risks, and an unassigned follow-up.';
      setScreenAnalysis(preview);
      return preview;
    }
    setScreenAnalyzing(true); setStatus('Reading the primary screen once…');
    try {
      const image = await invoke<ScreenContextImage>('capture_primary_screen', { restoreProtected: privateOverlay });
      const result = await invoke<{ analysis: string; retained: boolean }>('desktop_screen_context', { bytes: image.bytes, contentType: image.contentType });
      setScreenAnalysis(result.analysis); setStatus('Screen context ready — screenshot discarded'); return result.analysis;
    } catch (error) { setStatus(realtimeFailure(error)); return null; }
    finally { setScreenAnalyzing(false); }
  }

  async function saveConversationCapture(kind: 'note' | 'decision' | 'action' | 'bookmark' | 'open_question') {
    if (!context) return;
    const latest = segmentsRef.current.at(-1)?.text ?? '';
    const text = captureText.trim() || latest;
    if (!text) return setCaptureNotice('Type a capture or wait for a transcript turn.');
    try {
      const result = await desktopApi<{ id: string }>('POST', `/api/v1/sessions/${context.session.id}/captures`, { kind, text });
      setCaptures((current) => [...current, { id: result.id, kind, text, createdAt: Date.now() }]); setCaptureText(''); setCaptureNotice(`${statusCopy(kind)} saved to this session.`);
    } catch (error) { setCaptureNotice(realtimeFailure(error)); }
  }

  async function finish(choice: 'save' | 'discard') {
    setFinishing(true); await stopCapture('Finishing session…');
    try {
      await invoke('desktop_finish', { choice, liveSeconds: seconds, segments: segmentsRef.current });
      if (focusMode) await toggleFocusMode();
      setContext(null); setSuggestion(null); setQuestion('Ask anything about your screen or conversation…'); setSegments([]); setBrain(null); setCaptures([]); setScreenAnalysis(''); setSurface('workspace');
      setStatus(choice === 'save' ? 'Session saved — notes and follow-through are ready' : 'Session discarded — transcript deleted');
    } catch (error) { setStatus(realtimeFailure(error)); }
    finally { setFinishing(false); }
  }

  async function signOut() {
    await stopCapture();
    if (focusMode) await toggleFocusMode();
    await invoke('disconnect_desktop'); setContext(null); setAccount(null); setSurface('workspace'); setStatus('Signed out from this Mac');
  }

  function startWindowDrag(event: React.MouseEvent<HTMLElement>) {
    if (event.button !== 0) return; const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('button, input, textarea, select, a, label, summary, [data-no-drag]')) return;
    event.preventDefault(); void getCurrentWindow().startDragging().catch((error) => setStatus(`The window could not start moving: ${realtimeFailure(error)}`));
  }
  async function hideWindow() { try { await getCurrentWindow().hide(); } catch (error) { setStatus(`Torvi could not be hidden: ${realtimeFailure(error)}`); } }
  function quitApp() { setFinishing(true); setStatus('Quitting Torvi…'); void invoke('quit_desktop').catch((error) => { setFinishing(false); setStatus(realtimeFailure(error)); }); }
  function relaunchApp() { setFinishing(true); setStatus('Restarting Torvi to verify system-audio access…'); void invoke('relaunch_desktop').catch((error) => { setFinishing(false); setStatus(`Torvi could not restart: ${realtimeFailure(error)}`); }); }

  async function setOverlayPrivacy(next: boolean) {
    if (next === privateOverlay) return;
    try {
      await invoke('configure_share_safe_overlay', { enabled: next });
      setPrivateOverlay(next);
      setStatus(next ? 'Private Overlay on · hidden from supported capture paths (best effort)' : 'Private Overlay off · the copilot may appear in screen shares');
    } catch (error) { setStatus(`Private Overlay could not change: ${realtimeFailure(error)}`); }
  }
  async function resizeAssistant(panelState: AssistantPanelState, size = assistantPreferencesRef.current.assistantSize) {
    if (desktopPreview) return;
    const expandedSizes: Record<AssistantSize, [number, number]> = {
      compact: [440, 390], standard: [500, 500], expanded: [560, 620],
    };
    const [width, height] = panelState === 'collapsed' ? [460, 58] : expandedSizes[size];
    await getCurrentWindow().setSize(new LogicalSize(width, height));
  }

  async function setAssistantPanel(next: AssistantPanelState, focusPrompt = false) {
    panelStateRef.current = next;
    setAssistantPanelState(next);
    if (focusModeRef.current) await resizeAssistant(next);
    if (focusPrompt) {
      setAssistantFocusRequest((value) => value + 1);
      await getCurrentWindow().setFocus().catch(() => undefined);
    }
  }

  async function toggleFocusMode(force?: boolean) {
    const next = force ?? !focusModeRef.current;
    if (next === focusModeRef.current) {
      if (next) await setAssistantPanel(panelStateRef.current);
      return;
    }
    try {
      await windowStateRef.current?.switchMode(next ? 'focus' : 'normal');
      await invoke('configure_focus_mode', { enabled: next, clickThrough: next && clickThrough });
      if (next) await resizeAssistant(panelStateRef.current);
      focusModeRef.current = next;
      setFocusMode(next);
      setStatus(next ? clickThrough ? 'Overlay on · click-through enabled · press ⌘⇧S to recover controls' : 'Overlay on · drag or resize it anywhere' : 'Overlay closed · workspace window restored');
    }
    catch (error) { focusModeRef.current = false; setFocusMode(false); setStatus(realtimeFailure(error)); }
  }

  async function openLiveOverlay() {
    setSurface('live');
    panelStateRef.current = 'collapsed';
    setAssistantPanelState('collapsed');
    await toggleFocusMode(true);
  }

  async function returnToWorkspace() {
    if (focusModeRef.current) await toggleFocusMode(false);
    setSurface('workspace');
  }

  async function activateAssistant() {
    await getCurrentWindow().show().catch(() => undefined);
    if (!contextRef.current) {
      setSurface('workspace');
      await getCurrentWindow().setFocus().catch(() => undefined);
      setStatus('Prepare a session to use the floating assistant');
      return;
    }
    setSurface('live');
    if (!focusModeRef.current) await toggleFocusMode(true);
    await setAssistantPanel('collapsed', true);
  }

  function clearAssistantThread() {
    cancelActiveSuggestion();
    setQuestion('');
    setPartial('');
    setSuggestion(null);
    setStreamingAnswer('');
    setStatus('Assistant thread cleared');
  }

  function changeAssistantPreferences(patch: Partial<AssistantPreferences>) {
    const next = {
      ...assistantPreferencesRef.current,
      ...patch,
      windowOpacity: clampAssistantOpacity(patch.windowOpacity ?? assistantPreferencesRef.current.windowOpacity),
    };
    assistantPreferencesRef.current = next;
    setAssistantPreferences(next);
    void windowStateRef.current?.setAssistantPreferences(next);
    if (patch.assistantSize && focusModeRef.current && panelStateRef.current === 'expanded') {
      void resizeAssistant('expanded', patch.assistantSize).catch((error) => setStatus(`The assistant could not resize: ${realtimeFailure(error)}`));
    }
  }

  function adjustAssistantOpacity(delta: number) {
    changeAssistantPreferences({ windowOpacity: assistantPreferencesRef.current.windowOpacity + delta });
  }

  function resetAssistantAppearance() {
    changeAssistantPreferences(DEFAULT_ASSISTANT_PREFERENCES);
    setStatus('Assistant appearance reset to the readable default');
  }

  function changeDensity(next: Density) {
    setDensity(next);
    void windowStateRef.current?.setDensity(next);
  }

  function changeDesktopPreferences(patch: Partial<DesktopPreferences>) {
    setDesktopPreferences((current) => {
      const next = { ...current, ...patch };
      void windowStateRef.current?.setDesktopPreferences(next);
      return next;
    });
  }

  function changeShortcut(action: ShortcutAction, shortcut: string) {
    setShortcuts((current) => {
      const next = { ...current, [action]: shortcut };
      shortcutsRef.current = next;
      void windowStateRef.current?.setShortcutPreferences(next);
      return next;
    });
  }

  function resetShortcuts() {
    shortcutsRef.current = DEFAULT_SHORTCUT_PREFERENCES;
    setShortcuts(DEFAULT_SHORTCUT_PREFERENCES);
    void windowStateRef.current?.setShortcutPreferences(DEFAULT_SHORTCUT_PREFERENCES);
    setStatus('Keyboard shortcuts restored to defaults');
  }

  function resetWindowPosition() {
    void windowStateRef.current?.resetPosition(desktopPreferences.preferredMonitor)
      .then(() => setStatus('Torvi moved to the selected display'))
      .catch((error) => setStatus(`Window position could not reset: ${realtimeFailure(error)}`));
  }

  React.useEffect(() => { toggleRef.current = toggleCapture; askRef.current = askCoach; focusRef.current = toggleFocusMode; layerRef.current = moveAnswerLayer; opacityRef.current = adjustAssistantOpacity; });
  React.useEffect(() => {
    if (desktopPreview) return;
    const windowState = new WindowStateManager();
    windowStateRef.current = windowState;
    void windowState.init().then(({ mode, density: savedDensity, preferences, shortcuts: savedShortcuts, desktopPreferences: savedDesktopPreferences }) => {
      setDensity(savedDensity);
      assistantPreferencesRef.current = preferences;
      setAssistantPreferences(preferences);
      shortcutsRef.current = savedShortcuts;
      setShortcuts(savedShortcuts);
      setDesktopPreferences(savedDesktopPreferences);
      focusModeRef.current = mode === 'focus';
      setFocusMode(mode === 'focus');
      return Promise.all([
        invoke('configure_focus_mode', { enabled: mode === 'focus', clickThrough: mode === 'focus' && clickThrough }),
        mode === 'focus' ? resizeAssistant(panelStateRef.current, preferences.assistantSize) : Promise.resolve(),
      ]);
    }).catch(() => setStatus('Window state could not be restored; resizing still works normally.'));
    const restoreTimer = window.setTimeout(() => { if (!desktopPreview) void restoreConnection(); }, 0); const audioStatusTimer = window.setTimeout(() => { if (!desktopPreview) void refreshSystemAudio(); }, 0);
    const handleWindowFocus = () => { if (!activeRef.current) void refreshSystemAudio(); else (['interviewer', 'candidate'] as Channel[]).forEach((channel) => { const state = channelsRef.current[channel]?.peer.connectionState; if (state && ['failed', 'disconnected'].includes(state)) scheduleReconnect(channel); }); };
    const handleOnline = () => { setOnline(true); setStatus('Network restored — reconnecting live channels'); (['interviewer', 'candidate'] as Channel[]).forEach(scheduleReconnect); };
    const handleOffline = () => { setOnline(false); setStatus('Network unavailable — the session remains open and will reconnect automatically'); };
    const handleDevices = () => { if (activeRef.current && micStreamRef.current?.getAudioTracks()[0]?.readyState === 'ended') scheduleReconnect('candidate'); };
    const handleKeys = (event: KeyboardEvent) => {
      if (event.altKey && event.key === 'ArrowRight') { event.preventDefault(); layerRef.current(1); }
      if (event.altKey && event.key === 'ArrowLeft') { event.preventDefault(); layerRef.current(-1); }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.code === 'BracketLeft') { event.preventDefault(); opacityRef.current(-5); }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.code === 'BracketRight') { event.preventDefault(); opacityRef.current(5); }
      if (event.key === 'Escape' && focusModeRef.current) {
        event.preventDefault();
        if (panelStateRef.current === 'expanded') void setAssistantPanel('collapsed');
        else void hideWindow();
      }
    };
    window.addEventListener('focus', handleWindowFocus); window.addEventListener('online', handleOnline); window.addEventListener('offline', handleOffline); window.addEventListener('keydown', handleKeys); navigator.mediaDevices?.addEventListener('devicechange', handleDevices);
    let disposed = false; const cleanup: Array<() => void> = [];
    Promise.all([
      listen<AudioChunk>('native-audio-chunk', ({ payload }) => { if (disposed || !activeRef.current) return; lastNativeAudioAtRef.current = eventTimestamp(); const samples = decodeAudioChunk(payload); const nextLevel = chunkLevel(samples); setLevel(nextLevel); if (nextLevel > 0.015) { setSourceVerified(true); setStatus('System audio verified — listening for questions'); } if (systemAudioBridgeRef.current && !systemAudioBridgeRef.current.push(samples, payload.sampleRate)) setDroppedChunks((value) => value + 1); }).then((unlisten) => cleanup.push(unlisten)),
      listen<SystemAudioFailure>('native-audio-error', ({ payload }) => { if (!disposed) void stopCapture(payload.message || 'System audio capture stopped.', payload); }).then((unlisten) => cleanup.push(unlisten)),
      listen<SuggestionChunk>('desktop-suggestion-chunk', ({ payload }) => { const current = activeSuggestionRef.current; if (!disposed && current?.requestId === payload.requestId) current.parser.feed(payload.bytes, (event) => handleSuggestionStreamEvent({ ...event, requestId: payload.requestId })); }).then((unlisten) => cleanup.push(unlisten)),
    ]).catch(() => setStatus('A native event listener could not start. Restart Torvi to try again.'));
    void invoke('configure_share_safe_overlay', { enabled: false });
    return () => { window.clearTimeout(restoreTimer); window.clearTimeout(audioStatusTimer); if (partialQuestionTimerRef.current != null) window.clearTimeout(partialQuestionTimerRef.current); cancelActiveSuggestion(); window.removeEventListener('focus', handleWindowFocus); window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); window.removeEventListener('keydown', handleKeys); navigator.mediaDevices?.removeEventListener('devicechange', handleDevices); disposed = true; cleanup.forEach((dispose) => dispose()); void windowState.dispose(); void stopCapture(); };
    // Native listeners are installed once; current values are held in refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  React.useEffect(() => {
    if (desktopPreview) return;
    let disposed = false;
    const shortcutManager = shortcutManagerRef.current;
    void shortcutManager.update(shortcuts, {
      toggleAssistant: () => { void activateAssistant(); },
      toggleListening: () => { void toggleRef.current(); },
      hideAssistant: () => { void hideWindow(); },
      toggleOverlay: () => { void focusRef.current(); },
      clearThread: clearAssistantThread,
      captureContext: () => { setScreenContextEnabled(true); setStatus('Screen context enabled for the next request'); void activateAssistant(); },
    }).then((conflicts) => {
      if (disposed) return;
      setShortcutConflicts(conflicts);
      if (conflicts.length) setStatus(`${conflicts.length} keyboard shortcut${conflicts.length === 1 ? '' : 's'} could not be registered. Change them in Settings.`);
    });
    return () => { disposed = true; void shortcutManager.dispose(); };
    // Actions are routed through refs where they need the latest live-session state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortcuts]);
  React.useEffect(() => { if (!active) return; const interval = window.setInterval(() => setSeconds((value) => value + 1), 1_000); return () => window.clearInterval(interval); }, [active]);
  React.useEffect(() => { if (!context) return; const timer = window.setTimeout(() => void loadSessionIntelligence(context), 0); return () => window.clearTimeout(timer); }, [context]);

  const sources = (context?.documents.length ?? 0) + (context?.target?.jobDescription ? 1 : 0);
  const systemAudioLabel: Record<SystemAudioState, string> = { unknown: 'Not checked', checking: 'Checking…', permissionRequired: 'Permission required', restartRequired: 'Restart required', authorized: 'Ready', starting: 'Starting…', running: sourceVerified ? 'Sound detected' : 'Waiting for sound', captureFailed: 'Capture failed' };
  const captureBusy = captureIntent !== 'idle' || systemAudio.state === 'checking' || systemAudio.state === 'starting';
  const captureActionKind: 'start' | 'stop' | 'permission' | 'restart' | 'retry' = active ? 'stop' : systemAudio.state === 'permissionRequired' ? 'permission' : systemAudio.state === 'restartRequired' ? 'restart' : systemAudio.state === 'captureFailed' ? 'retry' : 'start';
  const captureActionLabel = active ? (captureIntent === 'stopping' ? 'Stopping…' : 'Stop listening') : captureBusy ? 'Starting…' : captureActionKind === 'permission' ? 'Grant audio access' : captureActionKind === 'restart' ? 'Restart Torvi' : captureActionKind === 'retry' ? 'Retry audio check' : 'Start assistant';
  const captureActionHint = active ? 'Torvi is hearing the conversation and generating live assistance.' : captureActionKind === 'permission' ? 'macOS needs explicit Screen & System Audio Recording access before Torvi can listen.' : captureActionKind === 'restart' ? 'Torvi must restart once so macOS can apply the new audio permission.' : captureActionKind === 'retry' ? 'The last audio check failed. Retry it without losing the prepared session.' : 'Start live system audio and optional microphone transcription.';
  const selectedMemory = suggestion?.grounding.verifiedClaimIds.flatMap((id) => brain?.brain.verifiedMemory.find((item) => item.claimId === id) ?? []).at(0) ?? null;
  const isMeeting = context?.session.mode === 'meeting';
  const isConversationMode = context ? !modeRequiresVerifiedResume(context.session.mode) : false;
  const transcriptItems = transcriptView === 'compact' ? segments.slice(-5) : segments;
  const frameStyle = { '--assistant-surface-alpha': String(assistantPreferences.windowOpacity / 100) } as React.CSSProperties;
  const transcriptLatency = elapsed(pipelineMetrics.audioReceivedAt, pipelineMetrics.transcriptFirstDeltaAt);
  const detectionLatency = elapsed(pipelineMetrics.transcriptFirstDeltaAt, pipelineMetrics.questionDetectedAt);
  const firstTokenLatency = elapsed(pipelineMetrics.suggestionRequestedAt, pipelineMetrics.firstTokenAt);
  const firstRenderLatency = elapsed(pipelineMetrics.suggestionRequestedAt, pipelineMetrics.renderedAt);
  const completionLatency = elapsed(pipelineMetrics.suggestionRequestedAt, pipelineMetrics.completedAt);

  function answerContent() {
    if (streamingAnswer) return <p className="streaming-answer">{streamingAnswer}<i aria-label="Streaming answer" /></p>;
    if (!suggestion) return <div className="answer-placeholder"><i>✦</i><b>{suggestionLoading ? 'Preparing a grounded answer…' : active ? 'Listening for a completed question' : 'Start live audio when the conversation begins'}</b><p>{suggestionLoading ? 'Retrieving the strongest verified experience and shaping it into a speakable response.' : 'Questions are detected automatically. You can also type a question and press Ask AI.'}</p></div>;
    if (answerLayer === 'five') return <p className="five-answer">{suggestion.directAnswer || suggestion.answer}</p>;
    if (answerLayer === 'twenty') return <div className="twenty-answer">{(suggestion.supportingPoints.length ? suggestion.supportingPoints : suggestion.bullets).map((point, index) => <p key={`${point}:${index}`}><i>{index + 1}</i><span>{point}</span></p>)}</div>;
    if (answerLayer === 'sixty') return <p className="sixty-answer">{suggestion.expandedAnswer || [suggestion.directAnswer, ...suggestion.supportingPoints].filter(Boolean).join(' ')}</p>;
    return <div className="deep-answer"><p>{suggestion.expandedAnswer || suggestion.directAnswer}</p>{suggestion.challengeability.reasons.length > 0 && <article><span>Evidence and challenge readiness</span>{suggestion.challengeability.reasons.map((reason) => <p key={reason}>◇ {reason}</p>)}</article>}{suggestion.citations.length > 0 && <article><span>Context used</span>{suggestion.citations.map((citation) => <p key={citation.documentId}><b>{citation.label}</b> — {citation.excerpt}</p>)}</article>}{suggestion.grounding.unsupportedElements.length > 0 && <article className="evidence-gap"><span>Missing evidence</span>{suggestion.grounding.unsupportedElements.map((item) => <p key={item}>! {item}</p>)}</article>}</div>;
  }

  return <main className={`app-frame surface-${surface} density-${density} appearance-${assistantPreferences.appearanceMode} ${focusMode ? 'focus-mode' : ''} ${privateOverlay ? 'private-overlay' : ''}`} style={frameStyle}>
    <header className="global-titlebar window-drag-region" onMouseDown={startWindowDrag}><div className="mark"><i /><i /><i /></div><div className="global-brand"><b>Torvi</b><span>{surface === 'live' && context ? `${context.target?.role ?? statusCopy(context.session.mode)}${context.target?.company ? ` · ${context.target.company}` : ''}` : `Native workspace · v${desktopAppVersion}`}</span></div>{surface === 'live' && <div className={`live-status ${active ? 'active' : ''} ${online ? '' : 'offline'}`}><i />{status}</div>}<div className="window-actions" data-no-drag>{surface === 'live' && <button onClick={() => void returnToWorkspace()}>Workspace</button>}{surface === 'live' && <button className={focusMode ? 'active' : ''} title="Overlay (⌘⇧S)" onClick={() => void toggleFocusMode()}>Overlay</button>}<button title="Hide (⌘⇧H)" onClick={() => void hideWindow()}>Hide</button><button className="quit" disabled={finishing} title="Quit (⌘Q)" onClick={quitApp}>Quit</button></div></header>

    {surface === 'workspace' ? <ControlCenter account={account} activeContext={context} appVersion={desktopAppVersion} preview={desktopPreview} assistantPreferences={assistantPreferences} desktopPreferences={desktopPreferences} shortcuts={shortcuts} shortcutConflicts={shortcutConflicts} onAssistantPreferencesChange={changeAssistantPreferences} onDesktopPreferencesChange={changeDesktopPreferences} onShortcutChange={changeShortcut} onResetShortcuts={resetShortcuts} onResetWindowPosition={resetWindowPosition} onResetAssistantAppearance={resetAssistantAppearance} onAuthenticated={setAccount} onOpenLive={() => context && void openLiveOverlay()} onSessionPrepared={(next) => { setContext(next); setCopilotMode(next.session.mode); setSegments([]); setSuggestion(null); setStreamingAnswer(''); setQuestion('Ask anything about your screen or conversation…'); void openLiveOverlay(); }} onSignOut={signOut} setStatus={setStatus} /> : context ? <section className={`live-workspace ${isConversationMode ? 'conversation-workspace' : 'interview-workspace'}`}>
      {focusMode && <AssistantOverlay
        panelState={assistantPanelState}
        focusRequest={assistantFocusRequest}
        shortcut={shortcuts.toggleAssistant}
        active={active}
        online={online}
        mode={copilotMode}
        question={partial || question}
        questionIsLive={Boolean(partial)}
        prompt={question}
        suggestion={suggestion}
        streamingAnswer={streamingAnswer}
        loading={suggestionLoading}
        status={status}
        captureActionLabel={captureActionLabel}
        captureActionHint={captureActionHint}
        captureActionKind={captureActionKind}
        captureBusy={captureBusy}
        preferences={assistantPreferences}
        onPanelChange={(next, focusPrompt) => { void setAssistantPanel(next, focusPrompt); }}
        onPromptChange={(value) => { setPartial(''); setQuestion(value); }}
        onSubmit={(value) => { setQuestion(value); void askCoach(value); }}
        onQuickAction={(value) => { setQuestion(value); void askCoach(value); }}
        onClear={clearAssistantThread}
        onPreferencesChange={changeAssistantPreferences}
        onResetAppearance={resetAssistantAppearance}
        onToggleListening={() => void runCapturePrimaryAction()}
        onShorter={() => { chooseAnswerLayer('five'); void askCoach(partial || question, 'tiny'); }}
        onExpand={() => { chooseAnswerLayer('sixty'); void askCoach(partial || question, 'detailed'); }}
        onFollowUp={() => { const next = suggestion?.likelyFollowUps[0]?.question ?? 'What is the most likely follow-up question?'; setQuestion(next); void askCoach(next, 'concise'); }}
        onHide={() => void hideWindow()}
        onClose={() => void returnToWorkspace()}
        onDragStart={startWindowDrag}
      />}
      <div className="live-context"><div><span>{isMeeting ? 'Meeting' : 'Live session'}</span><b>{context.target?.role ?? statusCopy(context.session.mode)}{context.target?.company ? ` at ${context.target.company}` : ''}</b></div><div><span>Mode</span><b>{statusCopy(copilotMode)}</b></div><div><span>Context</span><b>{sources} sources · {brain?.brain.verifiedMemory.length ?? 0} verified memories</b></div><time>{String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</time></div>

      <section className={`audio-ribbon state-${systemAudio.state}`}>
        <div className="channel-health"><span><i className={systemAudio.state === 'running' ? 'ready' : ''} />System audio <b>{systemAudioLabel[systemAudio.state]}</b></span><div className="meter"><i style={{ width: `${Math.max(active ? 3 : 0, Math.round(level * 100))}%` }} /></div></div>
        <div className="channel-health"><span><i className={micConnected ? 'ready' : ''} />Microphone <b>{micConnected ? 'Connected' : 'Optional'}</b></span><div className="meter"><i style={{ width: `${Math.round(micLevel * 100)}%` }} /></div></div>
        <small>{online ? active ? `Both channels are ephemeral · ${droppedChunks} overloaded chunks dropped · no audio stored` : systemAudio.reason : 'Network offline · session preserved · reconnects automatically'}</small>
        {systemAudio.state === 'permissionRequired' ? <button onClick={() => void grantSystemAudio()}>Grant system audio</button> : systemAudio.state === 'restartRequired' ? <button onClick={relaunchApp}>Restart Torvi</button> : systemAudio.state === 'captureFailed' ? <button onClick={() => void refreshSystemAudio(true)}>Retry check</button> : null}
        {systemAudio.diagnostics && <details className="system-audio-diagnostics"><summary>System audio diagnostics</summary><span>Permission: {systemAudio.diagnostics.preflightGranted ? 'granted' : 'not granted'}</span><span>Signing: {systemAudio.diagnostics.signingStable ? 'stable' : 'development identity'}</span><span>App location: {systemAudio.diagnostics.executablePath.startsWith('/Applications/') ? 'Applications' : 'move Torvi to Applications'}</span><span>Last stage: {statusCopy(systemAudio.diagnostics.lastStage)}</span><span>macOS: {systemAudio.diagnostics.macosVersion}</span>{systemAudio.state === 'permissionRequired' ? <button title="Use only if macOS has a stale Torvi permission entry" onClick={() => void repairSystemAudio()}>Reset permission record (advanced)</button> : null}</details>}
      </section>

      <div className="live-stage"><section className="live-primary"><div className="question-block"><header><span>{partial ? 'Hearing the conversation…' : 'Ask about your screen or conversation'}</span>{partial && <i>Live</i>}</header><textarea aria-label="Detected or typed request" value={partial || question} onChange={(event) => { setPartial(''); setQuestion(event.target.value); }} /></div><article className="answer-workbench"><header><div><span>Live answer</span><b>{suggestion ? `${suggestion.grounding.level} grounding · ${suggestion.grounding.verifiedClaimIds.length} verified memories` : screenContextEnabled ? 'Screen-aware on Ask' : 'Conversation context'}</b></div>{suggestion && <em className={suggestion.challengeability.label}>{statusCopy(suggestion.challengeability.label)}</em>}</header><nav className="answer-layer-tabs">{answerLayers.map((item) => <button key={item.id} className={answerLayer === item.id ? 'active' : ''} onClick={() => chooseAnswerLayer(item.id)}><b>{item.label}</b><small>{item.hint}</small></button>)}</nav>{suggestion?.recommendation !== 'answer' && suggestion ? <aside className="grounding-advice"><b>{suggestion.recommendation === 'clarify_first' ? 'Clarify first' : suggestion.recommendation === 'closest_verified_example' ? 'Closest real experience' : 'No verified personal example'}</b><span>{suggestion.clarificationSuggestion ?? suggestion.caution ?? 'Use a truthful general answer without presenting it as personal history.'}</span></aside> : null}<div className={`answer-content layer-${answerLayer}`}>{answerContent()}</div>{selectedMemory && <div className="source-experience"><i>◇</i><span><small>Using verified memory</small><b>{selectedMemory.experienceTitle}{selectedMemory.company ? ` · ${selectedMemory.company}` : ''}</b><em>{statusCopy(selectedMemory.claimType)}</em></span></div>}{screenAnalysis && <details className="screen-context-result" open><summary>Screen context · screenshot discarded</summary><p>{screenAnalysis}</p></details>}</article>

        {!isMeeting && <section className="followup-rail"><header><span>Likely follow-ups</span><small>Choose one to prepare immediately</small></header>{suggestion?.likelyFollowUps.length ? suggestion.likelyFollowUps.map((item) => <button key={item.question} onClick={() => { setQuestion(item.question); void askCoach(item.question, 'concise'); }}><span><b>{item.question}</b><small>{statusCopy(item.type)}</small></span><em>→</em></button>) : <p>Follow-up questions appear after the first grounded answer.</p>}</section>}

        {isConversationMode && <section className="meeting-capture-panel"><header><div><span>Session memory</span><h3>Capture what matters without breaking focus.</h3></div><em>{captures.length} saved</em></header><input value={captureText} onChange={(event) => setCaptureText(event.target.value)} placeholder="Type a note, or leave blank to capture the latest transcript turn" /><div>{(['note', 'decision', 'action', 'bookmark', 'open_question'] as const).map((kind) => <button key={kind} onClick={() => void saveConversationCapture(kind)}>{kind === 'open_question' ? 'Question' : statusCopy(kind)}</button>)}</div>{captureNotice && <small>{captureNotice}</small>}{captures.length > 0 && <details><summary>Saved session items ({captures.length})</summary>{captures.slice(-8).map((capture) => <p key={capture.id}><b>{statusCopy(capture.kind)}</b>{capture.text}</p>)}</details>}</section>}
      </section>

      <aside className={`live-side transcript-${transcriptView}`}><header><div><span>Live transcript</span><b>{segments.length} turns</b></div><nav><button className={transcriptView === 'hidden' ? 'active' : ''} onClick={() => setTranscriptView('hidden')}>Hide</button><button className={transcriptView === 'compact' ? 'active' : ''} onClick={() => setTranscriptView('compact')}>Compact</button><button className={transcriptView === 'expanded' ? 'active' : ''} onClick={() => setTranscriptView('expanded')}>Expand</button></nav></header>{transcriptView !== 'hidden' && <div className="transcript-list">{transcriptItems.map((segment) => <article key={segment.id} className={segment.speaker}><span>{segment.speaker === 'candidate' ? 'You' : segment.speaker === 'interviewer' ? 'Other side' : 'Unknown'}</span><p>{segment.text}</p></article>)}{partial && <article className="interviewer partial"><span>Other side · live</span><p>{partial}</p></article>}{!segments.length && !partial && <div className="transcript-empty"><i>≋</i><b>Transcript appears here</b><p>System audio and microphone remain separate for reliable speaker labels.</p></div>}</div>}<section className="live-diagnostics"><div><span>Network</span><b className={online ? 'ready' : 'failed'}>{online ? 'Connected' : 'Offline'}</b></div><div><span>System-audio channel</span><b className={active && !reconnectAttempts.interviewer ? 'ready' : reconnectAttempts.interviewer ? 'attention' : ''}>{reconnectAttempts.interviewer ? `Retry ${reconnectAttempts.interviewer}` : active ? 'Live' : 'Paused'}</b></div><div><span>Your microphone</span><b className={micConnected && !reconnectAttempts.candidate ? 'ready' : reconnectAttempts.candidate ? 'attention' : ''}>{reconnectAttempts.candidate ? `Retry ${reconnectAttempts.candidate}` : micConnected ? 'Live' : 'Optional'}</b></div><details><summary>Latency diagnostics</summary><div className="timing-grid"><span>Audio → transcript <b>{transcriptLatency == null ? '—' : `${transcriptLatency} ms`}</b></span><span>Transcript → request <b>{detectionLatency == null ? '—' : `${detectionLatency} ms`}</b></span><span>Request → first token <b>{firstTokenLatency == null ? '—' : `${firstTokenLatency} ms`}</b></span><span>Request → first render <b>{firstRenderLatency == null ? '—' : `${firstRenderLatency} ms`}</b></span><span>Answer complete <b>{completionLatency == null ? '—' : `${completionLatency} ms`}</b></span><span>Retrieval <b>{pipelineMetrics.retrievalLatencyMs == null ? '—' : `${pipelineMetrics.retrievalLatencyMs} ms`}</b></span></div></details></section></aside></div>

      <footer className="live-command-bar"><select aria-label="Copilot mode" value={copilotMode} onChange={(event) => setCopilotMode(event.target.value as InterviewMode)}>{interviewModes.map((mode) => <option key={mode} value={mode}>{statusCopy(mode)}</option>)}</select><button className={`capture-toggle ${captureActionKind}`} disabled={finishing || captureBusy} aria-describedby="capture-action-hint" onClick={() => void runCapturePrimaryAction()}><i>{captureActionKind === 'stop' ? '■' : captureActionKind === 'permission' ? '◆' : captureActionKind === 'restart' || captureActionKind === 'retry' ? '↻' : '▶'}</i>{captureActionLabel}</button><span id="capture-action-hint" className="sr-only">{captureActionHint}</span><button className={`screen-toggle ${screenContextEnabled ? 'active' : ''}`} title="When enabled, Ask reads the primary screen once" onClick={() => setScreenContextEnabled((value) => !value)}>▣ Screen {screenContextEnabled ? 'on' : 'off'}</button><select aria-label="Response style" value={responseStyle} onChange={(event) => changeAssistantPreferences({ responseStyle: event.target.value as ResponseStyle })}><option value="adaptive">Smart</option><option value="bullets">Points</option><option value="paragraph">Paragraph</option></select><div className="visibility-mode" role="group" aria-label="Overlay visibility mode" title="Private Overlay is best effort on supported capture paths"><span>Overlay</span><button type="button" className={!privateOverlay ? 'active visible' : ''} aria-pressed={!privateOverlay} onClick={() => void setOverlayPrivacy(false)}>Visible</button><button type="button" className={privateOverlay ? 'active private' : ''} aria-pressed={privateOverlay} onClick={() => void setOverlayPrivacy(true)}>Private</button></div><button className="ask-button" disabled={finishing} onClick={() => void askCoach()}>{screenAnalyzing ? 'Reading screen…' : suggestionLoading ? 'Refresh answer' : 'Ask'} <kbd>⌘↵</kbd></button><select aria-label="Display mode" value={density} onChange={(event) => changeDensity(event.target.value as Density)}><option value="comfortable">Standard</option><option value="compact">Compact</option><option value="minimal">Minimal overlay</option></select><details className="focus-settings"><summary>More</summary><label>Opacity <input type="range" min={MIN_ASSISTANT_OPACITY} max="100" value={assistantPreferences.windowOpacity} onChange={(event) => changeAssistantPreferences({ windowOpacity: Number(event.target.value) })} /></label><label><input type="checkbox" checked={clickThrough} onChange={(event) => setClickThrough(event.target.checked)} />Click-through in Overlay</label><small>Opacity changes the local interface only.</small></details><div className="retention-actions"><button disabled={finishing} onClick={() => void finish('discard')}>Discard</button><button disabled={finishing} onClick={() => void finish('save')}>{finishing ? 'Finishing…' : 'Save notes'}</button></div></footer>
    </section> : <section className="missing-live"><h1>No prepared session</h1><p>Return to the workspace and prepare a Torvi session first.</p><button onClick={() => void returnToWorkspace()}>Open workspace</button></section>}
  </main>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
