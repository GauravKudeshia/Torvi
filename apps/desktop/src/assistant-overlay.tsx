import React from 'react';
import type { InterviewMode, ResponseStyle, Suggestion } from '@interview-copilot/contracts';
import {
  AudioWaveform,
  CircleStop,
  Copy,
  Expand,
  EyeOff,
  MessageCircleQuestion,
  Minus,
  Play,
  RotateCw,
  ShieldAlert,
  Shrink,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import {
  MIN_ASSISTANT_OPACITY,
  type AppearanceMode,
  type AssistantPreferences,
  type AssistantSize,
} from './window-state';

const appearanceModes: Array<{ id: AppearanceMode; label: string }> = [
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
  { id: 'adaptive', label: 'Adaptive' },
  { id: 'glass', label: 'Glass' },
];

const assistantSizes: Array<{ id: AssistantSize; label: string }> = [
  { id: 'compact', label: 'Compact' },
  { id: 'standard', label: 'Standard' },
  { id: 'expanded', label: 'Expanded' },
];

const responseStyles: Array<{ id: ResponseStyle; label: string }> = [
  { id: 'bullets', label: 'Points' },
  { id: 'paragraph', label: 'Paragraph' },
  { id: 'adaptive', label: 'Adaptive' },
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
  suggestion: Suggestion | null;
  streamingAnswer: string;
  loading: boolean;
  active: boolean;
  style: ResponseStyle;
  size: AssistantSize;
}) {
  if (loading && !streamingAnswer) return <div className="hud-loading" aria-live="polite"><i /><span>Preparing a grounded answer…</span></div>;
  const text = answerText(suggestion, streamingAnswer, style, size);
  if (!text) return <p className="hud-empty">{active ? 'Listening for a complete question…' : 'Start listening when the conversation begins.'}</p>;
  const points = text.split('\n').map((item) => item.trim()).filter(Boolean);
  const showPoints = style === 'bullets' || (style === 'adaptive' && size === 'standard' && points.length > 1);
  return showPoints
    ? <ul className="hud-points">{points.map((point, index) => <li key={`${point}:${index}`}>{point}</li>)}</ul>
    : <p className={`hud-answer ${streamingAnswer ? 'streaming' : ''}`}>{text}{streamingAnswer && <i aria-label="Answer is streaming" />}</p>;
}

