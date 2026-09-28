import React from 'react';
import ReactDOM from 'react-dom/client';
import { invoke, isNativeDesktop } from './native-bridge';
import { listen } from '@tauri-apps/api/event';
declare const __TORVI_BUILD_ID__: string;
import { LogicalSize } from '@tauri-apps/api/dpi';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  interviewModes,
  suggestionSchema,
  isLikelyInterviewQuestion,
  isLikelyTranscriptNoise,
  modeRequiresVerifiedResume,
  shouldReviseQuestion,
  transcriptFingerprint,
  type InterviewMode,
  type ResponseStyle,
  type Suggestion,
  type SavedInteraction,
  type TranscriptSegment,
} from '@interview-copilot/contracts';
import {
  chunkLevel,
  createSystemAudioBridge,
  decodeAudioChunk,
  type AudioChunk,
  type SystemAudioBridge,
} from './system-audio-bridge';
import type { DesktopAccount, NativeSessionContext } from './control-center';
import { SessionLauncher } from './session-launcher';
import { requestMicrophone } from './microphone';
const ControlCenter = React.lazy(() => import('./control-center').then(module => ({ default: module.ControlCenter })));
import { AssistantOverlay, type AssistantPanelState } from './assistant-overlay';
import { LiveTranscript } from './live-transcript';
import { assistantActions, hasTranscriptItem, suggestionTranscript, transcriptOffsetMs } from '@interview-copilot/sdk';
import { CaptureLifecycle } from './capture-lifecycle';
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
import './floating-assistant.css';

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

const desktopAppVersion = '0.7.0';
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
  if (error instanceof DOMException && error.name === 'NotAllowedError') return 'Microphone permission was denied. Open More → Microphone permission settings, enable Torvi, then retry.';
  if (error instanceof DOMException && error.name === 'NotFoundError') return 'No microphone is available. Connect a microphone or choose System audio.';
  const nativeFailure = nativeAudioFailure(error);
  if (nativeFailure) return nativeFailure.message;
  return error instanceof Error ? error.message : String(error);
}

function statusCopy(value: string) { return value.replaceAll('_', ' ').replaceAll('-', ' '); }
function eventTimestamp() { return Date.now(); }

