'use client';
/* eslint-disable @next/next/no-html-link-for-pages */

import { useEffect, useState } from 'react';
import { Download, MessageSquareText, SlidersHorizontal, Trash2 } from 'lucide-react';
import { clientApi } from '@/lib/client-api';
import type { CommunicationProfile } from '@interview-copilot/contracts';

const defaultCommunication: CommunicationProfile = {
  preferredAnswerLength: 'concise', technicalDepth: 'balanced', tone: 'conversational', firstPersonStyle: 'direct',
  bulletPreference: 'progressive', explanationDepth: 'adaptive', vocabularyPreferences: [],
};

export function SettingsClient() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState('');
  const [communication, setCommunication] = useState<CommunicationProfile>(defaultCommunication);
  const [vocabulary, setVocabulary] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    clientApi<{ communicationProfile?: CommunicationProfile }>('/api/v1/memory/communication-profile', { signal: controller.signal })
      .then((payload) => {
        const profile = payload.communicationProfile ?? defaultCommunication;
        setCommunication(profile); setVocabulary(profile.vocabularyPreferences.join(', ')); setReady(true); setStatus('');
      }).catch((error) => { if (!controller.signal.aborted) setStatus(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);

  async function saveCommunication() {
    if (busy || !ready) return;
    setBusy(true); setStatus('');
    try {
      await clientApi('/api/v1/memory/communication-profile', {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...communication, vocabularyPreferences: vocabulary.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 30) }),
      });
      setStatus('Answer preferences saved.');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Could not save. Try again.'); }
    finally { setBusy(false); }
  }

  async function exportData() {
    if (busy) return;
    setBusy(true);
    try {
    setStatus('Preparing your export…');
    const payload = await clientApi<{ downloadUrl?: string }>('/api/v1/privacy/export', { method: 'POST' });
    if (!payload.downloadUrl) throw new Error('Your export did not return a download link. Try again.');
    setStatus('Your export is ready.');
    if (payload.downloadUrl) window.location.href = payload.downloadUrl;
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Export failed.'); }
    finally { setBusy(false); }
  }

  async function deleteAccount() {
    const confirmed = window.prompt('Type DELETE MY ACCOUNT to schedule permanent deletion.');
    if (confirmed !== 'DELETE MY ACCOUNT') return;
    if (busy) return;
    setBusy(true);
    try {
    const payload = await clientApi<{ executeAfter?: number }>('/api/v1/account/deletion', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirmation: confirmed }),
    });
    setStatus(payload.executeAfter ? `Deletion scheduled for ${new Date(payload.executeAfter).toLocaleDateString()}. You can cancel within seven days.` : 'Deletion could not be scheduled.');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Deletion failed.'); }
    finally { setBusy(false); }
  }

  return <div className="settings-page"><header><span className="section-kicker">Account settings</span><h1>Settings</h1><p>Set your answer preferences and manage your account.</p></header><section>
    <article className="communication-settings"><div><SlidersHorizontal size={20} /><span><b>Assistant response</b><small>Set the default shape and length of every answer. Both controls stay available during a live session.</small></span></div><fieldset className="settings-editable" disabled={!ready || busy}><div className="settings-segment-grid"><fieldset><legend>Response style</legend><div>{([{ key: 'progressive', label: 'Smart', copy: 'Chooses the clearest shape' }, { key: 'bullets', label: 'Points', copy: 'Short, conversational cues' }, { key: 'narrative', label: 'Paragraph', copy: 'A natural spoken response' }] as const).map((option) => <button type="button" key={option.key} className={communication.bulletPreference === option.key ? 'active' : ''} onClick={() => setCommunication({ ...communication, bulletPreference: option.key })}><b>{option.label}</b><small>{option.copy}</small></button>)}</div></fieldset><fieldset><legend>Response length</legend><div>{([{ key: 'concise', label: 'Short', copy: 'About 20–30 seconds' }, { key: 'standard', label: 'Medium', copy: 'Enough context to explain' }, { key: 'detailed', label: 'Detailed', copy: 'Trade-offs and examples' }] as const).map((option) => <button type="button" key={option.key} className={communication.preferredAnswerLength === option.key ? 'active' : ''} onClick={() => setCommunication({ ...communication, preferredAnswerLength: option.key })}><b>{option.label}</b><small>{option.copy}</small></button>)}</div></fieldset></div><details className="setup-disclosure"><summary>More answer preferences</summary><section><label>Tone<select value={communication.tone} onChange={(event) => setCommunication({ ...communication, tone: event.target.value as CommunicationProfile['tone'] })}><option value="conversational">Natural</option><option value="formal">Professional</option><option value="executive">Executive</option><option value="warm">Friendly</option></select></label><label>Technical depth<select value={communication.technicalDepth} onChange={(event) => setCommunication({ ...communication, technicalDepth: event.target.value as CommunicationProfile['technicalDepth'] })}><option value="brief">Brief</option><option value="balanced">Balanced</option><option value="deep">Technical</option></select></label><label>Voice<select value={communication.firstPersonStyle} onChange={(event) => setCommunication({ ...communication, firstPersonStyle: event.target.value as CommunicationProfile['firstPersonStyle'] })}><option value="direct">Direct</option><option value="reflective">Reflective</option><option value="team_forward">Team-forward</option></select></label><label>Verbosity<select value={communication.explanationDepth} onChange={(event) => setCommunication({ ...communication, explanationDepth: event.target.value as CommunicationProfile['explanationDepth'] })}><option value="adaptive">Adaptive</option><option value="short">Tighter</option><option value="detailed">More explanatory</option></select></label><label className="wide-setting">Natural vocabulary<input value={vocabulary} onChange={(event) => setVocabulary(event.target.value)} placeholder="Words or phrases you naturally use, separated by commas" /></label></section></details><button onClick={saveCommunication}>{busy ? 'Saving…' : 'Save preferences'}</button></fieldset>{loading && <p role="status">Loading preferences…</p>}{!loading && !ready && <button onClick={() => { setLoading(true); setAttempt((value) => value + 1); }}>Retry loading preferences</button>}</article>
    <article><div><MessageSquareText size={20} /><span><b>Live controls</b><small>Use ⌘ + Enter to ask from the live workspace. Style, length, auto-answer, transcript visibility, audio sources, and overlay size can be changed without ending the session.</small></span></div><a className="settings-link" href="/session/new">Open session setup</a></article>
    <article><div><Download size={20} /><span><b>Export account data</b><small>Download profile, professional memory with provenance, saved transcripts, reports, interview rounds, consent receipts, devices, and usage.</small></span></div><button disabled={busy} onClick={exportData}>Create export</button></article>
    <article className="danger-zone"><div><Trash2 size={20} /><span><b>Delete account</b><small>Schedules permanent deletion after a seven-day recovery window, including private R2 documents and professional memory.</small></span></div><button disabled={busy} onClick={deleteAccount}>Schedule deletion</button></article>
  </section>{status && <div className="app-notice" role="status">{status}</div>}</div>;
}
