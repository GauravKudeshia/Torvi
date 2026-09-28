// Development-only visual fixtures. Never imported by the application entrypoint.
import React from 'react';
import { createRoot } from 'react-dom/client';
import type { InterviewMode, TranscriptSegment } from '@interview-copilot/contracts';
import { MeetingHome } from './meeting-home';
import { SessionHistory } from './session-history';
import { previewHistoryApi, previewHistorySessions } from './preview-history';
import { LiveTranscript } from './live-transcript';
import { AssistantOverlay, type AssistantPanelState } from './assistant-overlay';
import { DEFAULT_ASSISTANT_PREFERENCES } from './window-state';
import './styles.css';
import './control-center.css';
import './assistant-overlay.css';
import './experience.css';
import './floating-assistant.css';
import './meeting-workspace.css';
import './preview.css';

if (!import.meta.env.DEV) throw new Error('Visual fixtures are available only in development.');
const noop = () => undefined;
const now = Date.now();
const meetings = [
  { id: 'demo-review', title: 'Product review · September launch', mode: 'meeting', status: 'saved', liveSeconds: 1624, startedAt: now - 3600000 },
  { id: 'demo-discovery', title: 'Discovery with Northwind', mode: 'sales', status: 'saved', liveSeconds: 2038, startedAt: now - 86400000 },
  { id: 'demo-long', title: 'Architecture and accessibility review for the next cross-platform release', mode: 'technical', status: 'saved', liveSeconds: 810, startedAt: now - 172800000 },
];
const transcript: TranscriptSegment[] = Array.from({ length: 12 }, (_, i) => ({ id: String(i), speaker: i % 2 ? 'candidate' : 'interviewer', text: i % 2 ? 'Let’s confirm the owner and timing before we add that to the launch plan.' : 'What would you recommend as the next step for this release?', startedAtMs: i * 12000, endedAtMs: i * 12000 + 6000, final: true }));
function Preview() {
  const [screen, setScreen] = React.useState('Home');
  const [empty, setEmpty] = React.useState(false);
  const [active, setActive] = React.useState(false);
  const [panel, setPanel] = React.useState<AssistantPanelState>('collapsed');
  const [mode, setMode] = React.useState<InterviewMode>('meeting');
  const [preferences, setPreferences] = React.useState(DEFAULT_ASSISTANT_PREFERENCES);
  const [prompt, setPrompt] = React.useState('');
  const [state, setState] = React.useState('idle');
  const [notice, setNotice] = React.useState('No API calls or microphone access in this preview.');
  return <><header className="preview-controls"><b>Torvi · visual fixtures</b><label>Surface <select value={screen} onChange={e => setScreen(e.target.value)}>{['Home', 'Assistant', 'Transcript', 'History'].map(s => <option key={s}>{s}</option>)}</select></label><label><input type="checkbox" checked={empty} onChange={e => setEmpty(e.target.checked)} />Empty</label><label><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />Recording</label><label>AI state <select value={state} onChange={e => setState(e.target.value)}>{['idle', 'loading', 'response', 'error'].map(s => <option key={s}>{s}</option>)}</select></label><span role="status">{notice}</span></header>
    {screen === 'History' ? <div style={{ padding: 24 }}><SessionHistory sessions={empty ? [] : previewHistorySessions} reports={[]} api={previewHistoryApi} onSelectSession={noop} onStart={() => setScreen('Assistant')} /></div> : screen === 'Home' ? <MeetingHome sessions={empty ? [] : meetings} upcoming={empty ? [] : [{ id: 'upcoming', name: 'Launch planning', processTitle: 'Platform team', processId: 'demo', scheduledAt: now + 3600000, objective: 'Agree the release scope and owners.', interviewers: ['Team context from a scheduled round'] }]} sourceCount={empty ? 0 : 3} recording={active} activeTitle={active ? 'Launch planning' : undefined} mode={mode} onMode={setMode} onStart={() => { setScreen('Assistant'); setPanel('expanded'); }} onOpenLive={() => setScreen('Assistant')} onOpenSession={id => setNotice(`Selected ${id}. Native history loads the authenticated record.`)} onHistory={() => setNotice('Full history uses the existing authenticated service.')} onContext={() => setNotice('Context remains in the existing workspace.')} onReadiness={() => setNotice('Permission checks require the native app.')} onPrepare={() => setNotice('Preparation uses the scheduled round in the native workspace.')} /> : screen === 'Transcript' ? <LiveTranscript title="Launch planning" segments={empty ? [] : transcript} active={active} seconds={134} onAssistant={() => setScreen('Assistant')} onPause={() => setActive(!active)} onFinish={() => setNotice('Preview only. Saving requires a real session.')} busy={false} /> : <div className={`preview-overlay ${panel}`}><AssistantOverlay panelState={panel} focusRequest={0} shortcut="CommandOrControl+Enter" active={active} online mode={mode} onModeChange={setMode} question={state === 'response' ? 'What should we do next?' : ''} questionIsLive={false} prompt={prompt} suggestion={null} streamingAnswer={state === 'response' ? 'Confirm the launch scope with the team.\nAssign an owner to each remaining decision.\nAgree when to review progress.' : ''} loading={state === 'loading'} generationError={state === 'error' ? 'The connection was interrupted. Retry your request.' : ''} onCancel={() => setState('idle')} status={active ? 'Listening' : 'Ready'} captureActionLabel={active ? 'Pause' : 'Listen'} captureActionHint="Sample recording state; no microphone is connected." captureActionKind={active ? 'stop' : 'start'} captureBusy={false} preferences={preferences} onPanelChange={setPanel} onPromptChange={setPrompt} onSubmit={() => setState('response')} onQuickAction={() => setState('response')} onAssist={() => setState('response')} onClear={() => { setPrompt(''); setState('idle'); }} onPreferencesChange={patch => setPreferences(prev => ({ ...prev, ...patch }))} onResetAppearance={() => setPreferences(DEFAULT_ASSISTANT_PREFERENCES)} onToggleListening={() => setActive(!active)} onShorter={noop} onExpand={noop} onFollowUp={noop} auxiliaryControls={<button onClick={() => setScreen('Transcript')}>Open live transcript</button>} onHide={() => setNotice('Native hide/restore requires the installed app.')} onClose={() => setScreen('Home')} onDragStart={noop} hasSession seconds={134} onEnd={() => setNotice('Preview only. Saving requires a real session.')} /></div>}
  </>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