function App() {
  const [surface, setSurface] = React.useState<Surface>('live');
  const [workspaceView, setWorkspaceView] = React.useState<'home' | 'live' | 'sessions'>('home');
  const [active, setActive] = React.useState(false);
  const [density, setDensity] = React.useState<Density>('comfortable');
  const [context, setContext] = React.useState<SessionContext | null>(null);
  const [account, setAccount] = React.useState<DesktopAccount | null>(null);
  const [question, setQuestion] = React.useState('');
  const [launchOpen, setLaunchOpen] = React.useState(false);
  const [audioSource, setAudioSource] = React.useState<'microphone' | 'both' | 'system'>('microphone');
  const audioSourceRef = React.useRef(audioSource);
  React.useEffect(() => { audioSourceRef.current = audioSource; }, [audioSource]);
  const [partial, setPartial] = React.useState('');
  const [suggestion, setSuggestion] = React.useState<Suggestion | null>(null);
  const [streamingAnswer, setStreamingAnswer] = React.useState('');
  const [suggestionLoading, setSuggestionLoading] = React.useState(false);
  const [pipelineMetrics, setPipelineMetrics] = React.useState<PipelineMetrics>({ source: 'manual' });
  const [answerLayer, setAnswerLayer] = React.useState<AnswerLayer>('five');
  const [lastResponseMode, setLastResponseMode] = React.useState('concise');
  const [status, setStatus] = React.useState('Opening Torvi');
  const [level, setLevel] = React.useState(0);
  const [micLevel, setMicLevel] = React.useState(0);
  const [micMuted, setMicMuted] = React.useState(false);
  const [micConnected, setMicConnected] = React.useState(false);
  const [sourceVerified, setSourceVerified] = React.useState(false);
  const [systemAudio, setSystemAudio] = React.useState<SystemAudioStatus>(initialSystemAudioStatus);
  const [droppedChunks, setDroppedChunks] = React.useState(0);
  const [seconds, setSeconds] = React.useState(0);
  const [finishing, setFinishing] = React.useState(false);
  const [captureIntent, setCaptureIntent] = React.useState<CaptureIntent>('idle');
  const [segments, setSegments] = React.useState<TranscriptSegment[]>([]);
  const [transcriptView, setTranscriptView] = React.useState<TranscriptView>('compact');
  const [brain, setBrain] = React.useState<SessionBrainResponse | null>(null);
  const [online, setOnline] = React.useState(navigator.onLine);
  const [reconnectAttempts, setReconnectAttempts] = React.useState<Record<Channel, number>>({ interviewer: 0, candidate: 0 });
  const [focusMode, setFocusMode] = React.useState(true);
  const [privateOverlay, setPrivateOverlay] = React.useState(false);
  const [screenContextEnabled, setScreenContextEnabled] = React.useState(false);
  const [copilotMode, setCopilotMode] = React.useState<InterviewMode>('general');
  const [clickThrough, setClickThrough] = React.useState(false);
  const [assistantPreferences, setAssistantPreferences] = React.useState<AssistantPreferences>(DEFAULT_ASSISTANT_PREFERENCES);
  const suggestionIntentRef = React.useRef(0);
  const [generationError, setGenerationError] = React.useState('');
  const [captureError, setCaptureError] = React.useState('');
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
  const captureLifecycleRef = React.useRef(new CaptureLifecycle());
  const finishingRef = React.useRef(false);
  const sessionOriginRef = React.useRef({ id: '', startedAt: 0 });
  const nativeCaptureStartedRef = React.useRef(false);
  const contextRef = React.useRef<SessionContext | null>(null);
  const savedInteractionsRef = React.useRef<SavedInteraction[]>([]);
  const questionRef = React.useRef(question);
  const segmentsRef = React.useRef<TranscriptSegment[]>([]);
  const channelsRef = React.useRef<Partial<Record<Channel, { peer: RTCPeerConnection; events: RTCDataChannel }>>>({});
  const systemAudioBridgeRef = React.useRef<SystemAudioBridge | null>(null);
  const micStreamRef = React.useRef<MediaStream | null>(null);
  const micBridgeRef = React.useRef<SystemAudioBridge | null>(null);
  const nativeMicStartedRef = React.useRef(false);
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
  const assistantPreferencesRef = React.useRef<AssistantPreferences>(DEFAULT_ASSISTANT_PREFERENCES);
  const shortcutsRef = React.useRef<ShortcutPreferences>(DEFAULT_SHORTCUT_PREFERENCES);
  const focusModeRef = React.useRef(true);
  const panelStateRef = React.useRef<AssistantPanelState>('collapsed');

  React.useEffect(() => { contextRef.current = context; }, [context]);
  React.useEffect(() => { savedInteractionsRef.current = []; }, [context?.session.id]);
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
      if (restored && ['created', 'prepared', 'active', 'paused'].includes(restored.session.status)) { setContext(restored); setCopilotMode(restored.session.mode); setStatus('Prepared session restored — open Torvi when ready'); }
      else if (accountState?.scope === 'account') setStatus('Native workspace ready');
      else setStatus('Sign in to open your workspace');
      setSurface('live');
    } catch (error) { setGenerationError(realtimeFailure(error)); setStatus(realtimeFailure(error)); }
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
    if (hasTranscriptItem(segmentsRef.current, channel, typeof payload.item_id === 'string' ? payload.item_id : undefined)) return;
    const session = contextRef.current?.session;
    if (!session) return;
    if (sessionOriginRef.current.id !== session.id) sessionOriginRef.current = { id: session.id, startedAt: session.startedAt ?? Date.now() };
    const now = transcriptOffsetMs(Date.now(), sessionOriginRef.current.startedAt);
    appendSegment({ id: crypto.randomUUID(), speaker: channel, text: transcript, startedAtMs: now, endedAtMs: now + 1, final: true, itemId: typeof payload.item_id === 'string' ? payload.item_id : undefined });
    if (channel === 'candidate' && audioSourceRef.current !== 'microphone') { setStatus('Your side was transcribed'); return; }
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
    if (reconnectAttemptRef.current[channel] >= 5) { setCaptureError('Transcription could not reconnect. Retry audio to restore listening.'); void stopCapture('Transcription disconnected'); return; }
    const attempt = reconnectAttemptRef.current[channel] + 1;
    reconnectAttemptRef.current[channel] = attempt;
    setReconnectAttempts({ ...reconnectAttemptRef.current });
    const waitMs = Math.min(8_000, 700 * 2 ** Math.min(attempt - 1, 4));
    setStatus(`${channel === 'interviewer' ? 'System audio' : 'Microphone'} transcription interrupted — reconnecting automatically (${attempt})`);
    reconnectTimersRef.current[channel] = window.setTimeout(() => {
      delete reconnectTimersRef.current[channel];
      if (!activeRef.current) return;
      void captureLifecycleRef.current.run(async signal => {
        let stream = streamForChannel(channel);
        if (channel === 'candidate' && (!stream || stream.getAudioTracks().every((track) => track.readyState === 'ended'))) {
          try {
            micStreamRef.current?.getTracks().forEach((track) => track.stop());
            stream = await acquireMicrophone(signal);
            micStreamRef.current = stream;
            signal.throwIfAborted();
            setMicConnected(true);
            if (micMonitorRef.current) { window.cancelAnimationFrame(micMonitorRef.current.frame); void micMonitorRef.current.audioContext.close(); micMonitorRef.current = null; }
            if (!micBridgeRef.current) startMicMonitor(stream);
          } catch (error) { if (signal.aborted) throw error; setMicConnected(false); stream = null; }
        }
        if (!stream) return;
        channelsRef.current[channel]?.peer.close(); delete channelsRef.current[channel];
        await connectRealtime(channel, stream, signal);
        signal.throwIfAborted();
        setStatus(`${channel === 'interviewer' ? 'System audio' : 'Microphone'} transcription recovered`);
      }).catch(() => { if (activeRef.current) scheduleReconnect(channel); });
    }, waitMs);
  }

  async function connectRealtime(channel: Channel, stream: MediaStream, signal: AbortSignal) {
    const credential = await invoke<RealtimeCredential>('desktop_realtime', { channel, clientTurnDetection: false });
    signal.throwIfAborted();
    const peer = new RTCPeerConnection();
    const track = stream.getAudioTracks()[0];
    if (!track) throw new Error(`${channel === 'interviewer' ? 'System audio' : 'Microphone'} did not provide an audio track.`);
    peer.addTrack(track, stream);
    const events = peer.createDataChannel('oai-events');
    events.onmessage = (event) => { if (!signal.aborted) handleRealtimeEvent(channel, event.data as string); };
    peer.onconnectionstatechange = () => {
      if (signal.aborted) return;
      if (peer.connectionState === 'connected') { reconnectAttemptRef.current[channel] = 0; setReconnectAttempts({ ...reconnectAttemptRef.current }); }
      if (['failed', 'disconnected'].includes(peer.connectionState)) scheduleReconnect(channel);
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let rejectOpen: (error: Error) => void = () => undefined;
    const opened = new Promise<void>((resolve, reject) => {
      rejectOpen = reject;
      timer = setTimeout(() => reject(new Error('The realtime channel timed out.')), 30_000);
      events.onopen = () => resolve();
      events.onerror = () => reject(new Error('The realtime event channel failed.'));
    });
    // Attach a handler immediately; negotiation can fail before awaiting open.
    void opened.catch(() => undefined);
    const request = new AbortController();
    const abort = () => {
      request.abort();
      events.onmessage = null; peer.onconnectionstatechange = null;
      events.close(); peer.close();
      rejectOpen(new DOMException('Capture stopped', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
    const requestTimeout = setTimeout(() => request.abort(), 25_000);
    try {
      signal.throwIfAborted();
      const offer = await peer.createOffer(); await peer.setLocalDescription(offer);
      const sdp = await fetch(credential.endpoint || 'https://api.openai.com/v1/realtime/calls', { method: 'POST', headers: { authorization: `Bearer ${credential.clientSecret}`, 'content-type': 'application/sdp' }, body: offer.sdp, signal: request.signal });
      const answer = await sdp.text();
      if (!sdp.ok) throw new Error('The transcription service could not connect. Stop listening and retry.');
      await peer.setRemoteDescription({ type: 'answer', sdp: answer }); await opened;
      signal.throwIfAborted();
      if (!stream.getAudioTracks().some(track => track.readyState === 'live')) throw new Error('The audio source was stopped.');
      channelsRef.current[channel] = { peer, events };
    } catch (error) {
      events.onmessage = null; peer.onconnectionstatechange = null; events.close(); peer.close(); throw error;
    } finally { clearTimeout(timer); clearTimeout(requestTimeout); signal.removeEventListener('abort', abort); }
  }

  function startMicMonitor(stream: MediaStream) {
    const audioContext = new AudioContext(); const analyser = audioContext.createAnalyser(); analyser.fftSize = 256; audioContext.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    const measure = () => { analyser.getByteTimeDomainData(samples); let energy = 0; for (const sample of samples) { const value = (sample - 128) / 128; energy += value * value; } setMicLevel(Math.min(1, Math.sqrt(energy / samples.length) * 4)); const frame = window.requestAnimationFrame(measure); if (micMonitorRef.current) micMonitorRef.current.frame = frame; };
    micMonitorRef.current = { audioContext, frame: window.requestAnimationFrame(measure) };
  }

  async function refreshSystemAudio(announce = false) {

    setSystemAudio((current) => ({ ...current, state: 'checking', reason: 'Checking macOS Screen & System Audio Recording access…' }));
    try { const next = await invoke<SystemAudioStatus>('system_audio_status'); setSystemAudio(next); if (announce) setStatus(next.reason); return next; }
    catch (error) { const message = realtimeFailure(error); const next: SystemAudioStatus = { ...initialSystemAudioStatus, state: 'captureFailed', reason: message }; setSystemAudio(next); if (announce) setStatus(message); return next; }
  }
  async function grantSystemAudio() {

    setSystemAudio((current) => ({ ...current, state: 'checking', reason: 'Opening the macOS permission request…' })); setStatus('Requesting Screen & System Audio Recording access…');
    try { const next = await invoke<SystemAudioStatus>('request_system_audio_permission'); setSystemAudio(next); setStatus(next.reason); }
    catch (error) { const message = realtimeFailure(error); setSystemAudio((current) => ({ ...current, state: 'captureFailed', reason: message })); setStatus(message); }
  }
  async function repairSystemAudio() {

    setStatus('Resetting Torvi’s macOS permission record…');
    try { const next = await invoke<SystemAudioStatus>('repair_system_audio_permission'); setSystemAudio(next); setStatus(next.reason); }
    catch (error) { const message = realtimeFailure(error); setSystemAudio((current) => ({ ...current, state: 'captureFailed', reason: message })); setStatus(message); }
  }
  function applyNativeAudioFailure(failure: SystemAudioFailure) {
    setSystemAudio((current) => ({ ...current, state: failure.state, permissionGranted: failure.state !== 'permissionRequired', captureActive: false, reason: `${failure.message} (${failure.category} · ${failure.stage}${failure.code == null ? '' : ` · ${failure.code}`})` })); setStatus(failure.message);
  }

  async function acquireMicrophone(signal: AbortSignal): Promise<MediaStream> {
    if (!/Mac/i.test(navigator.platform)) {
      const stream = await requestMicrophone();
      if (signal.aborted) { stream.getTracks().forEach(track => track.stop()); signal.throwIfAborted(); }
      return stream;
    }
    await invoke('stop_microphone_capture');
    signal.throwIfAborted();
    await micBridgeRef.current?.close();
    signal.throwIfAborted();
    micBridgeRef.current = await createSystemAudioBridge();
    signal.throwIfAborted();
    // The helper reports ready only after receiving actual input-device frames.
    // Set the teardown flag before the bounded native command can reject.
    nativeMicStartedRef.current = true;
    await invoke('start_microphone_capture');
    signal.throwIfAborted();
    return micBridgeRef.current.stream;
  }

  async function startCapture(signal: AbortSignal) {
    if (!contextRef.current) { setLaunchOpen(true); await setAssistantPanel('expanded'); return; }
    const session = contextRef.current.session;
    if (sessionOriginRef.current.id !== session.id) sessionOriginRef.current = { id: session.id, startedAt: session.startedAt ?? Date.now() };
    setCaptureError('');
    if (audioSourceRef.current !== 'microphone') {
      const permission = await refreshSystemAudio();
      signal.throwIfAborted();
      if (permission.state === 'permissionRequired') throw new Error('Screen Recording permission is required for system audio. Choose Microphone or enable access in Settings.');
      if (permission.state === 'restartRequired') throw new Error('Restart Torvi once to apply Screen Recording access.');
      nativeCaptureStartedRef.current = true;
      const audioStatus = await invoke<SystemAudioStatus>('start_audio_capture', { includeSystemAudio: true });
      signal.throwIfAborted();
      setSystemAudio(audioStatus);
      systemAudioBridgeRef.current = await createSystemAudioBridge();
      signal.throwIfAborted();
      await connectRealtime('interviewer', systemAudioBridgeRef.current.stream, signal);
    }
    if (audioSourceRef.current !== 'system') {
      const microphone = await acquireMicrophone(signal);
      micStreamRef.current = microphone;
      signal.throwIfAborted();
      setMicConnected(true); setMicMuted(false);
      if (!micBridgeRef.current) startMicMonitor(microphone);
      await connectRealtime('candidate', microphone, signal);
    }
    signal.throwIfAborted();
    activeRef.current = true; setActive(true); setSourceVerified(false);
    setGenerationError(''); setStatus('Listening');
  }

  async function stopCapture(nextStatus = 'Live audio paused', failure?: SystemAudioFailure) {
    cancelActiveSuggestion(); setSuggestionLoading(false);
    activeRef.current = false; setActive(false);
    if (partialQuestionTimerRef.current != null) window.clearTimeout(partialQuestionTimerRef.current);
    partialQuestionTimerRef.current = null;
    partialsRef.current = { interviewer: {}, candidate: {} }; setPartial('');
    return captureLifecycleRef.current.stop(async () => {
      const stopNative = activeRef.current || nativeCaptureStartedRef.current;
      nativeCaptureStartedRef.current = false;
      activeRef.current = false; setActive(false); setLevel(0); setMicLevel(0); setSourceVerified(false);
      const stopNativeMic = nativeMicStartedRef.current;
      nativeMicStartedRef.current = false;
      if (stopNativeMic) await invoke('stop_microphone_capture').catch(() => undefined);
      Object.values(reconnectTimersRef.current).forEach((timer) => window.clearTimeout(timer)); reconnectTimersRef.current = {};
      reconnectAttemptRef.current = { interviewer: 0, candidate: 0 }; setReconnectAttempts({ interviewer: 0, candidate: 0 });
      micStreamRef.current?.getTracks().forEach((track) => track.stop()); micStreamRef.current = null; setMicConnected(false);
      const micBridge = micBridgeRef.current; micBridgeRef.current = null; await micBridge?.close().catch(() => undefined);
      if (micMonitorRef.current) { window.cancelAnimationFrame(micMonitorRef.current.frame); void micMonitorRef.current.audioContext.close(); micMonitorRef.current = null; }
      const systemAudioBridge = systemAudioBridgeRef.current; systemAudioBridgeRef.current = null; await systemAudioBridge?.close().catch(() => undefined);
      Object.values(channelsRef.current).forEach((channel) => channel?.peer.close()); channelsRef.current = {};
      if (stopNative) await invoke('stop_audio_capture').catch(() => undefined);
      if (failure) { applyNativeAudioFailure(failure); return; }
      const nextAudio = await invoke<SystemAudioStatus>('system_audio_status').catch(() => null); if (nextAudio) setSystemAudio(nextAudio); setStatus(nextStatus);
    });
  }
  async function toggleCapture() {
    if (captureBusyRef.current || finishingRef.current) return;
    captureBusyRef.current = true;
    setCaptureIntent(activeRef.current ? 'stopping' : 'starting');
    try {
      if (activeRef.current) await stopCapture();
      else { captureLifecycleRef.current.begin(); await captureLifecycleRef.current.run(startCapture); }
    }
    catch (error) { if (captureLifecycleRef.current.cancelled) return; setCaptureError(realtimeFailure(error)); const nativeFailure = nativeAudioFailure(error); await stopCapture(realtimeFailure(error), nativeFailure ?? undefined); }
    finally { captureBusyRef.current = false; setCaptureIntent('idle'); }
  }

  async function runCapturePrimaryAction() {
    if (captureBusyRef.current || finishing) return;
    if (activeRef.current) return toggleCapture();
    if (audioSource !== 'microphone' && systemAudio.state === 'permissionRequired') return grantSystemAudio();
    if (audioSource !== 'microphone' && systemAudio.state === 'restartRequired') { relaunchApp(); return; }
    if (audioSource !== 'microphone' && systemAudio.state === 'captureFailed') { await refreshSystemAudio(true); }
    return toggleCapture();
  }

  function emitTiming(event: 'question.detected' | 'transcription.delta' | 'suggestion.first_useful' | 'generation.failed', durationMs: number | null, status: 'ready' | 'warning' | 'failed' | 'success' = 'success') {
    if (durationMs == null || !contextRef.current) return;
    void desktopApi('POST', '/api/v1/telemetry', {
      event, platform: 'macos', durationMs, status, appVersion: desktopAppVersion,
      locale: contextRef.current.session.locale, mode: contextRef.current.session.mode,
    }).catch(() => undefined);
  }

  function cancelActiveSuggestion() {
    suggestionIntentRef.current += 1;
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
      const parsed = suggestionSchema.safeParse(event.suggestion);
      if (!parsed.success) {
        cancelActiveSuggestion(); setSuggestionLoading(false); setStreamingAnswer('');
        setGenerationError('The AI returned an invalid response. Please retry.'); return;
      }
      current.metrics.completedAt = eventTimestamp();
      setSuggestion(parsed.data);
      savedInteractionsRef.current.push({ id: current.requestId, question: current.question, suggestion: parsed.data, createdAt: Date.now() });
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
      const message = event.message || 'The assistant could not complete this answer. Please retry.';
      setGenerationError(message); setStatus(message);
    }
  }

  async function askCoach(nextQuestion = questionRef.current, responseMode: 'tiny' | 'concise' | 'standard' | 'detailed' = 'concise', source: PipelineMetrics['source'] = 'manual') {
    if (finishingRef.current) return;
    if (!contextRef.current) { setLaunchOpen(true); await setAssistantPanel('expanded'); return; }
    if (nextQuestion.trim().length < 2) return;
    if (savedInteractionsRef.current.length >= 200) { setGenerationError('Save this session before requesting more answers; its AI history limit has been reached.'); return; }
    if (!navigator.onLine) { setGenerationError('You’re offline. Reconnect and retry.'); return; }
    cancelActiveSuggestion();
    const intent = suggestionIntentRef.current;
    setGenerationError(''); setSuggestionLoading(true);
    const liveScreenContext = source === 'manual' && screenContextEnabled
      ? await captureCurrentScreen()
      : null;
    if (intent !== suggestionIntentRef.current) return;
    if (source === 'manual' && screenContextEnabled && !liveScreenContext) { setSuggestionLoading(false); setGenerationError('Screen context was unavailable. Enable Screen Recording in Settings, or turn Screen off and retry.'); return; }
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
      await invoke('desktop_suggest', { requestId, payload: { question: nextQuestion, screenContext: liveScreenContext || undefined, mode: copilotMode, locale: contextRef.current.session.locale, responseMode, responseStyle, transcript: suggestionTranscript(segmentsRef.current), verifiedFacts: [], target: {} } });
      const current = activeSuggestionRef.current;
      if (current?.requestId === requestId) {
        current.parser.finish((event) => handleSuggestionStreamEvent({ ...event, requestId }));
        if (activeSuggestionRef.current?.requestId === requestId) throw new Error('The coach returned an incomplete answer. Retry keeps the session open.');
      }
    } catch (error) {
      if (activeSuggestionRef.current?.requestId !== requestId) return;
      activeSuggestionRef.current = null; setStreamingAnswer(''); setGenerationError(realtimeFailure(error)); setStatus(realtimeFailure(error));
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

    setScreenAnalyzing(true); setStatus('Reading the display under your pointer once…');
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
    if (finishingRef.current) return;
    finishingRef.current = true;
    setFinishing(true);
    try {
      cancelActiveSuggestion(); setSuggestionLoading(false);
      await stopCapture('Finishing session…');
      await invoke('desktop_finish', { choice, liveSeconds: seconds, segments: segmentsRef.current, interactions: choice === 'save' ? savedInteractionsRef.current : [] });
      savedInteractionsRef.current = [];
      setContext(null); setSuggestion(null); setQuestion(''); setSegments([]); setBrain(null); setCaptures([]); setScreenAnalysis(''); setSurface('live');
      setStatus(choice === 'save' ? 'Session saved — notes and follow-through are ready' : 'Session discarded — transcript deleted');
      await returnToWorkspace('sessions');
    } catch (error) { setStatus(realtimeFailure(error)); }
    finally { finishingRef.current = false; setFinishing(false); }
  }

  async function signOut() {
    await stopCapture();
    await invoke('disconnect_desktop'); setContext(null); setAccount(null); setSurface('live'); setStatus('Signed out from this Mac');
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

    const expandedSizes: Record<AssistantSize, [number, number]> = {
      compact: [440, 390], standard: [500, 500], expanded: [560, 620],
    };
    const [width, height] = panelState === 'collapsed' ? [460, 58] : expandedSizes[size];
    await getCurrentWindow().setSize(new LogicalSize(width, height));
    await windowStateRef.current?.ensureVisible();
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

  async function returnToWorkspace(view: 'home' | 'live' | 'sessions' = 'home') {
    setWorkspaceView(view);
    if (focusModeRef.current) await toggleFocusMode(false);
    setSurface('workspace');
    await getCurrentWindow().setSize(new LogicalSize(920, 720));
  }

  async function activateAssistant() {
    await getCurrentWindow().show().catch(() => undefined);
    setSurface('live');
    if (!focusModeRef.current) await toggleFocusMode(true);
    await setAssistantPanel('expanded', true);
  }

  async function askOrOpenAssistant() {
    await activateAssistant();
    await askRef.current(questionRef.current.trim() || assistantActions[0].prompt);
  }

  function clearAssistantThread() {
    cancelActiveSuggestion();
    setSuggestionLoading(false);
    setGenerationError('');
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

    const windowState = new WindowStateManager();
    windowStateRef.current = windowState;
    void windowState.init().then(({ mode, density: savedDensity, preferences, shortcuts: savedShortcuts, desktopPreferences: savedDesktopPreferences }) => {
      setDensity(savedDensity);
      assistantPreferencesRef.current = preferences;
      setAssistantPreferences(preferences);
      shortcutsRef.current = savedShortcuts;
      setShortcuts(savedShortcuts);
      setDesktopPreferences(savedDesktopPreferences);
      focusModeRef.current = true;
      setFocusMode(true);
      return Promise.all([
        invoke('configure_focus_mode', { enabled: true, clickThrough: false }),
        resizeAssistant('collapsed', preferences.assistantSize).then(() => getCurrentWindow().show()),
      ]);
    }).catch(error => { setGenerationError(realtimeFailure(error)); void getCurrentWindow().show(); });
    const restoreTimer = window.setTimeout(() => { void restoreConnection(); }, 0); const audioStatusTimer = window.setTimeout(() => { void refreshSystemAudio(); }, 0);
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
      listen<AudioChunk>('native-audio-chunk', ({ payload }) => { if (disposed || !activeRef.current) return; lastNativeAudioAtRef.current = eventTimestamp(); const samples = decodeAudioChunk(payload); const nextLevel = chunkLevel(samples); setLevel(nextLevel); if (nextLevel > 0.015) { setSourceVerified(true);  } if (systemAudioBridgeRef.current && !systemAudioBridgeRef.current.push(samples, payload.sampleRate)) setDroppedChunks((value) => value + 1); }).then((unlisten) => { if (disposed) unlisten(); else cleanup.push(unlisten); }),
      listen<SystemAudioFailure>('native-audio-error', ({ payload }) => { if (!disposed && activeRef.current) { setCaptureError(payload.message || 'System audio stopped. Retry audio.'); void stopCapture(payload.message || 'System audio capture stopped.', payload); } }).then((unlisten) => { if (disposed) unlisten(); else cleanup.push(unlisten); }),
      listen('native-audio-ended', () => { if (!disposed && activeRef.current && nativeCaptureStartedRef.current) { setCaptureError('System audio disconnected. Retry audio.'); void stopCapture('System audio disconnected'); } }).then((unlisten) => { if (disposed) unlisten(); else cleanup.push(unlisten); }),
      listen<AudioChunk>('native-microphone-chunk', ({ payload }) => {
        if (disposed || !activeRef.current || !nativeMicStartedRef.current) return;
        const samples = decodeAudioChunk(payload);
        const enabled = micStreamRef.current?.getAudioTracks()[0]?.enabled !== false;
        setMicLevel(enabled ? chunkLevel(samples) : 0);
        if (enabled && micBridgeRef.current && !micBridgeRef.current.push(samples, payload.sampleRate)) setDroppedChunks(value => value + 1);
      }).then(unlisten => { if (disposed) unlisten(); else cleanup.push(unlisten); }),
      listen<string>('native-microphone-error', ({ payload }) => { if (!disposed && activeRef.current && nativeMicStartedRef.current) { setCaptureError(payload); void stopCapture(payload); } }).then(unlisten => { if (disposed) unlisten(); else cleanup.push(unlisten); }),
      listen('native-microphone-ended', () => { if (!disposed && activeRef.current && nativeMicStartedRef.current) { setCaptureError('Microphone disconnected. Retry audio.'); void stopCapture('Microphone disconnected'); } }).then(unlisten => { if (disposed) unlisten(); else cleanup.push(unlisten); }),
      listen<SuggestionChunk>('desktop-suggestion-chunk', ({ payload }) => { const current = activeSuggestionRef.current; if (!disposed && current?.requestId === payload.requestId) current.parser.feed(payload.bytes, (event) => handleSuggestionStreamEvent({ ...event, requestId: payload.requestId })); }).then((unlisten) => { if (disposed) unlisten(); else cleanup.push(unlisten); }),
    ]).catch(() => setStatus('A native event listener could not start. Restart Torvi to try again.'));
    void invoke('configure_share_safe_overlay', { enabled: false }).catch(error => setGenerationError(realtimeFailure(error)));
    return () => { window.clearTimeout(restoreTimer); window.clearTimeout(audioStatusTimer); if (partialQuestionTimerRef.current != null) window.clearTimeout(partialQuestionTimerRef.current); cancelActiveSuggestion(); window.removeEventListener('focus', handleWindowFocus); window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); window.removeEventListener('keydown', handleKeys); navigator.mediaDevices?.removeEventListener('devicechange', handleDevices); disposed = true; cleanup.forEach((dispose) => dispose()); void windowState.dispose(); void stopCapture(); };
    // Native listeners are installed once; current values are held in refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  React.useEffect(() => {

    let disposed = false;
    const shortcutManager = shortcutManagerRef.current;
    void shortcutManager.update(shortcuts, {
      toggleAssistant: () => { void askOrOpenAssistant(); },
      toggleListening: () => { void toggleRef.current(); },
      hideAssistant: () => { void getCurrentWindow().isVisible().then(visible => visible ? hideWindow() : activateAssistant()); },
      toggleOverlay: () => { void activateAssistant(); },
      dismissAssistant: () => { void setAssistantPanel('collapsed'); },
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
  const captureBusy = captureIntent !== 'idle' || (audioSource !== 'microphone' && (systemAudio.state === 'checking' || systemAudio.state === 'starting'));
  const captureActionKind: 'start' | 'stop' | 'permission' | 'restart' | 'retry' = active ? 'stop' : audioSource === 'microphone' ? 'start' : systemAudio.state === 'permissionRequired' ? 'permission' : systemAudio.state === 'restartRequired' ? 'restart' : systemAudio.state === 'captureFailed' ? 'retry' : 'start';
  const captureActionLabel = active ? (captureIntent === 'stopping' ? 'Stopping…' : 'Stop listening') : captureBusy ? 'Starting…' : captureActionKind === 'permission' ? 'Grant audio access' : captureActionKind === 'restart' ? 'Restart Torvi' : captureActionKind === 'retry' ? 'Retry audio check' : 'Listen';
  const captureActionHint = active ? 'Torvi is hearing the conversation and generating live assistance.' : captureActionKind === 'permission' ? 'macOS needs explicit Screen & System Audio Recording access before Torvi can listen.' : captureActionKind === 'restart' ? 'Torvi must restart once so macOS can apply the new audio permission.' : captureActionKind === 'retry' ? 'The last audio check failed. Retry it without losing the prepared session.' : audioSource === 'microphone' ? 'Start live microphone transcription.' : audioSource === 'system' ? 'Start live system audio transcription.' : 'Start live microphone and system audio transcription.';
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

  return <main className={`app-frame surface-${surface} appearance-${assistantPreferences.appearanceMode} ${surface === 'live' ? 'focus-mode' : ''}`} style={frameStyle}>
    {surface === 'workspace' ? <>
      <header className="management-header window-drag-region" onMouseDown={startWindowDrag}><b>Torvi <small>{desktopAppVersion}</small></b><button onClick={() => void openLiveOverlay()}>Back to assistant</button></header>
      <React.Suspense fallback={<p>Opening settings…</p>}><ControlCenter account={account} activeContext={context} initialView={workspaceView} recording={active} liveView={context ? <LiveTranscript segments={segments} active={active} seconds={seconds} title={context.target?.role || 'Live conversation'} onAssistant={() => void openLiveOverlay()} onPause={() => void runCapturePrimaryAction()} onFinish={() => void finish('save')} busy={captureBusy || finishing} /> : undefined} appVersion={desktopAppVersion} assistantPreferences={assistantPreferences} desktopPreferences={desktopPreferences} shortcuts={shortcuts} shortcutConflicts={shortcutConflicts} onAssistantPreferencesChange={changeAssistantPreferences} onDesktopPreferencesChange={changeDesktopPreferences} onShortcutChange={changeShortcut} onResetShortcuts={resetShortcuts} onResetWindowPosition={resetWindowPosition} onResetAssistantAppearance={resetAssistantAppearance} onAuthenticated={setAccount} onOpenLive={() => context && void openLiveOverlay()} onSessionPrepared={(next) => { setSeconds(0); setContext(next); setCopilotMode(next.session.mode); setSegments([]); setSuggestion(null); setStreamingAnswer(''); setQuestion(''); void openLiveOverlay(); }} onSignOut={signOut} setStatus={setStatus} /></React.Suspense>
    </> : <AssistantOverlay
        generationError={generationError}
        captureError={captureError}
        leadingContent={launchOpen ? <SessionLauncher account={account} onAuthenticated={setAccount} onCancel={() => setLaunchOpen(false)} onReady={next => { setSeconds(0); contextRef.current = next; setContext(next); setCopilotMode(next.session.mode); setLaunchOpen(false); setStatus('Ready'); }} /> : null}
        auxiliaryControls={<>
          {active && micConnected && <label><input type="checkbox" checked={micMuted} onChange={event => { const muted = event.target.checked; micStreamRef.current?.getAudioTracks().forEach(track => { track.enabled = !muted; }); setMicMuted(muted); }} />Mute microphone</label>}
          <button onClick={() => void invoke('open_privacy_settings', { permission: 'microphone' }).catch(error => setGenerationError(realtimeFailure(error)))}>Microphone permission settings</button>
          <details><summary>Screen & system audio</summary><p>{systemAudio.reason}</p><button onClick={() => void grantSystemAudio()}>Grant system audio</button><button onClick={() => void invoke('open_privacy_settings', { permission: 'screen' }).catch(error => setGenerationError(realtimeFailure(error)))}>Open Screen Recording settings</button>{systemAudio.state === 'restartRequired' && <button onClick={relaunchApp}>Restart Torvi</button>}<details><summary>System audio diagnostics</summary><p>{systemAudio.diagnostics?.signingStable ? 'Stable signing identity' : 'Signing not verified'}</p><p>{systemAudio.diagnostics?.lastStage}</p><button onClick={() => { if (window.confirm('Reset Torvi’s Screen Recording permission? You will need to grant access again.')) void repairSystemAudio(); }}>Reset permission record (advanced)</button></details></details>
          <button onClick={() => void returnToWorkspace('live')}>Live transcript · open full workspace ({segments.length})</button>
          <label>Audio source<select aria-label="Audio source" disabled={active || captureBusy} value={audioSource} onChange={event => setAudioSource(event.target.value as typeof audioSource)}><option value="microphone">Microphone</option><option value="both">Microphone + system</option><option value="system">System audio</option></select></label>
          <label><input type="checkbox" checked={screenContextEnabled} onChange={event => setScreenContextEnabled(event.target.checked)} />Use screen on Ask</label><small>Captures the display under your pointer, excluding Torvi. Sent only when you ask.</small>
          <label><input type="checkbox" checked={privateOverlay} onChange={event => void setOverlayPrivacy(event.target.checked)} />Protect from supported screen capture</label><small>Native protection is best effort; modern capture tools may still include Torvi.</small>
          {context && <button disabled={finishing} onClick={() => void finish('save')}>{finishing ? 'Saving…' : 'End and save notes'}</button>}
          {context && <button disabled={finishing} onClick={() => { if (window.confirm('Discard this session and its transcript?')) void finish('discard'); }}>Discard session</button>}
          <button onClick={() => void returnToWorkspace()}>Settings, context & history</button><button onClick={quitApp}>Quit Torvi</button><small>Torvi {desktopAppVersion} · {__TORVI_BUILD_ID__}</small>
        </>}
        onCancel={() => { cancelActiveSuggestion(); setSuggestionLoading(false); setStreamingAnswer(''); setStatus('Response stopped. You can ask again.'); }}
        panelState={assistantPanelState}
        focusRequest={assistantFocusRequest}
        shortcut={shortcuts.toggleAssistant}
        active={active}
        muted={micMuted}
        online={online}
        mode={copilotMode}
        seconds={seconds}
        hasSession={Boolean(context)}
        onAssist={() => { void setAssistantPanel('expanded'); setQuestion(assistantActions[0].prompt); void askCoach(assistantActions[0].prompt); }}
        onModeChange={next => { if (modeRequiresVerifiedResume(next) && !context?.documents.some(d => d.kind === 'resume' && d.parseStatus === 'verified')) { setGenerationError('This mode needs a verified résumé. Add it in your workspace before switching.'); return; } setCopilotMode(next); }}
        onEnd={() => { if (window.confirm('End this session and save its transcript and notes?')) void finish('save'); }}
        finishing={finishing}
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
  </main>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(isNativeDesktop() ? <App /> : <main className="native-required"><h1>Open Torvi on your Mac</h1><p>This interface needs Torvi’s native runtime. Browser previews cannot capture audio, move desktop windows, or verify permissions.</p><p>Launch the installed Torvi.app to continue.</p></main>);
