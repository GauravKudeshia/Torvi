'use client';
/* eslint-disable @next/next/no-html-link-for-pages */

import { useEffect, useState } from 'react';
import { Download, MessageSquareText, SlidersHorizontal, Trash2 } from 'lucide-react';
import type { CommunicationProfile } from '@interview-copilot/contracts';

const defaultCommunication: CommunicationProfile = {
  preferredAnswerLength: 'concise', technicalDepth: 'balanced', tone: 'conversational', firstPersonStyle: 'direct',
  bulletPreference: 'progressive', explanationDepth: 'adaptive', vocabularyPreferences: [],
};

export function SettingsClient() {
  const [status, setStatus] = useState('');
  const [communication, setCommunication] = useState<CommunicationProfile>(defaultCommunication);
  const [vocabulary, setVocabulary] = useState('');

  useEffect(() => {
    fetch('/api/v1/memory/communication-profile').then(async (response) => response.ok ? await response.json() as { communicationProfile?: CommunicationProfile } : {})
      .then((payload) => {
        if (!payload.communicationProfile) return;
        setCommunication(payload.communicationProfile);
        setVocabulary(payload.communicationProfile.vocabularyPreferences.join(', '));
      }).catch(() => undefined);
  }, []);

  async function saveCommunication() {
    const response = await fetch('/api/v1/memory/communication-profile', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...communication, vocabularyPreferences: vocabulary.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 30) }),
    });
    setStatus(response.ok ? 'Communication preferences saved. Grounding rules still take priority over style.' : 'Communication preferences could not be saved.');
  }

  async function exportData() {
    setStatus('Preparing your export…');
    const response = await fetch('/api/v1/privacy/export', { method: 'POST' });
    const payload = await response.json() as { downloadUrl?: string; error?: { message?: string } };
    if (!response.ok) return setStatus(payload.error?.message ?? 'Export failed.');
    setStatus('Your export is ready.');
    if (payload.downloadUrl) window.location.href = payload.downloadUrl;
  }

  async function deleteAccount() {
    const confirmed = window.prompt('Type DELETE MY ACCOUNT to schedule permanent deletion.');
    if (confirmed !== 'DELETE MY ACCOUNT') return;
    const response = await fetch('/api/v1/account/deletion', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirmation: confirmed }),
    });
    const payload = await response.json() as { executeAfter?: number; error?: { message?: string } };
    setStatus(response.ok && payload.executeAfter ? `Deletion scheduled for ${new Date(payload.executeAfter).toLocaleDateString()}. You can cancel within seven days.` : payload.error?.message ?? 'Deletion could not be scheduled.');
  }

  return <div className="settings-page"><header><span className="section-kicker">Account settings</span><h1>Privacy stays within reach.</h1><p>Control how the copilot communicates, export your information, or schedule account deletion.</p></header><section>
    <article className="communication-settings"><div><SlidersHorizontal size={20} /><span><b>Assistant response</b><small>Set the default shape and length of every answer. Both controls stay available during a live session.</small></span></div><div className="settings-segment-grid"><fieldset><legend>Response style</legend><div>{([{ key: 'progressive', label: 'Smart', copy: 'Chooses the clearest shape' }, { key: 'bullets', label: 'Points', copy: 'Short, conversational cues' }, { key: 'narrative', label: 'Paragraph', copy: 'A natural spoken response' }] as const).map((option) => <button type="button" key={option.key} className={communication.bulletPreference === option.key ? 'active' : ''} onClick={() => setCommunication({ ...communication, bulletPreference: option.key })}><b>{option.label}</b><small>{option.copy}</small></button>)}</div></fieldset><fieldset><legend>Response length</legend><div>{([{ key: 'concise', label: 'Short', copy: 'About 20–30 seconds' }, { key: 'standard', label: 'Medium', copy: 'Enough context to explain' }, { key: 'detailed', label: 'Detailed', copy: 'Trade-offs and examples' }] as const).map((option) => <button type="button" key={option.key} className={communication.preferredAnswerLength === option.key ? 'active' : ''} onClick={() => setCommunication({ ...communication, preferredAnswerLength: option.key })}><b>{option.label}</b><small>{option.copy}</small></button>)}</div></fieldset></div><section><label>Tone<select value={communication.tone} onChange={(event) => setCommunication({ ...communication, tone: event.target.value as CommunicationProfile['tone'] })}><option value="conversational">Natural</option><option value="formal">Professional</option><option value="executive">Executive</option><option value="warm">Friendly</option></select></label><label>Technical depth<select value={communication.technicalDepth} onChange={(event) => setCommunication({ ...communication, technicalDepth: event.target.value as CommunicationProfile['technicalDepth'] })}><option value="brief">Brief</option><option value="balanced">Balanced</option><option value="deep">Technical</option></select></label><label>Voice<select value={communication.firstPersonStyle} onChange={(event) => setCommunication({ ...communication, firstPersonStyle: event.target.value as CommunicationProfile['firstPersonStyle'] })}><option value="direct">Direct</option><option value="reflective">Reflective</option><option value="team_forward">Team-forward</option></select></label><label>Verbosity<select value={communication.explanationDepth} onChange={(event) => setCommunication({ ...communication, explanationDepth: event.target.value as CommunicationProfile['explanationDepth'] })}><option value="adaptive">Adaptive</option><option value="short">Tighter</option><option value="detailed">More explanatory</option></select></label><label className="wide-setting">Natural vocabulary<input value={vocabulary} onChange={(event) => setVocabulary(event.target.value)} placeholder="Words or phrases you naturally use, separated by commas" /></label><button onClick={saveCommunication}>Save assistant</button></section></article>
    <article><div><MessageSquareText size={20} /><span><b>Live controls</b><small>Use ⌘ + Enter to ask from the live workspace. Style, length, auto-answer, transcript visibility, audio sources, and overlay size can be changed without ending the session.</small></span></div><a className="settings-link" href="/session/new">Open session setup</a></article>
    <article><div><Download size={20} /><span><b>Export account data</b><small>Download profile, professional memory with provenance, saved transcripts, reports, interview rounds, consent receipts, devices, and usage.</small></span></div><button onClick={exportData}>Create export</button></article>
    <article className="danger-zone"><div><Trash2 size={20} /><span><b>Delete account</b><small>Schedules permanent deletion after a seven-day recovery window, including private R2 documents and professional memory.</small></span></div><button onClick={deleteAccount}>Schedule deletion</button></article>
  </section>{status && <div className="app-notice">{status}</div>}</div>;
}
