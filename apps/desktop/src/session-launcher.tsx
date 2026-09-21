import React from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { invoke } from './native-bridge';
import { desktopApi } from './desktop-api';
import type { DesktopAccount, NativeSessionContext } from './control-center';

export function SessionLauncher({ account, onAuthenticated, onReady, onCancel }: {
  account: DesktopAccount | null; onAuthenticated: (value: DesktopAccount) => void;
  onReady: (value: NativeSessionContext) => void; onCancel: () => void;
}) {
  const [topic, setTopic] = React.useState('Conversation');
  const [workspace, setWorkspace] = React.useState('Personal workspace');
  const [mode, setMode] = React.useState('general');
  const [consent, setConsent] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const alive = React.useRef(true);
  const lock = React.useRef(false);
  React.useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function start() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      if (!account) {
        const auth = await invoke<{ deviceCode: string; verificationUrl: string; expiresAt: number; intervalSeconds: number }>('begin_desktop_authorization', { deviceName: 'Torvi on Mac', appVersion: '0.7.0' });
        await openUrl(auth.verificationUrl);
        while (alive.current && Date.now() < auth.expiresAt) {
          await new Promise(resolve => setTimeout(resolve, Math.max(2, auth.intervalSeconds) * 1000));
          if (!alive.current) return;
          const result = await invoke<{ status: string; account?: DesktopAccount }>('poll_desktop_authorization', { deviceCode: auth.deviceCode });
          if (result.account) { onAuthenticated(result.account); return; }
        }
        if (alive.current) throw new Error('Sign-in expired. Try again.');
        return;
      }
      if (!consent) throw new Error('Confirm permission to use AI and capture this conversation.');
      // This label is explicitly editable, not an inferred employer or personal fact.
      const target = await desktopApi<{ id: string }>('POST', '/api/v1/job-targets', {
        role: topic.trim(), company: workspace.trim(),
        jobDescription: 'General conversation context. Workspace labels are not evidence of employment or personal experience.',
        competencies: [],
      });
      const context = await invoke<NativeSessionContext>('desktop_start_session', { payload: {
        mode, locale: 'en', jobTargetId: target.id, documentIds: [], deviceId: account.deviceId,
        retentionChoice: 'ask-at-end', consent: { recordingAllowed: true, aiAssistanceAllowed: true, policyVersion: '2026-09-14' },
      } });
      if (alive.current) onReady(context);
    } catch (error) { if (alive.current) setError(error instanceof Error ? error.message : String(error)); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  return <section className="session-launcher" aria-label="Begin a conversation">
    <h2>{account ? 'A little context. Then you’re ready.' : 'Your assistant, one shortcut away.'}</h2>
    <p>{account ? 'Nothing is recorded until you press Listen. Save notes or discard the transcript when you finish.' : 'Sign in securely to connect this Mac. Your AI key stays on the server.'}</p>
    {account && <fieldset disabled={busy}>
      <label>Topic<input maxLength={180} value={topic} onChange={event => setTopic(event.target.value)} /></label>
      <label>Workspace<input maxLength={180} value={workspace} onChange={event => setWorkspace(event.target.value)} /></label>
      <label>Use Torvi for<select value={mode} onChange={event => setMode(event.target.value)}>
        <option value="general">General assistance</option><option value="meeting">Meeting</option><option value="study">Study</option>
        <option value="sales">Sales call</option><option value="presentation">Presentation</option><option value="custom">Custom conversation</option>
      </select></label>
      <label className="consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />I have permission to use AI assistance and capture this conversation.</label>
    </fieldset>}
    {error && <p role="alert">{error}</p>}
    <div><button disabled={busy || Boolean(account && (!consent || !topic.trim() || !workspace.trim()))} onClick={() => void start()}>{busy ? account ? 'Preparing…' : 'Finish sign-in in your browser…' : account ? 'Begin conversation' : 'Sign in to Torvi'}</button><button onClick={onCancel}>Cancel</button></div>
  </section>;
}
