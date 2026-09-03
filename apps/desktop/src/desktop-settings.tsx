import React from 'react';
import { availableMonitors } from '@tauri-apps/api/window';
import {
  AudioLines,
  Bot,
  Check,
  CircleUserRound,
  Command,
  Eye,
  Info,
  Languages,
  Monitor,
  RotateCcw,
  Settings2,
  ShieldCheck,
} from 'lucide-react';
import { supportedLocales } from '@interview-copilot/contracts';
import { duplicateShortcutActions, formatShortcut, shortcutFromKeyboardEvent, type ShortcutConflict } from './shortcuts';
import {
  DEFAULT_SHORTCUT_PREFERENCES,
  MIN_ASSISTANT_OPACITY,
  type AppearanceMode,
  type AssistantPreferences,
  type AssistantSize,
  type DesktopPreferences,
  type ShortcutAction,
  type ShortcutPreferences,
} from './window-state';
import './desktop-settings.css';

export type CommunicationProfile = {
  preferredAnswerLength: 'tiny' | 'concise' | 'standard' | 'detailed';
  technicalDepth: 'brief' | 'balanced' | 'deep';
  tone: 'conversational' | 'formal' | 'executive' | 'warm';
  firstPersonStyle: 'direct' | 'reflective' | 'team_forward';
  bulletPreference: 'progressive' | 'bullets' | 'narrative';
  explanationDepth: 'adaptive' | 'short' | 'detailed';
  vocabularyPreferences: string[];
};

export type Provider = { id: string; label: string; enabled: boolean; capabilities: string[]; configuration: string };
type SettingsSection = 'general' | 'assistant' | 'shortcuts' | 'audio' | 'display' | 'privacy' | 'language' | 'account' | 'about';
type AccountSummary = { deviceId: string; scope: 'account' | 'session'; tokenExpiresAt: number } | null;

const sectionItems: Array<{ id: SettingsSection; label: string; icon: typeof Settings2 }> = [
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'assistant', label: 'Assistant', icon: Bot },
  { id: 'shortcuts', label: 'Keyboard Shortcuts', icon: Command },
  { id: 'audio', label: 'Audio & Capture', icon: AudioLines },
  { id: 'display', label: 'Display', icon: Monitor },
  { id: 'privacy', label: 'Privacy', icon: ShieldCheck },
  { id: 'language', label: 'Language', icon: Languages },
  { id: 'account', label: 'Account', icon: CircleUserRound },
  { id: 'about', label: 'About', icon: Info },
];

const shortcutLabels: Record<ShortcutAction, { title: string; detail: string }> = {
  toggleAssistant: { title: 'Open assistant', detail: 'Reveal the floating bar and focus its composer.' },
  toggleListening: { title: 'Start or stop listening', detail: 'Toggle live audio for the current session.' },
  hideAssistant: { title: 'Hide assistant', detail: 'Hide Torvi without ending the session.' },
  toggleOverlay: { title: 'Toggle floating mode', detail: 'Move between the workspace and floating assistant.' },
  clearThread: { title: 'Clear current thread', detail: 'Clear the visible question and answer without deleting the saved session.' },
  captureContext: { title: 'Capture screen context', detail: 'Read the screen once on the next request when enabled.' },
};

function titleCase(value: string) { return value.replaceAll('_', ' ').replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-label={label} aria-checked={checked} className={`settings-toggle ${checked ? 'active' : ''}`} onClick={() => onChange(!checked)}><i /></button>;
}

function SettingRow({ title, detail, children }: { title: string; detail: string; children: React.ReactNode }) {
  return <div className="desktop-setting-row"><div><b>{title}</b><small>{detail}</small></div><div>{children}</div></div>;
}

