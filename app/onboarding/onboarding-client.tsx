'use client';

import { useEffect, useState } from 'react';
import { Check, FileText, LoaderCircle, MessageSquareText, UploadCloud } from 'lucide-react';
import type { CommunicationProfile } from '@interview-copilot/contracts';

type CandidateFact = { claim: string; evidence: string };
const defaultCommunication: CommunicationProfile = { preferredAnswerLength: 'concise', technicalDepth: 'balanced', tone: 'conversational', firstPersonStyle: 'direct', bulletPreference: 'progressive', explanationDepth: 'adaptive', vocabularyPreferences: [] };

export function OnboardingClient() {
  const [displayName, setDisplayName] = useState('');
  const [headline, setHeadline] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [documentId, setDocumentId] = useState('');
  const [facts, setFacts] = useState<CandidateFact[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [communication, setCommunication] = useState<CommunicationProfile>(defaultCommunication);

  useEffect(() => {
    fetch('/api/v1/profile').then(async (response) => await response.json() as { displayName?: string; headline?: string }).then((profile) => {
      setDisplayName(profile.displayName ?? '');
      setHeadline(profile.headline ?? '');
    }).catch(() => undefined);
    fetch('/api/v1/memory/communication-profile').then(async (response) => response.ok ? await response.json() as { communicationProfile?: CommunicationProfile } : {})
      .then((payload) => payload.communicationProfile && setCommunication(payload.communicationProfile)).catch(() => undefined);
  }, []);

  async function saveProfile() {
    setBusy(true);
    const response = await fetch('/api/v1/profile', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName, headline }),
    });
    setStatus(response.ok ? 'Profile saved.' : 'Profile could not be saved.');
    setBusy(false);
  }

  async function upload() {
    if (!file) return;
    setBusy(true);
    setStatus('Creating a secure upload…');
    const ticketResponse = await fetch('/api/v1/documents/upload-url', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fileName: file.name, contentType: file.type || 'text/plain', sizeBytes: file.size, kind: 'resume' }),
    });
    const ticket = await ticketResponse.json() as { uploadUrl?: string; error?: { message?: string } };
    if (!ticketResponse.ok) { setStatus(ticket.error?.message ?? 'Upload could not start.'); setBusy(false); return; }
    setStatus('Parsing without storing audio or screen data…');
    if (!ticket.uploadUrl) { setStatus('The upload URL is missing.'); setBusy(false); return; }
    const uploadResponse = await fetch(ticket.uploadUrl, { method: 'PUT', body: file });
    const result = await uploadResponse.json() as { documentId?: string; candidateFacts?: CandidateFact[]; error?: { message?: string } };
    if (!uploadResponse.ok) { setStatus(result.error?.message ?? 'Document could not be parsed.'); setBusy(false); return; }
    setDocumentId(result.documentId ?? '');
    setFacts(result.candidateFacts ?? []);
    setStatus('Choose the facts you verify as accurate.');
    setBusy(false);
  }

  async function verify() {
    setBusy(true);
    const response = await fetch(`/api/v1/documents/${documentId}/verify`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ facts: selected }),
    });
    setStatus(response.ok ? 'Verified facts are now available to your coach. Open Professional Memory to review provenance, edit, reject, or mark claims private.' : 'Facts could not be verified.');
    setBusy(false);
  }

  async function saveAssistant() {
    setBusy(true);
    const response = await fetch('/api/v1/memory/communication-profile', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(communication) });
    setStatus(response.ok ? 'Assistant style saved. You can change it again during any live session.' : 'Assistant style could not be saved.');
    setBusy(false);
  }

  return (
    <div className="onboarding-page">
      <header><span className="section-kicker">Grounding profile</span><h1>Give the coach facts, not fiction.</h1><p>You remain in control. Parsed claims do not become usable facts until you approve them.</p></header>
      <section className="onboarding-grid">
        <article className="onboarding-card"><span className="step-pill">1 · Profile</span><label>Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your name" /></label><label>Professional headline<input value={headline} onChange={(event) => setHeadline(event.target.value)} placeholder="Product leader · B2B SaaS" /></label><button onClick={saveProfile} disabled={busy}>Save profile</button></article>
        <article className="onboarding-card"><span className="step-pill">2 · Context</span><label className="upload-drop"><UploadCloud size={26} /><b>{file?.name ?? 'Choose PDF, DOCX, or TXT'}</b><small>Optional. Maximum 8 MB and stored privately in your document vault.</small><input type="file" accept=".pdf,.docx,.txt" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label><button onClick={upload} disabled={!file || busy}>{busy ? <LoaderCircle className="spin" size={15} /> : <FileText size={15} />} Parse document</button></article>
        <article className="onboarding-card onboarding-assistant"><span className="step-pill">3 · Assistant</span><div className="onboarding-card-title"><MessageSquareText size={21} /><div><b>How should answers feel?</b><small>These are defaults, not a lock. Switch them while a session is active.</small></div></div><div className="onboarding-preferences"><span>Response style</span><div>{([{ key: 'progressive', label: 'Smart' }, { key: 'bullets', label: 'Points' }, { key: 'narrative', label: 'Paragraph' }] as const).map((option) => <button type="button" key={option.key} className={communication.bulletPreference === option.key ? 'selected' : ''} onClick={() => setCommunication({ ...communication, bulletPreference: option.key })}>{option.label}</button>)}</div><span>Response length</span><div>{([{ key: 'concise', label: 'Short' }, { key: 'standard', label: 'Medium' }, { key: 'detailed', label: 'Detailed' }] as const).map((option) => <button type="button" key={option.key} className={communication.preferredAnswerLength === option.key ? 'selected' : ''} onClick={() => setCommunication({ ...communication, preferredAnswerLength: option.key })}>{option.label}</button>)}</div></div><button onClick={saveAssistant} disabled={busy}>Save assistant style</button></article>
      </section>
      {facts.length > 0 && <section className="fact-review"><div><span className="step-pill">4 · Verify</span><h2>Which claims are accurate?</h2><p>Select only facts you are comfortable saying aloud.</p></div><div className="fact-choices">{facts.map((fact) => <label key={fact.claim}><input type="checkbox" checked={selected.includes(fact.claim)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, fact.claim] : current.filter((item) => item !== fact.claim))} /><span><b>{fact.claim}</b><small>Evidence: {fact.evidence}</small></span></label>)}</div><button onClick={verify} disabled={busy || selected.length === 0}><Check size={15} /> Verify selected facts</button></section>}
      {status && <div className="app-notice">{status}</div>}
    </div>
  );
}
