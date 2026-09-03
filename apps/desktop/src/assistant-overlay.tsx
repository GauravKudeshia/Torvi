import React from 'react';
import type { InterviewMode, ResponseStyle, Suggestion } from '@interview-copilot/contracts';
import {
  ArrowUp, AudioWaveform, ChevronDown, ChevronUp, CircleStop, Copy, EyeOff,
  MessageCircleQuestion, Minus, Play, RotateCw, ShieldAlert, Shrink,
  SlidersHorizontal, Sparkles, Trash2, X,
} from 'lucide-react';
import { formatShortcut } from './shortcuts';
import {
  MIN_ASSISTANT_OPACITY,
  type AppearanceMode,
  type AssistantPreferences,
  type AssistantSize,
} from './window-state';

export type AssistantPanelState = 'collapsed' | 'expanded';

const appearanceModes: Array<{ id: AppearanceMode; label: string }> = [
  { id: 'dark', label: 'Dark' }, { id: 'light', label: 'Light' },
  { id: 'adaptive', label: 'Adaptive' }, { id: 'glass', label: 'Glass' },
];
const assistantSizes: Array<{ id: AssistantSize; label: string }> = [
  { id: 'compact', label: 'Compact' }, { id: 'standard', label: 'Standard' }, { id: 'expanded', label: 'Expanded' },
];
const responseStyles: Array<{ id: ResponseStyle; label: string }> = [
  { id: 'bullets', label: 'Points' }, { id: 'paragraph', label: 'Paragraph' }, { id: 'adaptive', label: 'Adaptive' },
];
const quickActions = [
  { label: 'What should I say next?', prompt: 'What should I say next?' },
  { label: 'Summarize', prompt: 'Summarize the conversation so far.' },
  { label: 'Key points', prompt: 'Give me the key points from this conversation.' },
  { label: 'Explain this', prompt: 'Explain what is currently being discussed in plain language.' },
  { label: 'Follow-up', prompt: 'Draft the best follow-up question for this moment.' },
  { label: 'Action items', prompt: 'List the action items, owners, and deadlines mentioned so far.' },
];

function answerText(suggestion: Suggestion | null, streamingAnswer: string, style: ResponseStyle, size: AssistantSize) {
  if (streamingAnswer) return streamingAnswer;
  if (!suggestion) return '';
  const points = suggestion.supportingPoints.length ? suggestion.supportingPoints : suggestion.bullets;
  if (style === 'bullets') return points.length ? points.join('\n') : suggestion.directAnswer || suggestion.answer;
  if (style === 'paragraph') return suggestion.expandedAnswer || suggestion.answer || suggestion.directAnswer;
  if (size === 'compact') return suggestion.directAnswer || suggestion.answer;
  if (size === 'expanded') return suggestion.expandedAnswer || suggestion.answer || suggestion.directAnswer;
  return points.length ? points.join('\n') : suggestion.directAnswer || suggestion.answer;
}

function Answer({ suggestion, streamingAnswer, loading, active, style, size }: {
  suggestion: Suggestion | null; streamingAnswer: string; loading: boolean; active: boolean; style: ResponseStyle; size: AssistantSize;
}) {
  if (loading && !streamingAnswer) return <div className="hud-loading" aria-live="polite"><i /><span>Preparing a grounded answer…</span></div>;
  const text = answerText(suggestion, streamingAnswer, style, size);
  if (!text) return <p className="hud-empty">{active ? 'Listening for a complete question…' : 'Start listening, or type a question below.'}</p>;
  const points = text.split('\n').map((item) => item.replace(/^[-•]\s*/, '').trim()).filter(Boolean);
  const showPoints = style === 'bullets' || (style === 'adaptive' && points.length > 1);
  return showPoints
    ? <ul className="hud-points">{points.map((point, index) => <li key={`${point}:${index}`}>{point}</li>)}</ul>
    : <p className={`hud-answer ${streamingAnswer ? 'streaming' : ''}`}>{text}{streamingAnswer && <i aria-label="Answer is streaming" />}</p>;
}

type AssistantOverlayProps = {
  panelState: AssistantPanelState; focusRequest: number; shortcut: string; active: boolean; online: boolean;
  mode: InterviewMode; question: string; questionIsLive: boolean; prompt: string; suggestion: Suggestion | null;
  streamingAnswer: string; loading: boolean; status: string; captureActionLabel: string; captureActionHint: string;
  captureActionKind: 'start' | 'stop' | 'permission' | 'restart' | 'retry'; captureBusy: boolean;
  preferences: AssistantPreferences; onPanelChange: (state: AssistantPanelState, focusPrompt?: boolean) => void;
  onPromptChange: (value: string) => void; onSubmit: (prompt: string) => void; onQuickAction: (prompt: string) => void;
  onClear: () => void; onPreferencesChange: (patch: Partial<AssistantPreferences>) => void; onResetAppearance: () => void;
  onToggleListening: () => void; onShorter: () => void; onExpand: () => void; onFollowUp: () => void;
  onHide: () => void; onClose: () => void; onDragStart: (event: React.MouseEvent<HTMLElement>) => void;
};