function SectionHeader({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return <header className="desktop-settings-header"><span>{eyebrow}</span><h2>{title}</h2><p>{copy}</p></header>;
}

function ShortcutRecorder({ action, shortcut, shortcuts, conflicts, onChange }: {
  action: ShortcutAction;
  shortcut: string;
  shortcuts: ShortcutPreferences;
  conflicts: ShortcutConflict[];
  onChange: (action: ShortcutAction, shortcut: string) => void;
}) {
  const [recording, setRecording] = React.useState(false);
  const [error, setError] = React.useState('');
  const nativeConflict = conflicts.find((item) => item.action === action);

  function capture(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (!recording) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') { setRecording(false); setError(''); return; }
    const next = shortcutFromKeyboardEvent(event);
    if (!next) { setError('Use at least one modifier and a non-modifier key.'); return; }
    const duplicate = (Object.entries(shortcuts) as Array<[ShortcutAction, string]>).find(([candidate, value]) => candidate !== action && value === next);
    if (duplicate) { setError(`Already assigned to ${shortcutLabels[duplicate[0]].title}.`); return; }
    onChange(action, next);
    setRecording(false);
    setError('');
  }

  return <div className="shortcut-recorder">
    <button type="button" className={recording ? 'recording' : ''} aria-label={`Change shortcut for ${shortcutLabels[action].title}`} onClick={() => { setRecording(true); setError(''); }} onKeyDown={capture}>{recording ? 'Press shortcut…' : <kbd>{formatShortcut(shortcut)}</kbd>}</button>
    {(error || nativeConflict) && <small role="alert">{error || nativeConflict?.message}</small>}
  </div>;
}

export function DesktopSettings({
  account,
  appVersion,
  assistantPreferences,
  desktopPreferences,
  shortcuts,
  shortcutConflicts,
  profile,
  vocabulary,
  providers,
  savingProfile,
  onAssistantPreferencesChange,
  onResetAssistantAppearance,
  onDesktopPreferencesChange,
  onShortcutChange,
  onResetShortcuts,
  onResetWindowPosition,
  onProfileChange,
  onVocabularyChange,
  onSaveProfile,
  onOpenAudioCheck,
  onSignOut,
}: {
  account: AccountSummary;
  appVersion: string;
  assistantPreferences: AssistantPreferences;
  desktopPreferences: DesktopPreferences;
  shortcuts: ShortcutPreferences;
  shortcutConflicts: ShortcutConflict[];
  profile: CommunicationProfile;
  vocabulary: string;
  providers: Provider[];
  savingProfile: boolean;
  onAssistantPreferencesChange: (patch: Partial<AssistantPreferences>) => void;
  onResetAssistantAppearance: () => void;
  onDesktopPreferencesChange: (patch: Partial<DesktopPreferences>) => void;
  onShortcutChange: (action: ShortcutAction, shortcut: string) => void;
  onResetShortcuts: () => void;
  onResetWindowPosition: () => void;
  onProfileChange: (profile: CommunicationProfile) => void;
  onVocabularyChange: (value: string) => void;
  onSaveProfile: () => void;
  onOpenAudioCheck: () => void;
  onSignOut: () => void;
}) {
  const [section, setSection] = React.useState<SettingsSection>('general');
  const [monitors, setMonitors] = React.useState<Array<{ name: string | null; scaleFactor: number }>>([]);
  const duplicates = duplicateShortcutActions(shortcuts);

  React.useEffect(() => {
    if (section !== 'display') return;
    let active = true;
    void availableMonitors().then((items) => {
      if (active) setMonitors(items.map((item) => ({ name: item.name, scaleFactor: item.scaleFactor })));
    }).catch(() => { if (active) setMonitors([]); });
    return () => { active = false; };
  }, [section]);

  return <div className="desktop-settings-layout">
    <nav aria-label="Settings sections">{sectionItems.map((item) => { const Icon = item.icon; return <button type="button" key={item.id} className={section === item.id ? 'active' : ''} aria-current={section === item.id ? 'page' : undefined} onClick={() => setSection(item.id)}><Icon aria-hidden="true" /><span>{item.label}</span></button>; })}</nav>
    <section className="desktop-settings-panel">
      {section === 'general' && <article>
        <SectionHeader eyebrow="Desktop behavior" title="General" copy="Choose how Torvi restores your workspace. Unsupported operating-system features remain clearly unavailable." />
        <SettingRow title="Remember window position" detail="Restore the workspace and floating assistant where you last placed them."><Toggle label="Remember window position" checked={desktopPreferences.rememberWindowPosition} onChange={(rememberWindowPosition) => onDesktopPreferencesChange({ rememberWindowPosition })} /></SettingRow>
        <SettingRow title="Launch at startup" detail="Requires the production autostart integration; it is not enabled in this local build."><span className="settings-unavailable">Not available</span></SettingRow>
        <SettingRow title="Menu bar mode" detail="Minimize-to-menu-bar support is planned but not exposed as a fake toggle."><span className="settings-unavailable">Not available</span></SettingRow>
      </article>}

      {section === 'assistant' && <article>
        <SectionHeader eyebrow="Answer and appearance" title="Assistant" copy="Tune the floating surface and how Torvi structures speakable answers." />
        <section className={`settings-assistant-preview appearance-${assistantPreferences.appearanceMode} assistant-size-${assistantPreferences.assistantSize}`} style={{ '--assistant-preview-alpha': String(assistantPreferences.windowOpacity / 100) } as React.CSSProperties} aria-label="Live assistant appearance preview">
          <div aria-hidden="true" /><header><i /><span><b>Torvi</b><small>Ready · {assistantPreferences.windowOpacity}%</small></span><em>Preview</em></header><p>Clarify the goal, identify the constraint, and propose the next measurable step.</p><footer><span>{assistantPreferences.responseStyle === 'bullets' ? 'Points' : titleCase(assistantPreferences.responseStyle)}</span><b>{titleCase(assistantPreferences.assistantSize)}</b></footer>
        </section>
        <SettingRow title="Theme" detail="Use a fixed material, follow the system, or add restrained glass blur."><div className="settings-segmented">{(['dark', 'light', 'adaptive', 'glass'] as AppearanceMode[]).map((item) => <button type="button" key={item} className={assistantPreferences.appearanceMode === item ? 'active' : ''} aria-pressed={assistantPreferences.appearanceMode === item} onClick={() => onAssistantPreferencesChange({ appearanceMode: item })}>{titleCase(item)}</button>)}</div></SettingRow>
        <SettingRow title="Window opacity" detail={`Content remains readable and never drops below ${MIN_ASSISTANT_OPACITY}%.`}><label className="settings-range"><input type="range" min={MIN_ASSISTANT_OPACITY} max="100" value={assistantPreferences.windowOpacity} onInput={(event) => onAssistantPreferencesChange({ windowOpacity: Number(event.currentTarget.value) })} aria-label="Assistant window opacity" /><output>{assistantPreferences.windowOpacity}%</output></label></SettingRow>
        <SettingRow title="Expanded panel size" detail="Set the amount of room available for long answers."><div className="settings-segmented">{(['compact', 'standard', 'expanded'] as AssistantSize[]).map((item) => <button type="button" key={item} className={assistantPreferences.assistantSize === item ? 'active' : ''} aria-pressed={assistantPreferences.assistantSize === item} onClick={() => onAssistantPreferencesChange({ assistantSize: item })}>{titleCase(item)}</button>)}</div></SettingRow>
        <SettingRow title="Quick answer format" detail="Points, natural paragraphs, or automatic formatting based on the question."><div className="settings-segmented">{(['bullets', 'paragraph', 'adaptive'] as const).map((item) => <button type="button" key={item} className={assistantPreferences.responseStyle === item ? 'active' : ''} aria-pressed={assistantPreferences.responseStyle === item} onClick={() => onAssistantPreferencesChange({ responseStyle: item })}>{item === 'bullets' ? 'Points' : titleCase(item)}</button>)}</div></SettingRow>
        <div className="settings-subsection"><div><span>Voice profile</span><h3>Make answers sound natural</h3></div><div className="settings-field-grid"><label><span>Length</span><select value={profile.preferredAnswerLength} onChange={(event) => onProfileChange({ ...profile, preferredAnswerLength: event.target.value as CommunicationProfile['preferredAnswerLength'] })}><option value="tiny">Very short</option><option value="concise">Concise</option><option value="standard">Standard</option><option value="detailed">Detailed</option></select></label><label><span>Tone</span><select value={profile.tone} onChange={(event) => onProfileChange({ ...profile, tone: event.target.value as CommunicationProfile['tone'] })}><option value="conversational">Conversational</option><option value="formal">Formal</option><option value="executive">Executive</option><option value="warm">Warm</option></select></label><label><span>Technical depth</span><select value={profile.technicalDepth} onChange={(event) => onProfileChange({ ...profile, technicalDepth: event.target.value as CommunicationProfile['technicalDepth'] })}><option value="brief">Brief</option><option value="balanced">Balanced</option><option value="deep">Deep</option></select></label><label><span>Presentation</span><select value={profile.bulletPreference} onChange={(event) => onProfileChange({ ...profile, bulletPreference: event.target.value as CommunicationProfile['bulletPreference'] })}><option value="progressive">Adaptive depth</option><option value="bullets">Points</option><option value="narrative">Paragraphs</option></select></label><label className="wide"><span>Natural vocabulary</span><input value={vocabulary} onChange={(event) => onVocabularyChange(event.target.value)} placeholder="Phrases you naturally use, separated by commas" /></label></div><button className="settings-primary" disabled={savingProfile} onClick={onSaveProfile}>{savingProfile ? 'Saving…' : 'Save assistant style'}</button></div>
        <div className="settings-provider-summary"><span>Active AI provider</span>{providers.filter((provider) => provider.enabled).map((provider) => <b key={provider.id}><Check aria-hidden="true" />{provider.label}</b>)}{!providers.some((provider) => provider.enabled) && <small>No hosted provider is currently configured.</small>}</div>
        <button className="settings-reset" onClick={onResetAssistantAppearance}><RotateCcw aria-hidden="true" />Reset assistant appearance</button>
      </article>}

      {section === 'shortcuts' && <article>
        <SectionHeader eyebrow="Keyboard-first control" title="Keyboard Shortcuts" copy="Click a shortcut, press a new key combination, and Torvi will re-register it globally." />
        {(shortcutConflicts.length > 0 || duplicates.size > 0) && <div className="settings-warning" role="alert"><Command aria-hidden="true" /><span><b>One or more shortcuts need attention</b><small>Choose a unique combination that is not reserved by another application.</small></span></div>}
        <div className="settings-shortcut-list">{(Object.keys(shortcutLabels) as ShortcutAction[]).map((action) => <div key={action}><span><b>{shortcutLabels[action].title}</b><small>{shortcutLabels[action].detail}</small></span><ShortcutRecorder action={action} shortcut={shortcuts[action]} shortcuts={shortcuts} conflicts={shortcutConflicts} onChange={onShortcutChange} /></div>)}</div>
        <button className="settings-reset" onClick={onResetShortcuts}><RotateCcw aria-hidden="true" />Reset to defaults</button>
      </article>}

      {section === 'audio' && <article>
        <SectionHeader eyebrow="Explicit capture controls" title="Audio & Capture" copy="Torvi captures only after you start a session and keeps the active state visible." />
        <div className="capture-setting-cards"><div><AudioLines aria-hidden="true" /><span><b>System audio</b><small>Captures the conversation audio routed through your computer. macOS permission is required.</small></span><em>Checked before each session</em></div><div><Eye aria-hidden="true" /><span><b>Screen context</b><small>Reads one screenshot only when Screen Context is enabled and you submit a request.</small></span><em>Off by default</em></div><div><ShieldCheck aria-hidden="true" /><span><b>Microphone</b><small>Optional candidate-side transcription. You can continue with system audio if access is denied.</small></span><em>Consent required</em></div></div>
        <button className="settings-primary" onClick={onOpenAudioCheck}>Open audio & system check</button>
      </article>}

      {section === 'display' && <article>
        <SectionHeader eyebrow="Floating window" title="Display" copy="Keep the assistant recoverable when displays move, disconnect, or change resolution." />
        <SettingRow title="Preferred monitor" detail="Current follows the display containing Torvi; Primary always recenters on the main display."><select value={desktopPreferences.preferredMonitor} onChange={(event) => onDesktopPreferencesChange({ preferredMonitor: event.target.value as DesktopPreferences['preferredMonitor'] })}><option value="current">Current display</option><option value="primary">Primary display</option></select></SettingRow>
        <SettingRow title="Remember floating position" detail="Saved bounds are clamped into the nearest visible work area after display changes."><Toggle label="Remember floating position" checked={desktopPreferences.rememberWindowPosition} onChange={(rememberWindowPosition) => onDesktopPreferencesChange({ rememberWindowPosition })} /></SettingRow>
        <SettingRow title="Reset window position" detail="Move Torvi to a safe centered position on your selected display."><button className="settings-secondary" onClick={onResetWindowPosition}>Reset position</button></SettingRow>
        <div className="monitor-list"><span>Detected displays</span>{monitors.length ? monitors.map((monitor, index) => <div key={`${monitor.name}:${index}`}><Monitor aria-hidden="true" /><b>{monitor.name || `Display ${index + 1}`}</b><small>{monitor.scaleFactor}× scale{index === 0 ? ' · Primary or first available' : ''}</small></div>) : <small>No display details were returned. Torvi will use the primary display.</small>}</div>
      </article>}

      {section === 'privacy' && <article>
        <SectionHeader eyebrow="Consent-first design" title="Privacy" copy="Capture is visible, controllable, and separate from screen-share appearance." />
        <div className="privacy-settings-card"><ShieldCheck aria-hidden="true" /><div><b>Ephemeral by default</b><p>Raw audio and transient screenshots are not stored. Live transcript text is saved only when you explicitly choose Save at the end of a session.</p></div></div>
        <SettingRow title="Visible capture status" detail="Listening, screen context, errors, and permission states remain visible in the assistant."><span className="privacy-status"><i />Always shown</span></SettingRow>
        <SettingRow title="Private Overlay" detail="Best-effort exclusion from supported screen-capture paths. It does not bypass platform security or external policies."><span className="settings-unavailable">Controlled in live mode</span></SettingRow>
      </article>}

      {section === 'language' && <article>
        <SectionHeader eyebrow="Input and output" title="Language" copy="Meeting transcription and assistant output can use different language preferences." />
        <SettingRow title="Meeting / input language" detail="Used as the default when preparing a new session."><select value={desktopPreferences.inputLanguage} onChange={(event) => onDesktopPreferencesChange({ inputLanguage: event.target.value as DesktopPreferences['inputLanguage'] })}>{supportedLocales.map((item) => <option key={item} value={item}>{new Intl.DisplayNames([item], { type: 'language' }).of(item)}</option>)}</select></SettingRow>
        <SettingRow title="Assistant / output language" detail="Follow the meeting language or use a fixed response language."><select value={desktopPreferences.outputLanguage} onChange={(event) => onDesktopPreferencesChange({ outputLanguage: event.target.value as DesktopPreferences['outputLanguage'] })}><option value="same">Same as meeting</option>{supportedLocales.map((item) => <option key={item} value={item}>{new Intl.DisplayNames([item], { type: 'language' }).of(item)}</option>)}</select></SettingRow>
      </article>}

      {section === 'account' && <article>
        <SectionHeader eyebrow="This Mac" title="Account" copy="Desktop authorization is stored in the operating-system credential store, not browser storage." />
        <SettingRow title="Authorization" detail={account ? `Device ${account.deviceId.slice(0, 8)}… · ${account.scope} access` : 'This Mac is not connected to a Torvi account.'}><span className={account ? 'account-state connected' : 'account-state'}><i />{account ? 'Connected' : 'Signed out'}</span></SettingRow>
        {account && <SettingRow title="Session expires" detail="Torvi will ask you to reconnect when this credential expires."><time>{new Date(account.tokenExpiresAt).toLocaleString()}</time></SettingRow>}
        {account && <button className="settings-danger" onClick={onSignOut}>Sign out on this Mac</button>}
      </article>}

      {section === 'about' && <article>
        <SectionHeader eyebrow="Torvi desktop" title="About" copy="A consent-first, keyboard-driven assistant for live conversations and focused work." />
        <div className="about-mark"><span><i /><i /><i /></span><div><b>Torvi</b><small>Version {appVersion}</small></div></div>
        <SettingRow title="Desktop architecture" detail="Tauri 2 · React 19 · native macOS and Windows capture bridges"><span className="settings-unavailable">Production build</span></SettingRow>
        <SettingRow title="Security boundary" detail="Context isolation through scoped Tauri commands, permissions, and OS credential storage."><ShieldCheck className="about-check" aria-label="Enabled" /></SettingRow>
        <p className="about-copy">Torvi is inspired by the best keyboard-first desktop utilities while using an original interface, brand, and consent model.</p>
      </article>}
    </section>
  </div>;
}

export { DEFAULT_SHORTCUT_PREFERENCES };
