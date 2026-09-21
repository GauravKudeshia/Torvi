'use client';

import { clientApi } from '@/lib/client-api';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BrainCircuit, BriefcaseBusiness, Check, ChevronLeft, ChevronRight, Code2, FileCheck2, FileText,
  FileUp, Languages, LoaderCircle, MessageSquareText, Network, Plus, Presentation, ShieldCheck,
  Sparkles, UploadCloud, UsersRound, GraduationCap, WandSparkles,
} from 'lucide-react';
import { interviewModes, modeRequiresVerifiedResume, type CommunicationProfile, type InterviewMode, type ResponseMode, type ResponseStyle } from '@interview-copilot/contracts';

const modes = [
  { key: 'general', label: 'General', copy: 'Answers for any live conversation or visible task.', icon: Sparkles },
  { key: 'meeting', label: 'Meeting', copy: 'Notes, decisions, actions, and follow-through.', icon: UsersRound },
  { key: 'sales', label: 'Sales', copy: 'Discovery, objections, value, and next steps.', icon: BriefcaseBusiness },
  { key: 'presentation', label: 'Presentation', copy: 'Stay on message and answer the room clearly.', icon: Presentation },
  { key: 'study', label: 'Study', copy: 'Explanations, examples, and learning checks.', icon: GraduationCap },
  { key: 'custom', label: 'Custom', copy: 'Shape the assistant around your own objective.', icon: WandSparkles },
  { key: 'negotiation', label: 'Negotiation', copy: 'Interests, boundaries, options, and commitments.', icon: Network },
  { key: 'behavioral', label: 'Behavioral', copy: 'Evidence-backed stories and follow-ups.', icon: MessageSquareText },
  { key: 'technical', label: 'Technical', copy: 'Concepts, tradeoffs, and role depth.', icon: BrainCircuit },
  { key: 'coding', label: 'Coding', copy: 'Approach, complexity, code, and tests.', icon: Code2 },
  { key: 'system-design', label: 'System design', copy: 'Architecture, scale, and decisions.', icon: Network },
  { key: 'case', label: 'Case', copy: 'Structure, assumptions, and clear math.', icon: Presentation },
  { key: 'mock', label: 'Mock interview', copy: 'Practice the complete interview loop.', icon: BriefcaseBusiness },
] as const;

type JobTarget = { id: string; role: string; company: string | null; jobDescription: string | null; competencies?: string[] };
type CandidateFact = { claim: string; evidence: string };
type StoredDocument = {
  id: string;
  kind: 'resume' | 'job-description' | 'other';
  fileName: string;
  sizeBytes: number;
  parseStatus: string;
  candidateFacts: Array<string | CandidateFact>;
};
type UploadResult = { documentId?: string; parseStatus?: string; candidateFacts?: CandidateFact[]; summary?: string; error?: { message?: string } };
type CoverageItem = { competency: string; count: number; strength: 'strong' | 'partial' | 'missing' };
type PreflightCheck = { id: string; label: string; status: 'ready' | 'warning' | 'failed'; detail: string };

const stepLabels = ['Conversation', 'Profile', 'Sources', 'Ready'];

function factClaim(fact: string | CandidateFact) {
  return typeof fact === 'string' ? fact : fact.claim;
}

function acceptedType(file: File) {
  if (file.type === 'application/pdf' || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.type === 'text/plain') return file.type;
  if (/\.(txt|md)$/i.test(file.name)) return 'text/plain';
  return '';
}