export function AssistantOverlay(props: AssistantOverlayProps) {
  const {
    panelState, focusRequest, shortcut, active, online, mode, question, questionIsLive, prompt,
    suggestion, streamingAnswer, loading, status, captureActionLabel, captureActionHint,
    captureActionKind, captureBusy, preferences, onPanelChange, onPromptChange, onSubmit,
    onQuickAction, onClear, onPreferencesChange, onResetAppearance, onToggleListening,
    onShorter, onExpand, onFollowUp, onHide, onClose, onDragStart,
  } = props;
  const [appearanceOpen, setAppearanceOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const inputRef = React.useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  const currentAnswer = answerText(suggestion, streamingAnswer, preferences.responseStyle, preferences.assistantSize);
  const hasError = /could not|denied|failed|unavailable|offline|permission|required|restart/i.test(status);
  const PrimaryIcon = captureBusy ? RotateCw : captureActionKind === 'stop' ? CircleStop : captureActionKind === 'permission' ? ShieldAlert : captureActionKind === 'restart' || captureActionKind === 'retry' ? RotateCw : Play;

  React.useEffect(() => { if (focusRequest > 0) inputRef.current?.focus(); }, [focusRequest, panelState]);

  async function copyAnswer() {
    if (!currentAnswer) return;
    await navigator.clipboard.writeText(currentAnswer);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_200);
  }
  function submit() { const value = prompt.trim(); if (value && !loading) onSubmit(value); }

  const rootClass = `assistant-hud assistant-${panelState} appearance-${preferences.appearanceMode} assistant-size-${preferences.assistantSize}`;
  const rootStyle = { '--assistant-surface-alpha': String(preferences.windowOpacity / 100) } as React.CSSProperties;

  if (panelState === 'collapsed') return <section className={rootClass} style={rootStyle} aria-label="Torvi compact assistant">
    <div className="assistant-surface" aria-hidden="true" />
    <div className="hud-collapsed-drag window-drag-region" onMouseDown={onDragStart} title="Drag Torvi anywhere"><span className="hud-mark" aria-hidden="true"><i /><i /><i /></span><i className={`hud-live-dot ${active ? 'active' : ''}`} aria-hidden="true" /></div>
    <input ref={inputRef as React.RefObject<HTMLInputElement>} className="hud-collapsed-input" value={prompt} aria-label="Ask Torvi" placeholder="Ask anything…" onFocus={() => onPanelChange('expanded', true)} onChange={(event) => onPromptChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); onPanelChange('expanded', true); } }} />
    <kbd className="hud-shortcut-hint">{formatShortcut(shortcut)}</kbd>
    <button className="hud-collapse-listen" aria-label={captureActionLabel} title={captureActionHint} disabled={captureBusy} onClick={onToggleListening}><PrimaryIcon className={captureBusy ? 'spin' : ''} /></button>
    <button aria-label="Expand assistant" title="Expand assistant" onClick={() => onPanelChange('expanded', true)}><ChevronUp /></button>
    <button aria-label="Hide assistant" title="Hide assistant" onClick={onHide}><Minus /></button>
  </section>;

  return <section className={rootClass} style={rootStyle} aria-label="Torvi assistant">
    <div className="assistant-surface" aria-hidden="true" />
    <header className="hud-header window-drag-region" onMouseDown={onDragStart}>
      <div className="hud-identity"><span className="hud-mark" aria-hidden="true"><i /><i /><i /></span><span><b>Torvi</b><small>{mode.replaceAll('-', ' ')} copilot</small></span></div>
      <span className={`hud-session-state ${active ? 'active' : ''}`}><i aria-hidden="true" />{active ? 'Listening' : captureBusy ? 'Starting' : 'Ready'}</span>
      <span className={`hud-network ${online ? '' : 'offline'}`} title={status}>{online ? 'Live' : 'Offline'}</span>
      <div className="hud-window-actions" data-no-drag><button onClick={() => onPanelChange('collapsed')} title="Collapse assistant" aria-label="Collapse assistant"><ChevronDown /></button><button onClick={onHide} title="Hide assistant" aria-label="Hide assistant"><Minus /></button><button onClick={onClose} title="Close overlay and return to workspace" aria-label="Close overlay"><X /></button></div>
    </header>

    <div className="hud-body">
      <div className={`hud-status ${hasError ? 'attention' : active ? 'active' : ''}`} role={hasError ? 'alert' : 'status'} aria-live="polite"><AudioWaveform aria-hidden="true" /><span><b>{active ? 'Live audio is connected' : captureActionHint}</b><small>{status}</small></span></div>
      <div className="hud-question"><span>{questionIsLive ? 'Detected question' : 'Current request'}</span><p>{question || 'No request yet'}</p></div>
      <article className="hud-suggestion" aria-live="polite" aria-busy={loading}><div className="hud-answer-heading"><span>Suggested answer</span>{suggestion && <small>{suggestion.grounding.level.replaceAll('_', ' ')} context</small>}</div><Answer suggestion={suggestion} streamingAnswer={streamingAnswer} loading={loading} active={active} style={preferences.responseStyle} size={preferences.assistantSize} /></article>
      <div className="hud-answer-actions" data-no-drag><button disabled={!currentAnswer} onClick={() => void copyAnswer()} title="Copy answer"><Copy />{copied ? 'Copied' : 'Copy'}</button><button disabled={!currentAnswer} onClick={onShorter} title="Make answer shorter"><Shrink />Shorter</button><button disabled={!currentAnswer} onClick={onExpand} title="Expand answer"><Sparkles />Go deeper</button><button disabled={!suggestion} onClick={onFollowUp} title="Prepare a likely follow-up"><MessageCircleQuestion />Follow-up</button><button disabled={!question && !prompt} onClick={onClear} title="Clear current assistant thread"><Trash2 />Clear</button></div>
      <div className="hud-quick-actions" aria-label="Quick actions">{quickActions.map((action) => <button key={action.label} onClick={() => onQuickAction(action.prompt)}>{action.label}</button>)}</div>
      <div className="hud-composer" data-no-drag><textarea ref={inputRef as React.RefObject<HTMLTextAreaElement>} value={prompt} aria-label="Ask Torvi anything" placeholder="Ask anything about your screen or conversation…" rows={2} onChange={(event) => onPromptChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); submit(); } }} /><button className="hud-send" disabled={!prompt.trim() || loading} onClick={submit} aria-label="Send request"><ArrowUp /><kbd>{formatShortcut(shortcut)}</kbd></button></div>
    </div>

    <footer className="hud-footer" data-no-drag>
      <button className={`hud-primary-action ${captureActionKind}`} disabled={captureBusy} onClick={onToggleListening} aria-describedby="hud-primary-hint"><PrimaryIcon className={captureBusy ? 'spin' : ''} /><span>{captureActionLabel}</span></button><span id="hud-primary-hint" className="sr-only">{captureActionHint}</span>
      <div className="hud-format" role="group" aria-label="Answer format">{responseStyles.map((item) => <button type="button" key={item.id} className={preferences.responseStyle === item.id ? 'active' : ''} aria-pressed={preferences.responseStyle === item.id} onClick={() => onPreferencesChange({ responseStyle: item.id })}>{item.label}</button>)}</div>
      <div className={`hud-appearance ${appearanceOpen ? 'open' : ''}`}><button className="hud-appearance-trigger" aria-expanded={appearanceOpen} aria-controls="hud-appearance-panel" aria-label="Assistant appearance" title="Assistant appearance" onClick={() => setAppearanceOpen((value) => !value)}><SlidersHorizontal /></button><section id="hud-appearance-panel" className="hud-appearance-panel" aria-label="Appearance controls"><header><span>Appearance</span><button onClick={onResetAppearance}>Reset</button></header><label className="hud-opacity-label"><span>Window opacity <b>{preferences.windowOpacity}%</b></span><input aria-label="Window opacity" type="range" min={MIN_ASSISTANT_OPACITY} max="100" value={preferences.windowOpacity} onInput={(event) => onPreferencesChange({ windowOpacity: Number(event.currentTarget.value) })} /><small>Opacity changes the app UI only.</small></label><div className="hud-option-group"><span>Theme</span><div>{appearanceModes.map((item) => <button type="button" key={item.id} aria-pressed={preferences.appearanceMode === item.id} className={preferences.appearanceMode === item.id ? 'active' : ''} onClick={() => onPreferencesChange({ appearanceMode: item.id })}>{item.label}</button>)}</div></div><div className="hud-option-group"><span>Size</span><div>{assistantSizes.map((item) => <button type="button" key={item.id} aria-pressed={preferences.assistantSize === item.id} className={preferences.assistantSize === item.id ? 'active' : ''} onClick={() => onPreferencesChange({ assistantSize: item.id })}>{item.label}</button>)}</div></div></section></div>
      <span className="hud-privacy" title="Private Overlay must be enabled to hide Torvi from supported capture paths"><EyeOff />Local overlay</span>
    </footer>
  </section>;
}