export function AssistantOverlay({
  active,
  online,
  mode,
  question,
  questionIsLive,
  suggestion,
  streamingAnswer,
  loading,
  status,
  captureActionLabel,
  captureActionHint,
  captureActionKind,
  captureBusy,
  preferences,
  onPreferencesChange,
  onResetAppearance,
  onToggleListening,
  onAsk,
  onShorter,
  onExpand,
  onFollowUp,
  onHide,
  onClose,
  onDragStart,
}: {
  active: boolean;
  online: boolean;
  mode: InterviewMode;
  question: string;
  questionIsLive: boolean;
  suggestion: Suggestion | null;
  streamingAnswer: string;
  loading: boolean;
  status: string;
  captureActionLabel: string;
  captureActionHint: string;
  captureActionKind: 'start' | 'stop' | 'permission' | 'restart' | 'retry';
  captureBusy: boolean;
  preferences: AssistantPreferences;
  onPreferencesChange: (patch: Partial<AssistantPreferences>) => void;
  onResetAppearance: () => void;
  onToggleListening: () => void;
  onAsk: () => void;
  onShorter: () => void;
  onExpand: () => void;
  onFollowUp: () => void;
  onHide: () => void;
  onClose: () => void;
  onDragStart: (event: React.MouseEvent<HTMLElement>) => void;
}) {
  const [appearanceOpen, setAppearanceOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const modeLabel = mode.replaceAll('-', ' ');
  const currentAnswer = answerText(suggestion, streamingAnswer, preferences.responseStyle, preferences.assistantSize);
  const hasError = /could not|denied|failed|unavailable|offline|permission|required|restart/i.test(status);
  const PrimaryIcon = captureBusy ? RotateCw : captureActionKind === 'stop' ? CircleStop : captureActionKind === 'permission' ? ShieldAlert : captureActionKind === 'restart' || captureActionKind === 'retry' ? RotateCw : Play;

  async function copyAnswer() {
    if (!currentAnswer) return;
    await navigator.clipboard.writeText(currentAnswer);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_200);
  }

  return <section
    className={`assistant-hud appearance-${preferences.appearanceMode} assistant-size-${preferences.assistantSize}`}
    style={{ '--assistant-surface-alpha': String(preferences.windowOpacity / 100) } as React.CSSProperties}
    aria-label="Torvi assistant"
  >
    <div className="assistant-surface" aria-hidden="true" />
    <header className="hud-header window-drag-region" onMouseDown={onDragStart}>
      <div className="hud-identity"><span className="hud-mark" aria-hidden="true"><i /><i /><i /></span><span><b>Torvi</b><small>{modeLabel} copilot</small></span></div>
      <span className={`hud-session-state ${active ? 'active' : ''}`}><i aria-hidden="true" />{active ? 'Listening' : captureBusy ? 'Starting' : 'Ready'}</span>
      <span className={`hud-network ${online ? '' : 'offline'}`} title={status}>{online ? 'Live' : 'Offline'}</span>
      <div className="hud-window-actions" data-no-drag>
        <button onClick={onHide} title="Hide assistant (⌘⇧H)" aria-label="Hide assistant"><Minus aria-hidden="true" /></button>
        <button onClick={onClose} title="Close overlay and return to workspace" aria-label="Close overlay"><X aria-hidden="true" /></button>
      </div>
    </header>

    <div className="hud-body">
      <div className={`hud-status ${hasError ? 'attention' : active ? 'active' : ''}`} role={hasError ? 'alert' : 'status'} aria-live="polite"><AudioWaveform aria-hidden="true" /><span><b>{active ? 'Live audio is connected' : captureActionHint}</b><small>{status}</small></span></div>
      <div className="hud-question">
        <span>{questionIsLive ? 'Detected question' : 'Ask anything'}</span>
        <p>{question || 'Ask anything about your screen or conversation…'}</p>
      </div>

      <article className="hud-suggestion" aria-live="polite" aria-busy={loading}>
        <div className="hud-answer-heading">
          <span>Suggested answer</span>
          {suggestion && <small>{suggestion.grounding.level.replaceAll('_', ' ')} context</small>}
        </div>
        <Answer suggestion={suggestion} streamingAnswer={streamingAnswer} loading={loading} active={active} style={preferences.responseStyle} size={preferences.assistantSize} />
      </article>

      <div className="hud-answer-actions" data-no-drag>
        <button disabled={!currentAnswer} onClick={() => void copyAnswer()} title="Copy answer"><Copy aria-hidden="true" />{copied ? 'Copied' : 'Copy'}</button>
        <button disabled={!suggestion && !streamingAnswer} onClick={onShorter} title="Make answer shorter"><Shrink aria-hidden="true" />Shorter</button>
        <button disabled={!suggestion && !streamingAnswer} onClick={onExpand} title="Expand answer"><Expand aria-hidden="true" />Expand</button>
        <button disabled={!suggestion} onClick={onFollowUp} title="Prepare a likely follow-up"><MessageCircleQuestion aria-hidden="true" />Follow-up</button>
        <button className="hud-ask" disabled={loading} onClick={onAsk}><Sparkles aria-hidden="true" />{loading ? 'Thinking…' : 'Ask'} <kbd>⌘↵</kbd></button>
      </div>
    </div>

    <footer className="hud-footer" data-no-drag>
      <button className={`hud-primary-action ${captureActionKind}`} disabled={captureBusy} onClick={onToggleListening} aria-describedby="hud-primary-hint"><PrimaryIcon className={captureBusy ? 'spin' : ''} aria-hidden="true" /><span>{captureActionLabel}</span></button>
      <span id="hud-primary-hint" className="sr-only">{captureActionHint}</span>
      <div className="hud-format" role="group" aria-label="Answer format">
        {responseStyles.map((item) => <button type="button" key={item.id} className={preferences.responseStyle === item.id ? 'active' : ''} aria-pressed={preferences.responseStyle === item.id} onClick={() => onPreferencesChange({ responseStyle: item.id })}>{item.label}</button>)}
      </div>
      <div className={`hud-appearance ${appearanceOpen ? 'open' : ''}`}>
        <button className="hud-appearance-trigger" aria-expanded={appearanceOpen} aria-controls="hud-appearance-panel" aria-label="Assistant appearance" title="Assistant appearance" onClick={() => setAppearanceOpen((value) => !value)}><SlidersHorizontal aria-hidden="true" /></button>
        <section id="hud-appearance-panel" className="hud-appearance-panel" aria-label="Appearance controls">
          <header><span>Appearance</span><button onClick={onResetAppearance}>Reset</button></header>
          <label className="hud-opacity-label">
            <span>Window opacity <b>{preferences.windowOpacity}%</b></span>
            <input
              aria-label="Window opacity"
              type="range"
              min={MIN_ASSISTANT_OPACITY}
              max="100"
              value={preferences.windowOpacity}
              onInput={(event) => onPreferencesChange({ windowOpacity: Number(event.currentTarget.value) })}
            />
            <small>⌘⇧[ / ⌘⇧] · content stays readable</small>
          </label>
          <div className="hud-option-group"><span>Theme</span><div>{appearanceModes.map((item) => <button type="button" key={item.id} aria-pressed={preferences.appearanceMode === item.id} className={preferences.appearanceMode === item.id ? 'active' : ''} onClick={() => onPreferencesChange({ appearanceMode: item.id })}>{item.label}</button>)}</div></div>
          <div className="hud-option-group"><span>Size</span><div>{assistantSizes.map((item) => <button type="button" key={item.id} aria-pressed={preferences.assistantSize === item.id} className={preferences.assistantSize === item.id ? 'active' : ''} onClick={() => onPreferencesChange({ assistantSize: item.id })}>{item.label}</button>)}</div></div>
        </section>
      </div><span className="hud-privacy" title="Torvi is hidden only when Private Overlay is enabled"><EyeOff aria-hidden="true" />Local overlay</span>
    </footer>
  </section>;
}