export function NewSessionForm({ initialMode, initialSourceId }: { initialMode?: string; initialSourceId?: string }) {
  const startLock = useRef(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<InterviewMode>(interviewModes.includes(initialMode as InterviewMode) ? initialMode as InterviewMode : 'general');
  const [locale, setLocale] = useState('en');
  const [retentionChoice, setRetention] = useState('ask-at-end');
  const [responseStyle, setResponseStyle] = useState<ResponseStyle>('adaptive');
  const [responseMode, setResponseMode] = useState<ResponseMode>('concise');
  const [savedTargetId, setSavedTargetId] = useState('');
  const [role, setRole] = useState('');
  const [company, setCompany] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [interviewer, setInterviewer] = useState('');
  const [interviewRound, setInterviewRound] = useState('');
  const [objective, setObjective] = useState('');
  const [priorRoundNotes, setPriorRoundNotes] = useState('');
  const [targets, setTargets] = useState<JobTarget[]>([]);
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [resumeId, setResumeId] = useState('');
  const [supportingIds, setSupportingIds] = useState<string[]>([]);
  const [pendingResumeFacts, setPendingResumeFacts] = useState<CandidateFact[]>([]);
  const [selectedFacts, setSelectedFacts] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadingKind, setUploadingKind] = useState<StoredDocument['kind'] | ''>('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [coverage, setCoverage] = useState<CoverageItem[]>([]);
  const [preflightChecks, setPreflightChecks] = useState<PreflightCheck[]>([]);
  const [checkingPreflight, setCheckingPreflight] = useState(false);

  async function refreshCoverage() {
    const response = await fetch('/api/v1/memory/coverage', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}),
    });
    if (!response.ok) return;
    const payload = await response.json() as { coverage?: CoverageItem[] };
    setCoverage(payload.coverage ?? []);
  }

  async function runPreflight() {
    setCheckingPreflight(true);
    const startedAt = performance.now();
    try {
      const response = await fetch('/api/v1/preflight');
      const payload = await response.json() as { checks?: PreflightCheck[]; error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? 'The readiness check could not run.');
      let microphoneState = 'prompt';
      try {
        microphoneState = (await navigator.permissions.query({ name: 'microphone' as PermissionName })).state;
      } catch {
        microphoneState = 'unknown';
      }
      const browserChecks: PreflightCheck[] = [
        { id: 'network', label: 'Network', status: navigator.onLine ? 'ready' : 'failed', detail: navigator.onLine ? `Backend responded in ${Math.round(performance.now() - startedAt)} ms.` : 'This device is offline.' },
        { id: 'microphone', label: 'Microphone permission', status: microphoneState === 'granted' ? 'ready' : microphoneState === 'denied' ? 'failed' : 'warning', detail: microphoneState === 'granted' ? 'Browser microphone permission is granted. Signal is tested when you select the microphone.' : microphoneState === 'denied' ? 'Allow microphone access in browser site settings.' : 'Permission and signal have not been tested yet.' },
        { id: 'system_audio', label: 'Laptop audio', status: 'warning', detail: 'Not tested yet. Browsers require you to choose a tab, window, or screen and enable Share audio after the session opens.' },
      ];
      setPreflightChecks([...(payload.checks ?? []), ...browserChecks]);
    } catch (preflightError) {
      setPreflightChecks([{ id: 'backend', label: 'Backend and network', status: 'failed', detail: preflightError instanceof Error ? preflightError.message : 'The readiness check failed.' }]);
    } finally {
      setCheckingPreflight(false);
    }
  }

  async function refreshDocuments(preferredResumeId?: string) {
    const response = await fetch('/api/v1/documents');
    if (!response.ok) return;
    const payload = await response.json() as { documents?: StoredDocument[] };
    const next = payload.documents ?? [];
    setDocuments(next);
    const verifiedResume = next.find((document) => document.kind === 'resume' && document.parseStatus === 'verified');
    if (preferredResumeId) setResumeId(preferredResumeId);
    else if (!resumeId && verifiedResume) setResumeId(verifiedResume.id);
  }

  useEffect(() => {
    let alive = true;
    Promise.all([
      clientApi<{ jobTargets?: JobTarget[] }>('/api/v1/job-targets'),
      clientApi<{ documents?: StoredDocument[] }>('/api/v1/documents'),
      clientApi<{ coverage?: CoverageItem[] }>('/api/v1/memory/coverage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) }),
      clientApi<{ communicationProfile?: CommunicationProfile }>('/api/v1/memory/communication-profile'),
    ]).then(([targetPayload, documentPayload, coveragePayload, profilePayload]) => {
      if (!alive) return;
      setTargets(targetPayload.jobTargets ?? []);
      const nextDocuments = documentPayload.documents ?? [];
      setDocuments(nextDocuments);
      const verifiedResume = nextDocuments.find((document) => document.kind === 'resume' && document.parseStatus === 'verified');
      if (verifiedResume && !initialSourceId && modeRequiresVerifiedResume(initialMode ?? 'general')) setResumeId((current) => current || verifiedResume.id);
      setCoverage(coveragePayload.coverage ?? []);
      if (profilePayload.communicationProfile) {
        setResponseMode(profilePayload.communicationProfile.preferredAnswerLength);
        setResponseStyle(profilePayload.communicationProfile.bulletPreference === 'bullets' ? 'bullets' : profilePayload.communicationProfile.bulletPreference === 'narrative' ? 'paragraph' : 'adaptive');
      }
    }).catch(() => { if (alive) setError('Your saved context could not be loaded. Refresh and try again.'); }).finally(() => { if (alive) setInitialLoading(false); });
    return () => { alive = false; };
  }, [initialMode, initialSourceId]);

  useEffect(() => {
    if (!initialSourceId) return;
    fetch(`/api/v1/sessions/${initialSourceId}/history`).then(async (response) => {
      if (!response.ok) throw new Error('The saved setup could not be duplicated.');
      return await response.json() as { session: { mode: InterviewMode; locale: string; retentionChoice: string }; target: JobTarget | null; documents: StoredDocument[] };
    }).then((payload) => {
      setMode(payload.session.mode);
      setLocale(payload.session.locale);
      setRetention(payload.session.retentionChoice);
      if (payload.target) {
        setSavedTargetId(payload.target.id);
        setRole(payload.target.role);
        setCompany(payload.target.company ?? '');
        setJobDescription(payload.target.jobDescription ?? '');
      }
      const clonedResume = payload.documents.find((document) => document.kind === 'resume');
      setResumeId(clonedResume?.id ?? '');
      setSupportingIds(payload.documents.filter((document) => document.kind !== 'resume').map((document) => document.id));
      setNotice('Saved setup duplicated. Review the context and preferences before starting.');
    }).catch((cloneError) => setError(cloneError instanceof Error ? cloneError.message : 'The saved setup could not be duplicated.'));
  }, [initialSourceId]);

  const selectedResume = documents.find((document) => document.id === resumeId);
  const readySupporting = documents.filter((document) => document.kind !== 'resume' && ['ready', 'verified'].includes(document.parseStatus));
  const selectedSupporting = readySupporting.filter((document) => supportingIds.includes(document.id));
  const sourceCount = (selectedResume ? 1 : 0) + selectedSupporting.length + (jobDescription.trim() ? 1 : 0);
  const requiresVerifiedResume = modeRequiresVerifiedResume(mode);
  const canContinue = useMemo(() => {
    if (step === 0) return !requiresVerifiedResume || Boolean(role.trim().length >= 2 && company.trim());
    if (step === 1) return !requiresVerifiedResume || selectedResume?.parseStatus === 'verified';
    return true;
  }, [company, requiresVerifiedResume, role, selectedResume?.parseStatus, step]);

  function chooseTarget(id: string) {
    setSavedTargetId(id);
    const target = targets.find((item) => item.id === id);
    if (!target) return;
    setRole(target.role);
    setCompany(target.company ?? '');
    setJobDescription(target.jobDescription ?? '');
    const notes = target.competencies ?? [];
    setInterviewer(notes.find((note) => note.startsWith('Interviewer:'))?.slice('Interviewer:'.length).trim() ?? '');
    setInterviewRound(notes.find((note) => note.startsWith('Interview round:'))?.slice('Interview round:'.length).trim() ?? '');
    setObjective(notes.find((note) => note.startsWith('Session objective:'))?.slice('Session objective:'.length).trim() ?? '');
    setPriorRoundNotes(notes.filter((note) => note.startsWith('Prior round:')).map((note) => note.slice('Prior round:'.length).trim()).join('\n'));
  }

  async function uploadDocument(file: File, kind: StoredDocument['kind']) {
    const contentType = acceptedType(file);
    if (!contentType) throw new Error('Use a PDF, DOCX, TXT, or Markdown file.');
    if (file.size > 8 * 1024 * 1024) throw new Error('Each document must be 8 MB or smaller.');
    const ticketResponse = await fetch('/api/v1/documents/upload-url', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fileName: file.name, contentType, sizeBytes: file.size, kind }),
    });
    const ticket = await ticketResponse.json() as { uploadUrl?: string; error?: { message?: string } };
    if (!ticketResponse.ok || !ticket.uploadUrl) throw new Error(ticket.error?.message ?? 'The secure upload could not start.');
    const uploadResponse = await fetch(ticket.uploadUrl, { method: 'PUT', body: file });
    const result = await uploadResponse.json() as UploadResult;
    if (!uploadResponse.ok || !result.documentId) throw new Error(result.error?.message ?? 'The document could not be processed.');
    return result;
  }

  async function handleResume(file?: File) {
    if (!file) return;
    setUploadingKind('resume');
    setError('');
    setNotice('Reading your resume and extracting claims for your review…');
    try {
      const result = await uploadDocument(file, 'resume');
      setResumeId(result.documentId ?? '');
      setPendingResumeFacts(result.candidateFacts ?? []);
      setSelectedFacts((result.candidateFacts ?? []).map((fact) => fact.claim));
      await refreshDocuments(result.documentId);
      setNotice('Review the extracted claims below. The coach cannot use them until you approve them.');
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'The resume could not be uploaded.');
      setNotice('');
    } finally {
      setUploadingKind('');
    }
  }

  async function verifyResume() {
    if (!resumeId || selectedFacts.length === 0) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/v1/documents/${resumeId}/verify`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ facts: selectedFacts }), signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error('The resume facts could not be verified. Please try again.');
      setPendingResumeFacts([]);
      await refreshDocuments(resumeId);
      await refreshCoverage();
      setNotice('Resume verified. Only approved facts can support personal claims.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Verification failed. Please try again.');
    } finally { setBusy(false); }
  }

  async function handleSupporting(files: FileList | null, kind: 'job-description' | 'other') {
    if (!files?.length) return;
    setUploadingKind(kind);
    setError('');
    setNotice(`Processing ${files.length} reference ${files.length === 1 ? 'document' : 'documents'}…`);
    try {
      const uploadedIds: string[] = [];
      for (const file of Array.from(files).slice(0, 10)) {
        const result = await uploadDocument(file, kind);
        if (result.documentId) uploadedIds.push(result.documentId);
      }
      setSupportingIds((current) => [...new Set([...current, ...uploadedIds])].slice(0, 11));
      await refreshDocuments();
      setNotice(`${uploadedIds.length} source ${uploadedIds.length === 1 ? 'is' : 'are'} ready for question-by-question retrieval.`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'The supporting documents could not be uploaded.');
      setNotice('');
    } finally {
      setUploadingKind('');
    }
  }

  function toggleSupporting(id: string) {
    setSupportingIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id].slice(0, 11));
  }

  function next() {
    if (!canContinue) {
      setError(step === 0 ? 'Add a conversation title and organization before continuing.' : 'Choose a verified resume before continuing with an interview mode.');
      return;
    }
    setError('');
    setStep((current) => current === 0 && !requiresVerifiedResume ? 3 : Math.min(3, current + 1));
  }

  async function start() {
    if (startLock.current) return;
    if (!consent) return setError('Confirm permission and AI assistance before starting.');
    if (requiresVerifiedResume && (!selectedResume || selectedResume.parseStatus !== 'verified')) return setError('Choose a verified resume before starting an interview mode.');
    startLock.current = true;
    setBusy(true);
    setError('');
    try {
      const currentProfilePayload = await clientApi<{ communicationProfile?: CommunicationProfile }>('/api/v1/memory/communication-profile');
      const currentProfile = currentProfilePayload.communicationProfile;
      if (currentProfile) {
        await clientApi('/api/v1/memory/communication-profile', {
          method: 'PATCH', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            ...currentProfile,
            preferredAnswerLength: responseMode,
            bulletPreference: responseStyle === 'bullets' ? 'bullets' : responseStyle === 'paragraph' ? 'narrative' : 'progressive',
          }),
        });
      }
      const targetResponse = await fetch('/api/v1/job-targets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          role: role.trim() || `${modes.find((item) => item.key === mode)?.label ?? 'General'} conversation`,
          company: company.trim() || null,
          jobDescription: jobDescription || null,
          competencies: [
            interviewer.trim() ? `Interviewer: ${interviewer.trim()}` : '',
            interviewRound.trim() ? `Interview round: ${interviewRound.trim()}` : '',
            objective.trim() ? `Session objective: ${objective.trim()}` : '',
            ...priorRoundNotes.split('\n').map((note) => note.trim()).filter(Boolean).slice(0, 20).map((note) => `Prior round: ${note}`),
          ].filter(Boolean).map((note) => note.slice(0, 180)),
        }),
      });
      const targetPayload = await targetResponse.json() as { id?: string; error?: { message?: string } };
      if (!targetResponse.ok || !targetPayload.id) throw new Error(targetPayload.error?.message ?? 'The conversation profile could not be saved.');
      const response = await fetch('/api/v1/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-client-platform': 'web', 'x-client-version': '0.2.0' },
        body: JSON.stringify({
          mode,
          locale,
          retentionChoice,
          jobTargetId: targetPayload.id,
          documentIds: [...(selectedResume ? [selectedResume.id] : []), ...supportingIds],
          deviceId: localStorage.getItem('ic-device') ?? (() => { const id = crypto.randomUUID(); localStorage.setItem('ic-device', id); return id; })(),
          consent: { recordingAllowed: true, aiAssistanceAllowed: true, policyVersion: '2026-08-22' },
        }),
      });
      const payload = await response.json() as { id?: string; error?: { message?: string } };
      if (!response.ok || !payload.id) throw new Error(payload.error?.message ?? 'The live session could not be started.');
      window.location.assign(`/session/${payload.id}`);
    } catch (startError) {
      startLock.current = false;
      setBusy(false);
      setError(startError instanceof Error ? startError.message : 'The live session could not be started.');
    }
  }

  return (
    <div className="setup-page copilot-preflight">
      <header className="preflight-header">
        <div><span className="section-kicker">Torvi preflight</span><h1>Start a session.</h1><p>Choose a mode. Add context only if you need it.</p></div>
        <div className="preflight-trust"><ShieldCheck size={18} /><span><b>Permission-led</b><small>Audio, screen context, and retention stay under your control.</small></span></div>
      </header>

      <ol className="preflight-steps" aria-label="Torvi setup progress">
        {(requiresVerifiedResume ? [0, 1, 2, 3] : [0, 3]).map((index, position) => <li key={index} aria-current={step === index ? 'step' : undefined} className={step === index ? 'active' : step > index ? 'complete' : ''}><span>{step > index ? <Check size={13} /> : position + 1}</span><b>{stepLabels[index]}</b></li>)}
      </ol>

      <fieldset className="preflight-card" disabled={initialLoading || busy || Boolean(uploadingKind)}>
        {initialLoading && <p role="status">Loading saved preferences…</p>}
        {step === 0 && <div className="preflight-section">
          <label className="field-label">What would you like help with?<select value={mode} onChange={(event) => setMode(event.target.value as InterviewMode)}>{modes.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
          <details className="setup-disclosure" open={requiresVerifiedResume}><summary>{requiresVerifiedResume ? 'Interview details' : 'Conversation details (optional)'}</summary>{targets.length > 0 && <label className="field-label">Use a saved conversation profile<select value={savedTargetId} onChange={(event) => chooseTarget(event.target.value)}><option value="">Create a new conversation profile</option>{targets.map((target) => <option key={target.id} value={target.id}>{target.role}{target.company ? ` at ${target.company}` : ''}</option>)}</select></label>}
          <div className="role-fields"><label className="field-label">{requiresVerifiedResume ? 'Job position' : 'Conversation title (optional)'} <input value={role} onChange={(event) => setRole(event.target.value)} maxLength={160} placeholder={requiresVerifiedResume ? 'Senior Product Manager' : 'Optional — e.g. weekly product review'} /></label><label className="field-label">{requiresVerifiedResume ? 'Company name' : 'Organization or team (optional)'} <input value={company} onChange={(event) => setCompany(event.target.value)} maxLength={160} placeholder="Acme" /></label></div>
          <details className="setup-disclosure"><summary>Agenda and background (optional)</summary><label className="field-label">Context, agenda, or role notes <textarea value={jobDescription} onChange={(event) => setJobDescription(event.target.value)} placeholder="Add the goal, relevant background, constraints, and topics likely to come up." /></label>
          </details>{requiresVerifiedResume && <details className="setup-disclosure"><summary>Interview round and previous conversations</summary><div className="preflight-subtitle"><b>Round memory</b><span>Optional, but valuable for multi-round consistency.</span></div>
          <div className="role-fields"><label className="field-label">Interviewer <input value={interviewer} maxLength={160} onChange={(event) => setInterviewer(event.target.value)} placeholder="Name and role, if known" /></label><label className="field-label">Interview round <input value={interviewRound} maxLength={160} onChange={(event) => setInterviewRound(event.target.value)} placeholder="Recruiter screen, panel, final…" /></label></div>
          <label className="field-label">Your objective <input value={objective} maxLength={160} onChange={(event) => setObjective(event.target.value)} placeholder="Show systems thinking and clarify team scope" /></label>
          <label className="field-label">What should stay consistent from previous rounds? <textarea className="round-memory-input" value={priorRoundNotes} onChange={(event) => setPriorRoundNotes(event.target.value)} placeholder={'One fact per line, for example:\nMigration reduced infrastructure cost by 22%\nI owned discovery and rollout, not the original architecture'} /></label>
          </details>}</details><details className="setup-disclosure"><summary>Answer preferences</summary><div className="preflight-subtitle"><b>Copilot behavior</b><span>Choose the response style you need. You can switch it live.</span></div>

          <div className="response-preference-grid"><div><span>Response style</span><div role="group" aria-label="Response style">{([{ key: 'adaptive', label: 'Smart' }, { key: 'bullets', label: 'Points' }, { key: 'paragraph', label: 'Paragraph' }] as const).map((option) => <button type="button" key={option.key} className={responseStyle === option.key ? 'active' : ''} onClick={() => setResponseStyle(option.key)}>{option.label}</button>)}</div></div><div><span>Response length</span><div role="group" aria-label="Response length">{([{ key: 'concise', label: 'Short' }, { key: 'standard', label: 'Medium' }, { key: 'detailed', label: 'Detailed' }] as const).map((option) => <button type="button" key={option.key} className={responseMode === option.key ? 'active' : ''} onClick={() => setResponseMode(option.key)}>{option.label}</button>)}</div></div></div>
          </details><button type="button" className="context-link" onClick={() => setStep(1)}>Add or review sources ({sourceCount})</button>
        </div>}

        {step === 1 && <div className="preflight-section">
          <div className="preflight-title"><span>02</span><div><h2>{requiresVerifiedResume ? 'Choose the verified resume for this interview.' : 'Add optional personal context.'}</h2><p>{requiresVerifiedResume ? 'The AI can only describe your experience using facts you explicitly verify.' : 'A resume is optional. If attached, only facts you approve may be used autobiographically.'}</p></div></div>
          {documents.some((document) => document.kind === 'resume') && <div className="document-picker">{documents.filter((document) => document.kind === 'resume').map((document) => <button type="button" key={document.id} className={resumeId === document.id ? 'selected' : ''} onClick={() => { setResumeId(document.id); setPendingResumeFacts(document.parseStatus === 'needs-verification' ? document.candidateFacts.filter((fact): fact is CandidateFact => typeof fact !== 'string') : []); setSelectedFacts(document.candidateFacts.map(factClaim)); }}><FileText size={19} /><span><b>{document.fileName}</b><small>{document.parseStatus === 'verified' ? 'Verified and ready' : 'Needs fact review'}</small></span>{document.parseStatus === 'verified' ? <FileCheck2 size={17} /> : <ChevronRight size={17} />}</button>)}</div>}
          <label className="upload-zone"><UploadCloud size={27} /><b>{uploadingKind === 'resume' ? 'Reading your resume…' : 'Upload a new resume'}</b><span>PDF, DOCX, or TXT · up to 8 MB</span><input type="file" accept=".pdf,.docx,.txt" disabled={Boolean(uploadingKind)} onChange={(event) => handleResume(event.target.files?.[0])} /></label>
          {pendingResumeFacts.length > 0 && <div className="inline-fact-review"><div><b>Verify the claims the coach may use</b><span>{selectedFacts.length} of {pendingResumeFacts.length} selected</span></div>{pendingResumeFacts.map((fact) => <label key={fact.claim}><input type="checkbox" checked={selectedFacts.includes(fact.claim)} onChange={(event) => setSelectedFacts((current) => event.target.checked ? [...current, fact.claim] : current.filter((item) => item !== fact.claim))} /><span><b>{fact.claim}</b><small>Evidence: {fact.evidence}</small></span></label>)}<button type="button" onClick={verifyResume} disabled={busy || selectedFacts.length === 0}>{busy ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />} Approve selected facts</button></div>}
        </div>}

        {step === 2 && <div className="preflight-section">
          <div className="preflight-title"><span>03</span><div><h2>Add a private knowledge pack.</h2><p>Attach agendas, product documentation, research, sales material, role notes, or anything this conversation may need. Relevant excerpts are retrieved for each question.</p></div></div>
          <div className="knowledge-upload-grid"><label className="upload-zone small"><FileUp size={23} /><b>{uploadingKind === 'job-description' ? 'Processing…' : 'Attach job description'}</b><span>PDF, DOCX, TXT, or Markdown</span><input type="file" accept=".pdf,.docx,.txt,.md" disabled={Boolean(uploadingKind)} onChange={(event) => handleSupporting(event.target.files, 'job-description')} /></label><label className="upload-zone small"><Plus size={23} /><b>{uploadingKind === 'other' ? 'Building knowledge pack…' : 'Add supporting documents'}</b><span>Select multiple files · up to 11 sources</span><input type="file" multiple accept=".pdf,.docx,.txt,.md" disabled={Boolean(uploadingKind)} onChange={(event) => handleSupporting(event.target.files, 'other')} /></label></div>
          {readySupporting.length > 0 ? <div className="source-library"><div><b>Available sources</b><span>Select what belongs to this interview.</span></div>{readySupporting.map((document) => <label key={document.id} className={supportingIds.includes(document.id) ? 'selected' : ''}><input type="checkbox" checked={supportingIds.includes(document.id)} onChange={() => toggleSupporting(document.id)} /><FileText size={17} /><span><b>{document.fileName}</b><small>{document.kind === 'job-description' ? 'Job description' : 'Supporting reference'} · {document.sizeBytes < 1024 ? '<1 KB' : `${Math.ceil(document.sizeBytes / 1024)} KB`}</small></span><Check size={14} /></label>)}</div> : <div className="knowledge-empty"><Sparkles size={21} /><div><b>No supporting files yet</b><p>This step is optional. Your verified resume and role details will still ground the copilot.</p></div></div>}
        </div>}

        {step === 3 && <div className="preflight-section review-section">
          <div className="preflight-title"><span>04</span><div><h2>Review the live context.</h2><p>The session will retrieve only from the sources shown here. Raw audio and screen captures are never stored.</p></div></div>
          <div className="context-review"><article><span>Conversation</span><h3>{role || `${modes.find((item) => item.key === mode)?.label} conversation`}{company ? ` at ${company}` : ''}</h3><p>{modes.find((item) => item.key === mode)?.label}{interviewRound ? ` · ${interviewRound}` : ''} · {locale.toUpperCase()}</p></article><article><span>Answer behavior</span><h3>{responseStyle === 'bullets' ? 'Points' : responseStyle === 'paragraph' ? 'Paragraph' : 'Smart'} · {responseMode === 'concise' ? 'Short' : responseMode === 'standard' ? 'Medium' : responseMode === 'detailed' ? 'Detailed' : 'Glance'}</h3><p>Change either preference at any time during the live session.</p></article><article><span>Personal context</span><h3>{selectedResume?.fileName ?? 'Not attached'}</h3><p>{selectedResume ? 'Personal claims restricted to approved facts' : 'No autobiographical source attached'}</p></article><article><span>Knowledge coverage</span><h3>{sourceCount} context {sourceCount === 1 ? 'source' : 'sources'}</h3><p>{selectedSupporting.length ? selectedSupporting.map((document) => document.fileName).join(', ') : 'Conversation context only'}</p></article></div>
          {requiresVerifiedResume && coverage.length > 0 && <div className="coverage-map"><div><b>Interview evidence coverage</b><a href="/memory">Improve coverage</a></div><section>{coverage.map((item) => <article key={item.competency} className={item.strength}><span>{item.competency}</span><b>{item.strength === 'missing' ? 'No verified experience found' : `${item.count} verified ${item.count === 1 ? 'claim' : 'claims'}`}</b><small>{item.strength === 'missing' ? 'Add a real experience, use the closest example, or prepare a truthful general answer.' : item.strength === 'strong' ? 'Strong coverage' : 'Partial coverage'}</small></article>)}</section></div>}
          <div className="preflight-system-check"><div><b>System readiness</b><button type="button" onClick={runPreflight} disabled={checkingPreflight}>{checkingPreflight ? <LoaderCircle className="spin" size={13} /> : <ShieldCheck size={13} />}{preflightChecks.length ? 'Run again' : 'Run readiness check'}</button></div>{preflightChecks.length ? <section>{preflightChecks.map((check) => <article key={check.id} className={check.status}><i /><span><b>{check.label}</b><small>{check.detail}</small></span><strong>{check.status}</strong></article>)}</section> : <p>Authentication, storage, network, and configuration are tested now. Audio permission and signal are clearly marked untested until the browser source chooser runs.</p>}</div>
          <div className="setup-options review-options"><label><span><Languages size={18} /> Coaching language</span><select value={locale} onChange={(event) => setLocale(event.target.value)}><option value="en">English</option><option value="es">Español</option><option value="fr">Français</option><option value="de">Deutsch</option><option value="hi">हिन्दी</option></select></label><label><span>Transcript retention</span><select value={retentionChoice} onChange={(event) => setRetention(event.target.value)}><option value="ask-at-end">Ask me at the end</option><option value="save">Save this session</option><option value="discard">Always discard</option></select></label></div>
          <label className="consent-box"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span><b>I have permission to use recording and AI assistance.</b><small>I will follow interviewer, employer, and assessment rules. Audio is processed live and never stored.</small></span></label>
        </div>}
      </fieldset>

      {notice && <div className="app-notice preflight-notice">{notice}</div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer className="setup-footer preflight-footer"><a href="/dashboard">Cancel</a><div>{step > 0 && <button type="button" className="secondary-action" onClick={() => { setError(''); setStep((current) => current === 3 && !requiresVerifiedResume ? 0 : current - 1); }}><ChevronLeft size={15} /> Back</button>}{step < 3 ? <button type="button" className="pill-button" onClick={next} disabled={!canContinue || initialLoading || busy || Boolean(uploadingKind)}>Continue <ChevronRight size={16} /></button> : <button type="button" className="pill-button launch-button" onClick={start} disabled={initialLoading || busy || !consent}>{busy ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />} {busy ? 'Preparing live room…' : 'Start Torvi'}</button>}</div></footer>
    </div>
  );
}
