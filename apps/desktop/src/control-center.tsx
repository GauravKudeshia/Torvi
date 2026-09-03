import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  BriefcaseBusiness,
  Brain,
  History,
  Home,
  LogOut,
  Mic2,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import {
  applicationStatuses,
  careerToolKinds,
  interviewModes,
  modeRequiresVerifiedResume,
  supportedLocales,
  type CareerToolKind,
  type InterviewMode,
} from '@interview-copilot/contracts';
import { MIN_ASSISTANT_OPACITY, type AppearanceMode, type AssistantPreferences, type AssistantSize } from './window-state';

export type DesktopAccount = {
  tokenExpiresAt: number;
  sessionId?: string | null;
  deviceId: string;
  scope: 'account' | 'session';
};

export type NativeSessionContext = {
  session: { id: string; mode: InterviewMode; locale: 'en' | 'es' | 'fr' | 'de' | 'hi'; status: string };
  target: { id?: string; role: string; company: string | null; jobDescription: string | null } | null;
  documents: Array<{ id: string; fileName: string; kind: string; parseStatus: string }>;
};

type View = 'home' | 'opportunities' | 'prepare' | 'memory' | 'practice' | 'sessions' | 'career' | 'settings';
type OpportunityTab = 'overview' | 'role' | 'preparation' | 'rounds' | 'match' | 'documents';
type PrepareStep = 'opportunity' | 'interview' | 'evidence' | 'check' | 'consent';
type CandidateFact = string | { claim: string; evidence?: string };
type Target = { id: string; role: string; company: string | null; jobDescription: string | null; competencies: string[]; createdAt?: number; updatedAt?: number };
type Document = { id: string; kind: 'resume' | 'job-description' | 'other'; fileName: string; sizeBytes: number; parseStatus: string; candidateFacts: CandidateFact[]; createdAt?: number };
type Claim = { id: string; claimText: string; claimType: string; verificationStatus: string; sourceType: string; sourceExcerpt?: string | null; confidence: number; sensitive: boolean };
type Experience = { id: string; title: string; company?: string | null; role?: string | null; summary?: string | null; technologies: string[]; competencies: string[]; verificationStatus: string; claims: Claim[]; updatedAt: number };
type Report = { id: string; sessionId: string; mode: string; score: number | null; summary: string; createdAt: number; strengths: string[]; improvements: string[]; notes: string[]; actionItems: string[]; followUpEmail?: string | null };
type Session = { id: string; jobTargetId?: string | null; interviewRoundId?: string | null; mode: string; locale: string; status: string; startedAt: number; liveSeconds: number; reportId?: string | null };
type Concern = { id: string; status: string; category: string; summary: string; evidence?: string | null };
type Round = { id: string; name: string; status: string; objective?: string | null; scheduledAt?: number | null; completedAt?: number | null; summary?: string | null; interviewers: string[]; concerns: Concern[] };
type Process = { id: string; jobTargetId?: string | null; title: string; status: string; outcome?: string | null; updatedAt: number; rounds: Round[] };
type NextRoundBrief = { process: { id: string; title: string; status: string }; whatTheyKnow: string[]; alreadyDiscussed: string[]; concerns: Concern[]; verifiedExperiencesToPrioritize: string[]; storiesNotYetUsed: string[]; evidenceGaps: string[]; suggestedPreparation: string[] };
type Coverage = { competency: string; strength: 'strong' | 'partial' | 'missing'; verifiedClaims: number };
type Application = { id: string; role: string; company: string; jobUrl?: string | null; jobDescription?: string | null; status: string; matchScore?: number | null; notes?: string | null; nextAction?: string | null; updatedAt: number };
type Artifact = { id?: string; kind?: string; title: string; content: string; bullets: string[]; keywords: string[]; score: number | null; caution: string | null; createdAt?: number };
type Provider = { id: string; label: string; enabled: boolean; capabilities: string[]; configuration: string };
type Quota = { plan: string; liveLimitMinutes: number; remainingLiveSeconds: number; remainingMockSessions: number | null };
type CommunicationProfile = {
  preferredAnswerLength: 'tiny' | 'concise' | 'standard' | 'detailed';
  technicalDepth: 'brief' | 'balanced' | 'deep';
  tone: 'conversational' | 'formal' | 'executive' | 'warm';
  firstPersonStyle: 'direct' | 'reflective' | 'team_forward';
  bulletPreference: 'progressive' | 'bullets' | 'narrative';
  explanationDepth: 'adaptive' | 'short' | 'detailed';
  vocabularyPreferences: string[];
};
type Authorization = { deviceCode: string; userCode: string; verificationUrl: string; expiresAt: number; intervalSeconds: number };
type PreflightCheck = { id: string; label: string; status: 'ready' | 'attention' | 'failed'; detail: string; latencyMs?: number | null };
type SystemAudioStatus = {
  state: string;
  permissionGranted: boolean;
  captureActive: boolean;
  reason: string;
  diagnostics?: { signingStable: boolean } | null;
};

const defaultProfile: CommunicationProfile = {
  preferredAnswerLength: 'concise', technicalDepth: 'balanced', tone: 'conversational', firstPersonStyle: 'direct',
  bulletPreference: 'progressive', explanationDepth: 'adaptive', vocabularyPreferences: [],
};

const navGroups: Array<{ label: string; items: Array<{ id: View; label: string; icon: LucideIcon }> }> = [
  { label: 'Workspace', items: [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'opportunities', label: 'Opportunities', icon: BriefcaseBusiness },
    { id: 'practice', label: 'Practice', icon: Mic2 },
  ] },
  { label: 'Library', items: [
    { id: 'memory', label: 'Career Memory', icon: Brain },
    { id: 'sessions', label: 'Sessions', icon: History },
    { id: 'career', label: 'Career Tools', icon: Sparkles },
  ] },
  { label: 'System', items: [
    { id: 'settings', label: 'Settings', icon: Settings },
  ] },
];

const modeCopy: Record<InterviewMode, { title: string; detail: string }> = {
  general: { title: 'General copilot', detail: 'Live answers for any conversation or on-screen task.' },
  meeting: { title: 'Meeting notes', detail: 'Transcribe, answer, capture decisions, actions, and follow-ups.' },
  sales: { title: 'Sales call', detail: 'Discovery, objection handling, value clarity, and next steps.' },
  presentation: { title: 'Presentation', detail: 'Stay on message and answer audience questions clearly.' },
  study: { title: 'Study session', detail: 'Explain concepts, use examples, and check understanding.' },
  custom: { title: 'Custom copilot', detail: 'Shape the assistant around your own objective and sources.' },
  negotiation: { title: 'Negotiation', detail: 'Clarify interests, boundaries, options, and commitments.' },
  behavioral: { title: 'Behavioral', detail: 'Natural STAR framing from verified experiences.' },
  technical: { title: 'Technical', detail: 'Concepts, engineering decisions, trade-offs, and depth.' },
  coding: { title: 'Coding', detail: 'Clarify, plan, implement, test, and optimize.' },
  'system-design': { title: 'System design', detail: 'Progressive requirements, architecture, scaling, and failure handling.' },
  case: { title: 'Case interview', detail: 'Frame, hypothesize, calculate, synthesize, and recommend.' },
  mock: { title: 'Mock interview', detail: 'Practice with grounded coaching and a saved debrief.' },
};

const careerToolCopy: Record<CareerToolKind, string> = {
  'resume-build': 'Resume builder', 'resume-review': 'Resume review + ATS', 'cover-letter': 'Cover letter',
  'job-fit': 'Job-fit analysis', 'career-plan': 'Career action plan',
};

function factText(fact: CandidateFact) { return typeof fact === 'string' ? fact : fact.claim; }
function factEvidence(fact: CandidateFact) { return typeof fact === 'string' ? '' : fact.evidence ?? ''; }
function formatDate(value?: number | null) { return value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not scheduled'; }
function formatDuration(seconds: number) { return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`; }
function mimeType(file: File) {
  if (file.type === 'application/pdf' || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.type === 'text/plain') return file.type;
  return /\.(txt|md)$/i.test(file.name) ? 'text/plain' : '';
}
function noteValue(notes: string[], prefix: string) { return notes.find((note) => note.startsWith(prefix))?.slice(prefix.length).trim() ?? ''; }
function statusLabel(value: string) { return value.replaceAll('_', ' ').replaceAll('-', ' '); }

export async function desktopApi<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown) {
  return invoke<T>('desktop_api_request', { method, path, body: body ?? null });
}

function EmptyState({ title, copy, action }: { title: string; copy: string; action?: React.ReactNode }) {
  return <div className="workspace-empty"><span>◇</span><b>{title}</b><p>{copy}</p>{action}</div>;
}

function StateDot({ state }: { state: string }) {
  const normalized = ['verified', 'corrected', 'ready', 'completed', 'saved', 'active'].includes(state)
    ? 'ready' : ['failed', 'rejected', 'discarded'].includes(state) ? 'failed' : 'attention';
  return <i className={`state-dot ${normalized}`} aria-hidden="true" />;
}

export function ControlCenter({ account, activeContext, appVersion, preview = false, assistantPreferences, onAssistantPreferencesChange, onResetAssistantAppearance, onAuthenticated, onOpenLive, onSessionPrepared, onSignOut, setStatus }: {
  account: DesktopAccount | null;
  activeContext: NativeSessionContext | null;
  appVersion: string;
  preview?: boolean;
  assistantPreferences: AssistantPreferences;
  onAssistantPreferencesChange: (patch: Partial<AssistantPreferences>) => void;
  onResetAssistantAppearance: () => void;
  onAuthenticated: (account: DesktopAccount) => void;
  onOpenLive: () => void;
  onSessionPrepared: (context: NativeSessionContext) => void;
  onSignOut: () => Promise<void>;
  setStatus: (message: string) => void;
}) {
  const [view, setView] = React.useState<View>('home');
  const [opportunityTab, setOpportunityTab] = React.useState<OpportunityTab>('overview');
  const [prepareStep, setPrepareStep] = React.useState<PrepareStep>('opportunity');
  const [authorization, setAuthorization] = React.useState<Authorization | null>(null);
  const [busy, setBusy] = React.useState('');
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [loaded, setLoaded] = React.useState(false);
  const [targets, setTargets] = React.useState<Target[]>([]);
  const [documents, setDocuments] = React.useState<Document[]>([]);
  const [experiences, setExperiences] = React.useState<Experience[]>([]);
  const [reports, setReports] = React.useState<Report[]>([]);
  const [sessions, setSessions] = React.useState<Session[]>([]);
  const [processes, setProcesses] = React.useState<Process[]>([]);
  const [applications, setApplications] = React.useState<Application[]>([]);
  const [artifacts, setArtifacts] = React.useState<Artifact[]>([]);
  const [providers, setProviders] = React.useState<Provider[]>([]);
  const [quota, setQuota] = React.useState<Quota | null>(null);
  const [coverage, setCoverage] = React.useState<Coverage[]>([]);
  const [profile, setProfile] = React.useState<CommunicationProfile>(defaultProfile);
  const [selectedTargetId, setSelectedTargetId] = React.useState('');
  const [selectedProcessId, setSelectedProcessId] = React.useState('');
  const [brief, setBrief] = React.useState<NextRoundBrief | null>(null);
  const [role, setRole] = React.useState('');
  const [company, setCompany] = React.useState('');
  const [jobDescription, setJobDescription] = React.useState('');
  const [interviewer, setInterviewer] = React.useState('');
  const [roundName, setRoundName] = React.useState('Conversation');
  const [objective, setObjective] = React.useState('');
  const [mode, setMode] = React.useState<InterviewMode>('general');
  const [locale, setLocale] = React.useState<(typeof supportedLocales)[number]>('en');
  const [selectedDocuments, setSelectedDocuments] = React.useState<string[]>([]);
  const [resumeFactSelection, setResumeFactSelection] = React.useState<Record<string, string[]>>({});
  const [consent, setConsent] = React.useState(false);
  const [preflight, setPreflight] = React.useState<PreflightCheck[]>([]);
  const [systemAudioCheck, setSystemAudioCheck] = React.useState<SystemAudioStatus | null>(null);
  const [memoryFilter, setMemoryFilter] = React.useState<'all' | 'review' | 'verified'>('all');
  const [expandedExperience, setExpandedExperience] = React.useState('');
  const [editingClaim, setEditingClaim] = React.useState('');
  const [editedClaimText, setEditedClaimText] = React.useState('');
  const [manualMemoryOpen, setManualMemoryOpen] = React.useState(false);
  const [manualMemory, setManualMemory] = React.useState({ title: '', company: '', role: '', claimText: '', technologies: '' });
  const [selectedReport, setSelectedReport] = React.useState<Report | null>(null);
  const [sessionFilter, setSessionFilter] = React.useState<'all' | 'interviews' | 'meetings' | 'practice'>('all');
  const [careerSection, setCareerSection] = React.useState<'tools' | 'pipeline'>('tools');
  const [toolKind, setToolKind] = React.useState<CareerToolKind>('resume-review');
  const [toolForm, setToolForm] = React.useState({ role: '', company: '', jobDescription: '', sourceText: '', prompt: '', tone: 'confident' });
  const [toolResult, setToolResult] = React.useState<Artifact | null>(null);
  const [applicationForm, setApplicationForm] = React.useState({ role: '', company: '', jobUrl: '', jobDescription: '' });
  const [vocabulary, setVocabulary] = React.useState('');
  const [settingsSection, setSettingsSection] = React.useState<'appearance' | 'style' | 'providers' | 'privacy' | 'shortcuts'>('appearance');
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);

  const verifiedClaims = React.useMemo(() => experiences.flatMap((item) => item.claims).filter((claim) => ['verified', 'corrected'].includes(claim.verificationStatus)), [experiences]);
  const reviewClaims = React.useMemo(() => experiences.flatMap((item) => item.claims).filter((claim) => ['proposed', 'unsupported'].includes(claim.verificationStatus)), [experiences]);
  const readyDocuments = documents.filter((document) => ['ready', 'verified'].includes(document.parseStatus));
  const selectedTarget = targets.find((target) => target.id === selectedTargetId) ?? null;
  const selectedProcess = processes.find((process) => process.id === selectedProcessId) ?? processes.find((process) => process.jobTargetId === selectedTargetId) ?? null;
  const filteredSessions = sessions.filter((session) => sessionFilter === 'all'
    || (sessionFilter === 'meetings' && session.mode === 'meeting')
    || (sessionFilter === 'practice' && session.mode === 'mock')
    || (sessionFilter === 'interviews' && modeRequiresVerifiedResume(session.mode as InterviewMode)));

  const loadAccountData = React.useCallback(async (quiet = false) => {
    if (!account || account.scope !== 'account') return;
    if (preview) { setLoaded(true); setStatus('Desktop interface preview'); return; }
    if (!quiet) setBusy('loading');
    const failures: string[] = [];
    const safe = async <T,>(label: string, promise: Promise<T>, fallback: T): Promise<T> => {
      try { return await promise; } catch { failures.push(label); return fallback; }
    };
    const [targetData, documentData, memoryData, reportData, profileData, sessionData, processData, quotaData, applicationData, artifactData, providerData] = await Promise.all([
      safe('opportunities', desktopApi<{ jobTargets: Target[] }>('GET', '/api/v1/job-targets'), { jobTargets: [] }),
      safe('documents', desktopApi<{ documents: Document[] }>('GET', '/api/v1/documents'), { documents: [] }),
      safe('Career Memory', desktopApi<{ experiences: Experience[] }>('GET', '/api/v1/memory'), { experiences: [] }),
      safe('reports', desktopApi<{ reports: Report[] }>('GET', '/api/v1/reports'), { reports: [] }),
      safe('preferences', desktopApi<{ communicationProfile: CommunicationProfile }>('GET', '/api/v1/memory/communication-profile'), { communicationProfile: defaultProfile }),
      safe('sessions', desktopApi<{ sessions: Session[] }>('GET', '/api/v1/sessions'), { sessions: [] }),
      safe('interview journey', desktopApi<{ processes: Process[] }>('GET', '/api/v1/interview-processes'), { processes: [] }),
      safe('quota', desktopApi<Quota | null>('GET', '/api/v1/entitlements'), null),
      safe('job tracker', desktopApi<{ applications: Application[] }>('GET', '/api/v1/job-applications'), { applications: [] }),
      safe('career artifacts', desktopApi<{ artifacts: Artifact[] }>('GET', '/api/v1/tools/generate'), { artifacts: [] }),
      safe('AI providers', desktopApi<{ providers: Provider[] }>('GET', '/api/v1/providers'), { providers: [] }),
    ]);
    setTargets(targetData.jobTargets ?? []); setDocuments(documentData.documents ?? []); setExperiences(memoryData.experiences ?? []);
    setReports(reportData.reports ?? []); setProfile(profileData.communicationProfile ?? defaultProfile);
    setVocabulary((profileData.communicationProfile?.vocabularyPreferences ?? []).join(', ')); setSessions(sessionData.sessions ?? []);
    setProcesses(processData.processes ?? []); setQuota(quotaData); setApplications(applicationData.applications ?? []);
    setArtifacts(artifactData.artifacts ?? []); setProviders(providerData.providers ?? []);
    const nextDocuments = documentData.documents ?? [];
    setSelectedDocuments((current) => current.length ? current.filter((id) => nextDocuments.some((item) => item.id === id)) : nextDocuments.filter((item) => ['ready', 'verified'].includes(item.parseStatus)).map((item) => item.id).slice(0, 12));
    setLoaded(true);
    if (failures.length) { setNotice(`Some areas could not refresh: ${failures.join(', ')}. The rest of the workspace remains available.`); setStatus('Workspace loaded with a few recoverable errors'); }
    else if (!quiet) setStatus('Torvi workspace ready');
    if (!quiet) setBusy('');
  }, [account, preview, setStatus]);

  React.useEffect(() => { const timer = window.setTimeout(() => void loadAccountData(), 0); return () => window.clearTimeout(timer); }, [loadAccountData]);
  React.useEffect(() => {
    if (!authorization) return;
    let stopped = false;
    const poll = async () => {
      try {
        const result = await invoke<{ status: string; account?: DesktopAccount }>('poll_desktop_authorization', { deviceCode: authorization.deviceCode });
        if (!stopped && result.status === 'approved' && result.account) { onAuthenticated(result.account); setAuthorization(null); setStatus('Signed in securely on this Mac'); }
      } catch (pollError) { if (!stopped) setError(pollError instanceof Error ? pollError.message : String(pollError)); }
    };
    const interval = window.setInterval(() => void poll(), Math.max(2, authorization.intervalSeconds) * 1_000); void poll();
    return () => { stopped = true; window.clearInterval(interval); };
  }, [authorization, onAuthenticated, setStatus]);
  React.useEffect(() => {
    if (!selectedProcess?.id) return;
    let alive = true;
    desktopApi<NextRoundBrief>('GET', `/api/v1/interview-processes/${selectedProcess.id}/brief`).then((result) => { if (alive) setBrief(result); }).catch(() => { if (alive) setBrief(null); });
    return () => { alive = false; };
  }, [selectedProcess?.id]);

  async function beginSignIn() {
    setBusy('signin'); setError(''); setStatus('Starting secure Mac sign-in…');
    try {
      const next = await invoke<Authorization>('begin_desktop_authorization', { deviceName: 'Torvi for Mac', appVersion });
      setAuthorization(next); await openUrl(next.verificationUrl); setStatus('Approve this Mac in the browser; sign-in finishes automatically');
    } catch (signInError) { const message = signInError instanceof Error ? signInError.message : String(signInError); setError(message); setStatus(message); }
    finally { setBusy(''); }
  }
  function startFlow(nextMode: InterviewMode) { setMode(nextMode); setPrepareStep('opportunity'); setView('prepare'); setError(''); }
  function chooseTarget(id: string, openWorkspace = false) {
    const target = targets.find((item) => item.id === id); if (!target) return;
    setSelectedTargetId(id); setRole(target.role); setCompany(target.company ?? ''); setJobDescription(target.jobDescription ?? '');
    setInterviewer(noteValue(target.competencies ?? [], 'Interviewer:')); setRoundName(noteValue(target.competencies ?? [], 'Interview round:') || 'Conversation');
    setObjective(noteValue(target.competencies ?? [], 'Session objective:'));
    const process = processes.find((item) => item.jobTargetId === id); setSelectedProcessId(process?.id ?? '');
    if (openWorkspace) { setOpportunityTab('overview'); setView('opportunities'); }
  }
  function resetTarget() { setSelectedTargetId(''); setSelectedProcessId(''); setRole(''); setCompany(''); setJobDescription(''); setInterviewer(''); setRoundName('Conversation'); setObjective(''); setBrief(null); }
  function targetNotes() {
    return [interviewer.trim() ? `Interviewer: ${interviewer.trim()}` : '', roundName.trim() ? `Interview round: ${roundName.trim()}` : '', objective.trim() ? `Session objective: ${objective.trim()}` : '', ...(brief?.whatTheyKnow ?? []).slice(0, 6).map((item) => `Prior round: ${item}`)].filter(Boolean);
  }
  async function persistTarget() {
    if (!role.trim() || !company.trim()) throw new Error('Add a session title and organization, team, or company.');
    const payload = { role: role.trim(), company: company.trim(), jobDescription: jobDescription.trim() || null, competencies: targetNotes() };
    if (selectedTargetId) { await desktopApi('PATCH', `/api/v1/job-targets/${selectedTargetId}`, payload); return selectedTargetId; }
    const created = await desktopApi<{ id: string }>('POST', '/api/v1/job-targets', payload); setSelectedTargetId(created.id); return created.id;
  }
  async function saveOpportunity() {
    setBusy('target'); setError('');
    try { const id = await persistTarget(); await loadAccountData(true); setSelectedTargetId(id); setNotice('Opportunity saved. Add interview details or open its preparation workspace.'); return true; }
    catch (saveError) { setError(saveError instanceof Error ? saveError.message : String(saveError)); return false; }
    finally { setBusy(''); }
  }
  async function upload(file: File, kind: Document['kind']) {
    const contentType = mimeType(file); if (!contentType) throw new Error('Use a PDF, DOCX, TXT, or Markdown document.');
    if (file.size > 8 * 1024 * 1024) throw new Error('Each document must be 8 MB or smaller.');
    setBusy('upload'); setStatus(`Processing ${file.name}…`);
    const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
    const result = await invoke<{ documentId: string; candidateFacts?: Array<{ claim: string; evidence?: string }>; parseStatus: string }>('desktop_upload_document', { fileName: file.name, contentType, kind, bytes });
    setSelectedDocuments((current) => [...new Set([...current, result.documentId])].slice(0, 12));
    if (kind === 'resume' && result.candidateFacts?.length) setResumeFactSelection((current) => ({ ...current, [result.documentId]: [] }));
    await loadAccountData(true); setStatus(kind === 'resume' ? 'Resume extracted—review each claim before using it' : 'Supporting document ready'); setBusy('');
  }
  async function uploadFiles(files: FileList | null, kind: Document['kind']) {
    if (!files?.length) return; setError('');
    try { for (const file of Array.from(files).slice(0, 6)) await upload(file, kind); }
    catch (uploadError) { const message = uploadError instanceof Error ? uploadError.message : String(uploadError); setError(message); setStatus(message); setBusy(''); }
  }
  async function verifyResume(document: Document) {
    const selected = resumeFactSelection[document.id] ?? [];
    if (!selected.length) return setError('Select every claim you personally confirm. Unselected claims will not be used as your experience.');
    setBusy(`verify:${document.id}`); setError('');
    try { await desktopApi('POST', `/api/v1/documents/${document.id}/verify`, { facts: selected }); await loadAccountData(true); setNotice(`${selected.length} resume ${selected.length === 1 ? 'claim is' : 'claims are'} now verified for grounded answers.`); }
    catch (verifyError) { setError(verifyError instanceof Error ? verifyError.message : String(verifyError)); }
    finally { setBusy(''); }
  }
  async function runPreflight() {
    setBusy('preflight'); setError(''); setPreflight([]); setStatus('Running a real readiness check…'); const checks: PreflightCheck[] = [];
    const networkStarted = performance.now();
    try {
      const backend = await desktopApi<{ checks: Array<{ id: string; label: string; status: string; detail: string }> }>('GET', '/api/v1/preflight');
      const latencyMs = Math.round(performance.now() - networkStarted);
      checks.push({ id: 'network', label: 'Network + account', status: latencyMs < 1_500 ? 'ready' : 'attention', detail: latencyMs < 1_500 ? 'The secure service responded normally.' : 'The service responded, but latency is elevated.', latencyMs });
      checks.push(...backend.checks.map((item) => ({ ...item, status: item.status === 'ready' ? 'ready' as const : item.status === 'failed' ? 'failed' as const : 'attention' as const })));
    } catch { checks.push({ id: 'network', label: 'Network + account', status: 'failed', detail: 'Torvi could not reach the secure service. Live AI is affected.' }); }
    try {
      const system = await invoke<SystemAudioStatus>('system_audio_status'); setSystemAudioCheck(system);
      checks.push({ id: 'system-audio', label: 'System audio', status: ['authorized', 'running'].includes(system.state) ? 'ready' : system.state === 'captureFailed' ? 'failed' : 'attention', detail: ['authorized', 'running'].includes(system.state) ? 'macOS Screen & System Audio Recording access is ready.' : system.reason });
    } catch { setSystemAudioCheck(null); checks.push({ id: 'system-audio', label: 'System audio', status: 'failed', detail: 'The native audio check could not run.' }); }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); const audioContext = new AudioContext(); const analyser = audioContext.createAnalyser(); analyser.fftSize = 256;
      audioContext.createMediaStreamSource(stream).connect(analyser); await new Promise((resolve) => window.setTimeout(resolve, 550));
      const values = new Uint8Array(analyser.fftSize); analyser.getByteTimeDomainData(values);
      const energy = Math.sqrt(values.reduce((sum, sample) => sum + ((sample - 128) / 128) ** 2, 0) / values.length);
      stream.getTracks().forEach((track) => track.stop()); await audioContext.close();
      checks.push({ id: 'microphone', label: 'Microphone', status: 'ready', detail: energy > 0.003 ? 'Permission, device, and live input were detected.' : 'Permission and device are ready. Speak during the live test to verify input level.' });
    } catch { checks.push({ id: 'microphone', label: 'Microphone', status: 'attention', detail: 'Microphone permission is off or no input device is available. System-audio-only coaching can still run.' }); }
    try { const ai = await desktopApi<PreflightCheck>('POST', '/api/v1/preflight'); checks.push({ ...ai, status: ai.status === 'ready' ? 'ready' : 'failed' }); }
    catch { checks.push({ id: 'ai', label: 'AI response test', status: 'failed', detail: 'A real AI response test did not complete. Live suggestions are affected.' }); }
    checks.push({ id: 'transcription', label: 'Live transcription', status: 'attention', detail: 'Not falsely marked ready: both Realtime channels are verified when you press Start in the Live Workspace.' });
    setPreflight(checks); const failed = checks.filter((item) => item.status === 'failed').length;
    setStatus(failed ? `${failed} readiness ${failed === 1 ? 'check needs' : 'checks need'} attention` : 'Live-session check complete'); setBusy('');
  }
  async function grantSystemAudio() {
    setBusy('permission'); setError('');
    try {
      const result = await invoke<SystemAudioStatus>('request_system_audio_permission'); setSystemAudioCheck(result); setNotice(result.reason);
      if (result.state === 'restartRequired') {
        setPreflight((current) => current.map((check) => check.id === 'system-audio' ? { ...check, status: 'attention', detail: result.reason } : check));
        setBusy('');
      } else await runPreflight();
    }
    catch (permissionError) { setError(permissionError instanceof Error ? permissionError.message : String(permissionError)); setBusy(''); }
  }
  async function resetSystemAudioPermission() {
    setBusy('permission'); setError('');
    try {
      const result = await invoke<SystemAudioStatus>('repair_system_audio_permission'); setSystemAudioCheck(result); setNotice(result.reason);
      setPreflight((current) => current.map((check) => check.id === 'system-audio' ? { ...check, status: 'attention', detail: result.reason } : check));
    }
    catch (permissionError) { setError(permissionError instanceof Error ? permissionError.message : String(permissionError)); }
    finally { setBusy(''); }
  }
  function restartDesktop() {
    setBusy('permission'); setStatus('Restarting Torvi to verify system-audio access…');
    void invoke('relaunch_desktop').catch((restartError) => { const message = restartError instanceof Error ? restartError.message : String(restartError); setError(message); setStatus(message); setBusy(''); });
  }
  async function startSession() {
    const selected = documents.filter((item) => selectedDocuments.includes(item.id));
    if (modeRequiresVerifiedResume(mode) && !selected.some((item) => item.kind === 'resume' && item.parseStatus === 'verified')) return setError('Select a verified resume before opening an interview mode.');
    if (!consent) return setError('Confirm permission to capture this conversation and use AI assistance.');
    if (!preflight.length) return setError('Run the system check first. It verifies the Mac, network, and hosted AI before this important session.');
    if (preflight.some((item) => ['network', 'ai', 'backend_auth'].includes(item.id) && item.status === 'failed')) return setError('Resolve the failed network or AI readiness check before starting.');
    setBusy('session'); setError(''); setStatus('Compiling your Torvi context…');
    try {
      const targetId = await persistTarget();
      const context = await invoke<NativeSessionContext>('desktop_start_session', { payload: { mode, locale, jobTargetId: targetId, documentIds: selected.map((item) => item.id), retentionChoice: 'ask-at-end', consent: { recordingAllowed: true, aiAssistanceAllowed: true, policyVersion: '2026-08-24' }, deviceId: account?.deviceId } });
      onSessionPrepared(context); setStatus(`${modeCopy[mode].title} ready—start listening when the conversation begins`);
    } catch (startError) { const message = startError instanceof Error ? startError.message : String(startError); setError(message); setStatus(message); }
    finally { setBusy(''); }
  }
  async function claimAction(claim: Claim, action: 'confirm' | 'correct' | 'reject' | 'mark_private' | 'delete') {
    setBusy(`claim:${claim.id}`); setError('');
    try {
      if (action === 'delete') await desktopApi('DELETE', `/api/v1/memory/claims/${claim.id}`);
      else await desktopApi('PATCH', `/api/v1/memory/claims/${claim.id}`, action === 'correct' ? { action, claimText: editedClaimText.trim() } : action === 'mark_private' ? { action, sensitive: !claim.sensitive } : { action });
      setEditingClaim(''); setEditedClaimText(''); await loadAccountData(true); setNotice(action === 'confirm' ? 'Claim verified and available to the answer engine.' : 'Career Memory updated.');
    } catch (claimError) { setError(claimError instanceof Error ? claimError.message : String(claimError)); }
    finally { setBusy(''); }
  }
  async function addManualMemory() {
    if (!manualMemory.title.trim() || !manualMemory.claimText.trim()) return setError('Add an experience title and one accurate claim.');
    setBusy('manual-memory'); setError('');
    try {
      await desktopApi('POST', '/api/v1/memory', { title: manualMemory.title, company: manualMemory.company || null, role: manualMemory.role || null, technologies: manualMemory.technologies.split(',').map((item) => item.trim()).filter(Boolean), competencies: [], claims: [{ claimText: manualMemory.claimText, claimType: 'other', sourceType: 'user_entry' }], confirmAsAccurate: true });
      setManualMemory({ title: '', company: '', role: '', claimText: '', technologies: '' }); setManualMemoryOpen(false); await loadAccountData(true); setNotice('Verified experience added to Career Memory.');
    } catch (memoryError) { setError(memoryError instanceof Error ? memoryError.message : String(memoryError)); }
    finally { setBusy(''); }
  }
  async function loadCoverage() {
    setBusy('coverage');
    try { const result = await desktopApi<{ coverage: Coverage[] }>('POST', '/api/v1/memory/coverage', { competencies: [] }); setCoverage(result.coverage ?? []); }
    catch (coverageError) { setError(coverageError instanceof Error ? coverageError.message : String(coverageError)); }
    finally { setBusy(''); }
  }
  async function concernAction(concern: Concern, action: 'confirm' | 'dismiss' | 'edit') {
    const edited = action === 'edit' ? window.prompt('Edit this concern', concern.summary)?.trim() : '';
    if (action === 'edit' && !edited) return; setBusy(`concern:${concern.id}`);
    try { await desktopApi('PATCH', `/api/v1/interview-processes/concerns/${concern.id}`, action === 'edit' ? { action, summary: edited } : { action }); await loadAccountData(true); if (selectedProcess?.id) setBrief(await desktopApi<NextRoundBrief>('GET', `/api/v1/interview-processes/${selectedProcess.id}/brief`)); }
    catch (concernError) { setError(concernError instanceof Error ? concernError.message : String(concernError)); }
    finally { setBusy(''); }
  }
  async function generateTool() {
    setBusy('tool'); setError(''); setToolResult(null);
    try { const result = await desktopApi<Artifact>('POST', '/api/v1/tools/generate', { kind: toolKind, locale: 'en', ...toolForm }); setToolResult(result); await loadAccountData(true); setNotice(`${careerToolCopy[toolKind]} saved to your career artifacts.`); }
    catch (toolError) { setError(toolError instanceof Error ? toolError.message : String(toolError)); }
    finally { setBusy(''); }
  }
  function downloadArtifact(artifact: Artifact) {
    const blob = new Blob([`${artifact.title}\n\n${artifact.content}\n\n${artifact.bullets.join('\n')}`], { type: 'text/plain' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `${artifact.kind ?? toolKind}-${Date.now()}.txt`; anchor.click(); URL.revokeObjectURL(url);
  }
  async function addApplication() {
    if (!applicationForm.role.trim() || !applicationForm.company.trim()) return setError('Add both a role and company.'); setBusy('application'); setError('');
    try { await desktopApi('POST', '/api/v1/job-applications', { ...applicationForm, jobUrl: applicationForm.jobUrl || null, jobDescription: applicationForm.jobDescription || null, status: 'saved' }); setApplicationForm({ role: '', company: '', jobUrl: '', jobDescription: '' }); await loadAccountData(true); }
    catch (applicationError) { setError(applicationError instanceof Error ? applicationError.message : String(applicationError)); }
    finally { setBusy(''); }
  }
  async function updateApplication(id: string, status: string) {
    setApplications((items) => items.map((item) => item.id === id ? { ...item, status } : item));
    try { await desktopApi('PATCH', `/api/v1/job-applications/${id}`, { status }); }
    catch (applicationError) { setError(applicationError instanceof Error ? applicationError.message : String(applicationError)); await loadAccountData(true); }
  }
  async function removeApplication(application: Application) {
    if (!window.confirm(`Remove ${application.role} at ${application.company} from the tracker?`)) return;
    try { await desktopApi('DELETE', `/api/v1/job-applications/${application.id}`); await loadAccountData(true); }
    catch (applicationError) { setError(applicationError instanceof Error ? applicationError.message : String(applicationError)); }
  }
  async function saveProfile() {
    setBusy('profile'); setError(''); const next = { ...profile, vocabularyPreferences: vocabulary.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 30) };
    try { await desktopApi('PATCH', '/api/v1/memory/communication-profile', next); setProfile(next); setNotice('Answer style saved. Factual grounding remains unchanged.'); setStatus('Answer preferences saved'); }
    catch (profileError) { setError(profileError instanceof Error ? profileError.message : String(profileError)); }
    finally { setBusy(''); }
  }
  function openSettingsSection(section: 'appearance' | 'style' | 'providers' | 'privacy' | 'shortcuts') {
    setSettingsSection(section);
  }

  if (!account || account.scope !== 'account') return <section className="native-welcome redesigned-welcome">
    <div className="welcome-mark"><i /><i /><i /></div><span>Torvi for Mac</span><h1>Your real-time AI assistant, ready when the conversation starts.</h1>
    <p>Listen to system audio and your microphone, ask about the conversation or screen, and leave with useful notes and next steps.</p>
    <div className="welcome-proof"><span><b>Native system audio</b><small>Zoom, Meet, Teams, Webex, and browser audio</small></span><span><b>Screen-aware answers</b><small>Read the primary screen only when you enable Screen</small></span><span><b>Explicit privacy</b><small>No stored audio; Private Overlay is a visible best-effort toggle</small></span></div>
    {authorization ? <div className="device-auth"><small>Approve this Mac</small><b>{authorization.userCode}</b><p>Your browser opened automatically. Approve the device there; this app signs in by itself.</p><button onClick={() => void openUrl(authorization.verificationUrl)}>Open approval page</button></div> : <button disabled={busy === 'signin'} onClick={() => void beginSignIn()}>{busy === 'signin' ? 'Opening secure sign-in…' : 'Continue securely'}</button>}
    {account?.scope === 'session' && <small>This is an older session-only credential. Sign out once, then use account sign-in for the complete native workspace.</small>}{error && <p className="native-error">{error}</p>}
    <small>Sign-in opens in your browser once. No meeting bot or connection code is required.</small>
  </section>;

  return <section className={`desktop-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}><aside className="workspace-sidebar"><div className="sidebar-identity"><div className="mini-mark" aria-hidden="true"><i /><i /><i /></div><div><b>Torvi</b><span>AI conversation copilot</span></div><button className="sidebar-collapse" type="button" aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} data-tooltip={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setSidebarCollapsed((value) => !value)}>{sidebarCollapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}</button></div><nav aria-label="Primary navigation">{navGroups.map((group) => <section className="sidebar-group" key={group.label} aria-label={group.label}><span>{group.label}</span>{group.items.map((item) => { const Icon = item.icon; return <button type="button" key={item.id} className={view === item.id ? 'active' : ''} aria-current={view === item.id ? 'page' : undefined} aria-label={item.label} title={sidebarCollapsed ? item.label : undefined} data-tooltip={item.label} onClick={() => { setView(item.id); setError(''); }}><i><Icon aria-hidden="true" /></i><span>{item.label}</span>{item.id === 'memory' && reviewClaims.length > 0 ? <em aria-label={`${reviewClaims.length} items need review`}>{reviewClaims.length}</em> : null}</button>; })}</section>)}</nav><div className="sidebar-usage"><span>{quota?.plan ?? 'Free'} plan</span><b>{quota ? Math.floor(quota.remainingLiveSeconds / 60) : '—'} live minutes</b><i><span style={{ width: quota ? `${Math.max(4, Math.min(100, quota.remainingLiveSeconds / Math.max(1, quota.liveLimitMinutes * 60) * 100))}%` : '4%' }} /></i></div><button className="sidebar-signout" type="button" aria-label="Sign out on this Mac" title={sidebarCollapsed ? 'Sign out' : undefined} data-tooltip="Sign out" onClick={() => void onSignOut()}><LogOut aria-hidden="true" /><span>Sign out on this Mac</span></button></aside>
    <div className="workspace-canvas">{(error || notice) && <div className={`workspace-banner ${error ? 'error' : 'notice'}`}><span>{error || notice}</span><button aria-label="Dismiss" onClick={() => { setError(''); setNotice(''); }}>×</button></div>}{busy === 'loading' && !loaded ? <div className="workspace-loading"><i /><b>Opening your workspace…</b><span>Loading opportunities, Career Memory, sessions, and reports.</span></div> : null}

      {view === 'home' && loaded && <div className="workspace-view home-view">
        <header className="workspace-title"><div><span>Today</span><h1>Help during the conversation, not after it.</h1><p>Listen in real time, optionally read the visible screen, get concise answers, and leave with useful notes.</p></div></header>
        {activeContext && <section className="active-session-card"><div className="live-orb"><i /></div><div><span>Prepared session</span><b>{activeContext.target?.role ?? modeCopy[activeContext.session.mode].title}{activeContext.target?.company ? ` at ${activeContext.target.company}` : ''}</b><small>{modeCopy[activeContext.session.mode].title} · {activeContext.documents.length} sources · waiting for audio</small></div><button onClick={onOpenLive}>Open Torvi <span>→</span></button></section>}
        <section className="home-focal"><div><span className="eyebrow">Start here</span><h2>What should the copilot help with?</h2><p>Choose a behavior, add optional private sources, run the permission check, and open the movable overlay.</p><div className="primary-starts"><button onClick={() => startFlow('general')}><i>✦</i><span><b>General Copilot</b><small>Any conversation or screen task</small></span><em>→</em></button><button onClick={() => startFlow('meeting')}><i>≋</i><span><b>Meeting</b><small>Notes, decisions, actions</small></span><em>→</em></button><button onClick={() => startFlow('sales')}><i>↗</i><span><b>Sales Call</b><small>Discovery and objections</small></span><em>→</em></button></div></div><aside className="readiness-card"><span>System readiness</span><h3>{preflight.length && !preflight.some((item) => item.status === 'failed') ? 'Ready to go live' : 'Run a quick check'}</h3><div><StateDot state={systemAudioCheck && ['authorized', 'running'].includes(systemAudioCheck.state) ? 'ready' : 'attention'} /><span><b>System audio</b><small>{systemAudioCheck?.reason ?? 'Not checked yet'}</small></span></div><div><StateDot state={preflight.some((item) => item.id === 'microphone' && item.status === 'ready') ? 'ready' : 'attention'} /><span><b>Microphone</b><small>Explicit permission required</small></span></div><div><StateDot state={preflight.length && !preflight.some((item) => item.status === 'failed') ? 'ready' : 'attention'} /><span><b>Network + AI</b><small>{preflight.length ? 'Checked recently' : 'Check before a live session'}</small></span></div><button onClick={() => { setPrepareStep('check'); setView('prepare'); }}>Run system check</button></aside></section>
        <section className="home-context-grid"><article><div className="section-line"><div><span>Private knowledge</span><h2>{readyDocuments.length ? `${readyDocuments.length} sources ready` : 'Add optional context'}</h2></div><button onClick={() => setView('memory')}>Manage</button></div><p className="context-copy">Personal facts require your approval. Screenshots are analyzed only when you press Ask with Screen enabled and are then discarded.</p></article><article><div className="section-line"><div><span>Recent work</span><h2>Sessions and notes</h2></div><button onClick={() => setView('sessions')}>View all</button></div>{sessions.slice(0, 3).map((session) => <button className="recent-session" key={session.id} onClick={() => { setSelectedReport(reports.find((item) => item.sessionId === session.id) ?? null); setView('sessions'); }}><i className={session.mode === 'meeting' ? 'meeting' : ''}>{session.mode === 'meeting' ? '≋' : '✦'}</i><span><b>{modeCopy[session.mode as InterviewMode]?.title ?? statusLabel(session.mode)}</b><small>{formatDate(session.startedAt)} · {formatDuration(session.liveSeconds)}</small></span><em>{statusLabel(session.status)}</em></button>)}{!sessions.length && <EmptyState title="No sessions yet" copy="Your live conversations and saved notes will appear here." />}</article></section>
      </div>}

      {view === 'prepare' && <div className="workspace-view prepare-view"><header className="workspace-title compact-title"><div><span>{modeCopy[mode].title}</span><h1>Prepare the live workspace</h1><p>Everything Torvi needs is configured here on your Mac.</p></div><button className="quiet-button" onClick={() => setView('home')}>Save and exit</button></header><nav className="setup-steps" aria-label="Torvi setup steps">{(['opportunity', 'interview', 'evidence', 'check', 'consent'] as PrepareStep[]).map((step, index) => <button key={step} className={prepareStep === step ? 'active' : ''} onClick={() => setPrepareStep(step)}><i>{index + 1}</i><span>{step === 'opportunity' ? 'Context' : step === 'interview' ? 'Behavior' : step === 'check' ? 'System check' : step}</span></button>)}</nav><section className="setup-workbench">
        {prepareStep === 'opportunity' && <div className="setup-pane"><div className="pane-heading"><span>01 · Conversation</span><h2>{modeRequiresVerifiedResume(mode) ? 'Which role are you interviewing for?' : 'What is this conversation about?'}</h2><p>Choose a saved profile or create session context without leaving the app.</p></div><label className="field wide"><span>Saved profile</span><select value={selectedTargetId} onChange={(event) => event.target.value ? chooseTarget(event.target.value) : resetTarget()}><option value="">Create a new profile</option>{targets.map((target) => <option key={target.id} value={target.id}>{target.role} · {target.company}</option>)}</select></label><div className="field-grid"><label className="field"><span>{modeRequiresVerifiedResume(mode) ? 'Job position' : 'Conversation title'}</span><input value={role} onChange={(event) => setRole(event.target.value)} placeholder={modeRequiresVerifiedResume(mode) ? 'Senior Product Manager' : 'Weekly product review'} /></label><label className="field"><span>{modeRequiresVerifiedResume(mode) ? 'Company' : 'Organization or team'}</span><input value={company} onChange={(event) => setCompany(event.target.value)} placeholder="Acme" /></label><label className="field wide"><span>{modeRequiresVerifiedResume(mode) ? 'Job description' : 'Agenda and context'}</span><textarea value={jobDescription} onChange={(event) => setJobDescription(event.target.value)} placeholder={modeRequiresVerifiedResume(mode) ? 'Paste the complete role description…' : 'Add the goal, background, constraints, and important context…'} /></label></div><div className="setup-footer"><span>This profile is persisted to your account for reuse.</span><button onClick={async () => { if (await saveOpportunity()) setPrepareStep('interview'); }} disabled={busy === 'target'}>{busy === 'target' ? 'Saving…' : 'Save & continue'} <em>→</em></button></div></div>}
        {prepareStep === 'interview' && <div className="setup-pane"><div className="pane-heading"><span>02 · Behavior</span><h2>Choose how the copilot should help.</h2><p>You can switch behaviors later from the live overlay without rebuilding the session.</p></div><div className="mode-picker">{interviewModes.map((item) => <button key={item} className={mode === item ? 'active' : ''} onClick={() => setMode(item)}><b>{modeCopy[item].title}</b><small>{modeCopy[item].detail}</small></button>)}</div><div className="field-grid"><label className="field"><span>Session label</span><input value={roundName} onChange={(event) => setRoundName(event.target.value)} placeholder="Weekly product sync" /></label><label className="field"><span>Other participant or group</span><input value={interviewer} onChange={(event) => setInterviewer(event.target.value)} placeholder="Name, customer, or panel" /></label><label className="field"><span>Language</span><select value={locale} onChange={(event) => setLocale(event.target.value as typeof locale)}>{supportedLocales.map((item) => <option key={item} value={item}>{item === 'en' ? 'English' : item === 'es' ? 'Spanish' : item === 'fr' ? 'French' : item === 'de' ? 'German' : 'Hindi'}</option>)}</select></label><label className="field wide"><span>Objective</span><textarea value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="What should the copilot help you communicate, decide, or learn?" /></label></div><div className="setup-footer"><button className="back" onClick={() => setPrepareStep('opportunity')}>← Back</button><button onClick={async () => { if (await saveOpportunity()) setPrepareStep('evidence'); }}>Save & continue <em>→</em></button></div></div>}
        {prepareStep === 'evidence' && <div className="setup-pane evidence-pane"><div className="pane-heading"><span>03 · Grounding</span><h2>Choose what the copilot may reference.</h2><p>A résumé establishes personal experience only after you verify its claims. Other files provide contextual knowledge, not invented autobiography.</p></div><div className="upload-row"><label><i>＋</i><span><b>Upload résumé</b><small>PDF, DOCX, TXT, or Markdown</small></span><input type="file" accept=".pdf,.docx,.txt,.md" disabled={busy === 'upload'} onChange={(event) => { void uploadFiles(event.target.files, 'resume'); event.target.value = ''; }} /></label><label><i>＋</i><span><b>Add supporting files</b><small>Research, notes, papers, technical material</small></span><input multiple type="file" accept=".pdf,.docx,.txt,.md" disabled={busy === 'upload'} onChange={(event) => { void uploadFiles(event.target.files, 'other'); event.target.value = ''; }} /></label></div>{documents.filter((item) => item.kind === 'resume' && item.parseStatus === 'needs-verification').map((document) => { const selected = resumeFactSelection[document.id] ?? []; return <article className="claim-review" key={document.id}><div className="claim-review-head"><div><span>Review required</span><h3>{document.fileName}</h3></div><b>{selected.length} of {document.candidateFacts.length} selected</b></div><p>Select only statements you can personally confirm. You can edit individual claims later in Career Memory.</p><div className="resume-facts">{document.candidateFacts.map((fact, index) => { const text = factText(fact); const checked = selected.includes(text); return <label key={`${text}:${index}`}><input type="checkbox" checked={checked} onChange={() => setResumeFactSelection((current) => ({ ...current, [document.id]: checked ? selected.filter((item) => item !== text) : [...selected, text] }))} /><span><b>{text}</b>{factEvidence(fact) && <small>Source: {factEvidence(fact)}</small>}</span></label>; })}</div><button disabled={busy === `verify:${document.id}` || !selected.length} onClick={() => void verifyResume(document)}>{busy === `verify:${document.id}` ? 'Verifying…' : `Verify ${selected.length} selected claims`}</button></article>; })}<div className="source-selector"><div className="section-line"><div><span>Session sources</span><h2>{readyDocuments.length} ready</h2></div><button onClick={() => setView('memory')}>Review Career Memory</button></div>{documents.length ? documents.map((document) => <label key={document.id} className={`source-row state-${document.parseStatus}`}><input type="checkbox" disabled={!['ready', 'verified'].includes(document.parseStatus)} checked={selectedDocuments.includes(document.id)} onChange={() => setSelectedDocuments((current) => current.includes(document.id) ? current.filter((id) => id !== document.id) : [...current, document.id].slice(0, 12))} /><i>{document.kind === 'resume' ? 'CV' : document.kind === 'job-description' ? 'JD' : 'DOC'}</i><span><b>{document.fileName}</b><small>{statusLabel(document.kind)} · {statusLabel(document.parseStatus)}</small></span><StateDot state={document.parseStatus} /></label>) : <EmptyState title="No sources yet" copy="Upload your résumé and any material the interviewer may reference." />}</div><div className="setup-footer"><button className="back" onClick={() => setPrepareStep('interview')}>← Back</button><button onClick={() => setPrepareStep('check')}>Continue to system check <em>→</em></button></div></div>}
        {prepareStep === 'check' && <div className="setup-pane check-pane"><div className="pane-heading"><span>04 · Readiness</span><h2>Test the real session path before the call.</h2><p>The check uses your actual Mac permissions, microphone, network, account, storage, and hosted AI. Transcription is only marked ready after both live channels connect.</p></div><button className="run-check" disabled={busy === 'preflight'} onClick={() => void runPreflight()}><i>{busy === 'preflight' ? '…' : '✓'}</i><span><b>{busy === 'preflight' ? 'Running checks…' : preflight.length ? 'Run checks again' : 'Run complete system check'}</b><small>Usually takes a few seconds</small></span></button>{preflight.length > 0 && <div className="check-results">{preflight.map((check) => <article key={check.id} className={check.status}><StateDot state={check.status === 'ready' ? 'ready' : check.status === 'failed' ? 'failed' : 'attention'} /><div><b>{check.label}</b><p>{check.detail}</p></div><span>{check.latencyMs != null ? `${check.latencyMs} ms` : check.status === 'ready' ? 'Ready' : check.status === 'failed' ? 'Failed' : 'Needs attention'}</span>{check.id === 'system-audio' && check.status !== 'ready' ? <>{systemAudioCheck?.state === 'restartRequired' ? <button onClick={restartDesktop} disabled={busy === 'permission'}>Restart app</button> : <button onClick={() => void grantSystemAudio()} disabled={busy === 'permission'}>Grant access</button>}{systemAudioCheck?.state === 'permissionRequired' ? <button className="quiet-button" title="Use only if macOS has a stale Torvi permission entry" onClick={() => void resetSystemAudioPermission()} disabled={busy === 'permission'}>Reset permission record</button> : null}</> : null}</article>)}</div>}<div className="recovery-note"><i>↻</i><div><b>Built to recover</b><p>The Live Workspace retries interrupted AI/transcription channels, keeps the current session open during temporary network loss, and reports which channel needs attention.</p></div></div><div className="setup-footer"><button className="back" onClick={() => setPrepareStep('evidence')}>← Back</button><button disabled={!preflight.length} onClick={() => setPrepareStep('consent')}>Continue <em>→</em></button></div></div>}
        {prepareStep === 'consent' && <div className="setup-pane consent-pane"><div className="pane-heading"><span>05 · Review</span><h2>Ready to open the focused workspace.</h2><p>No audio starts until you press Start Torvi in the next screen.</p></div><div className="session-review"><div><span>Opportunity</span><b>{role || 'Not added'} · {company || 'Not added'}</b></div><div><span>Mode and round</span><b>{modeCopy[mode].title} · {roundName || 'Round not specified'}</b></div><div><span>Grounding</span><b>{selectedDocuments.length} sources · {verifiedClaims.length} verified claims</b></div><div><span>Language</span><b>{locale.toUpperCase()}</b></div></div><label className="consent-confirm"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span><b>I have permission to capture this conversation and use AI assistance.</b><small>Audio is processed live and never stored. At the end, I will explicitly Save or Discard the transcript.</small></span></label><div className="privacy-callout"><i>◇</i><span><b>Truth-locked and private by default</b><small>Personal answers use verified Career Memory. Supporting documents can explain context but cannot create personal achievements.</small></span></div><div className="setup-footer"><button className="back" onClick={() => setPrepareStep('check')}>← Back</button><button className="launch-button" disabled={busy === 'session' || !consent} onClick={() => void startSession()}>{busy === 'session' ? 'Compiling context…' : 'Open Live Workspace'} <em>→</em></button></div></div>}
      </section></div>}

      {view === 'opportunities' && <div className="workspace-view opportunity-view"><header className="workspace-title compact-title"><div><span>Opportunities</span><h1>Carry context through every round.</h1><p>Role preparation, interview memory, evidence gaps, and next-round focus live together.</p></div><button className="primary-compact" onClick={() => { resetTarget(); startFlow('behavioral'); }}>＋ New opportunity</button></header><div className="opportunity-layout"><aside className="opportunity-list">{targets.map((target) => { const process = processes.find((item) => item.jobTargetId === target.id); return <button key={target.id} className={selectedTargetId === target.id ? 'active' : ''} onClick={() => chooseTarget(target.id)}><i>{(target.company ?? '?').slice(0, 1).toUpperCase()}</i><span><b>{target.role}</b><small>{target.company ?? 'Company not set'} · {process?.rounds.length ?? 0} rounds</small></span><em>›</em></button>; })}{!targets.length && <EmptyState title="No opportunities" copy="Create one to organize preparation and interview rounds." action={<button onClick={() => startFlow('behavioral')}>Create opportunity</button>} />}</aside><section className="opportunity-workspace">{selectedTarget ? <><header><div><span>{selectedProcess?.status ?? 'Preparing'}</span><h2>{selectedTarget.company} — {selectedTarget.role}</h2><p>{selectedProcess?.rounds.length ? `${selectedProcess.rounds.length} interview ${selectedProcess.rounds.length === 1 ? 'round' : 'rounds'} in memory` : 'No completed rounds yet'}</p></div><button onClick={() => { setMode('behavioral'); setView('prepare'); setPrepareStep('interview'); }}>Prepare next round</button></header><nav>{(['overview', 'role', 'preparation', 'rounds', 'match', 'documents'] as OpportunityTab[]).map((tab) => <button key={tab} className={opportunityTab === tab ? 'active' : ''} onClick={() => setOpportunityTab(tab)}>{tab === 'match' ? 'Career Match' : statusLabel(tab)}</button>)}</nav>{opportunityTab === 'overview' && <div className="opportunity-overview"><div className="opportunity-summary"><span>Next-round signal</span><h3>{brief?.concerns.length ? `${brief.concerns.length} open ${brief.concerns.length === 1 ? 'concern' : 'concerns'} to address` : selectedProcess ? 'No unresolved concerns' : 'Start the first round'}</h3><p>{brief?.suggestedPreparation[0] ?? 'Prepare verified evidence and choose the interview mode when the next round is scheduled.'}</p><button onClick={() => setOpportunityTab('preparation')}>Open next-round brief →</button></div><div className="journey-preview"><span>Interview journey</span>{selectedProcess?.rounds.length ? selectedProcess.rounds.slice().reverse().map((round, index) => <article key={round.id}><i className={round.status}>{index + 1}</i><div><b>{round.name}</b><small>{round.interviewers.join(', ') || 'Interviewer not added'} · {statusLabel(round.status)}</small></div>{round.concerns.filter((item) => item.status !== 'dismissed').length ? <em>{round.concerns.filter((item) => item.status !== 'dismissed').length} concerns</em> : <em>clear</em>}</article>) : <EmptyState title="No rounds in memory" copy="Your first saved interview starts the journey." />}</div></div>}{opportunityTab === 'role' && <div className="role-pane"><div className="role-copy"><span>Role context</span><h3>{selectedTarget.role}</h3><p>{selectedTarget.jobDescription || 'No job description has been added yet.'}</p></div><button onClick={() => { chooseTarget(selectedTarget.id); setView('prepare'); setPrepareStep('opportunity'); }}>Edit role context</button></div>}{opportunityTab === 'preparation' && <div className="brief-grid"><article><span>What they already know</span>{brief?.whatTheyKnow.length ? brief.whatTheyKnow.map((item) => <p key={item}>{item}</p>) : <p>No saved round summaries yet.</p>}</article><article><span>Experiences to prioritize</span>{brief?.verifiedExperiencesToPrioritize.length ? brief.verifiedExperiencesToPrioritize.map((item) => <p key={item}>{item}</p>) : <p>Verify more experiences to strengthen retrieval.</p>}</article><article><span>Evidence gaps</span>{brief?.evidenceGaps.length ? brief.evidenceGaps.map((item) => <p key={item}>{item}</p>) : <p>No default competency gaps detected.</p>}</article><article><span>Stories not used yet</span>{brief?.storiesNotYetUsed.length ? brief.storiesNotYetUsed.map((item) => <p key={item}>{item}</p>) : <p>Your unused verified stories will appear here.</p>}</article></div>}{opportunityTab === 'rounds' && <div className="rounds-pane">{selectedProcess?.rounds.length ? selectedProcess.rounds.slice().reverse().map((round) => <article className="round-card" key={round.id}><header><StateDot state={round.status} /><div><b>{round.name}</b><small>{round.interviewers.join(', ') || 'Interviewer not added'} · {formatDate(round.completedAt ?? round.scheduledAt)}</small></div><em>{statusLabel(round.status)}</em></header>{round.objective && <p><b>Objective:</b> {round.objective}</p>}{round.summary && <p>{round.summary}</p>}{round.concerns.filter((item) => item.status !== 'dismissed').length > 0 && <div className="concern-list"><span>Concern ledger</span>{round.concerns.filter((item) => item.status !== 'dismissed').map((concern) => <div key={concern.id}><i>!</i><span><b>{statusLabel(concern.category)}</b><small>{concern.summary}</small></span><em>{statusLabel(concern.status)}</em><button onClick={() => void concernAction(concern, concern.status === 'proposed' ? 'confirm' : 'edit')}>{concern.status === 'proposed' ? 'Confirm' : 'Edit'}</button><button onClick={() => void concernAction(concern, 'dismiss')}>Dismiss</button></div>)}</div>}</article>) : <EmptyState title="No interview rounds" copy="Prepare and save the first session to begin cross-round memory." action={<button onClick={() => { setView('prepare'); setPrepareStep('interview'); }}>Prepare first round</button>} />}</div>}{opportunityTab === 'match' && <div className="match-pane"><div className="section-line"><div><span>Verified evidence coverage</span><h2>Career match</h2></div><button disabled={busy === 'coverage'} onClick={() => void loadCoverage()}>{coverage.length ? 'Refresh' : 'Analyze'}</button></div>{coverage.length ? <div className="coverage-list">{coverage.map((item) => <article key={item.competency}><div><b>{item.competency}</b><small>{item.verifiedClaims} verified claims</small></div><i><span style={{ width: item.strength === 'strong' ? '100%' : item.strength === 'partial' ? '56%' : '10%' }} /></i><em>{item.strength}</em></article>)}</div> : <EmptyState title="Coverage not analyzed" copy="Analyze Career Memory against core interview competencies." />}</div>}{opportunityTab === 'documents' && <div className="opportunity-documents">{documents.length ? documents.map((document) => <article key={document.id}><i>{document.kind === 'resume' ? 'CV' : 'DOC'}</i><span><b>{document.fileName}</b><small>{statusLabel(document.kind)} · {statusLabel(document.parseStatus)}</small></span><StateDot state={document.parseStatus} /></article>) : <EmptyState title="No documents" copy="Upload a resume and supporting material during preparation." />}</div>}</> : <EmptyState title="Choose an opportunity" copy="Select an opportunity on the left to open its role, preparation, rounds, and documents." />}</section></div></div>}

      {view === 'memory' && <div className="workspace-view memory-view"><header className="workspace-title compact-title"><div><span>Career Memory</span><h1>Your experience, verified and ready.</h1><p>Review what the copilot may say as personal history. Contextual documents never become autobiographical facts by themselves.</p></div><button className="primary-compact" onClick={() => setManualMemoryOpen(true)}>＋ Add experience</button></header><section className="memory-summary"><div><span>Verified claims</span><b>{verifiedClaims.length}</b><small>Available for personal answers</small></div><div><span>Needs review</span><b>{reviewClaims.length}</b><small>Excluded until confirmed</small></div><div><span>Experience groups</span><b>{experiences.length}</b><small>Projects, roles, and outcomes</small></div><button onClick={() => void loadCoverage()}><i>◎</i><span><b>Evidence coverage</b><small>{coverage.length ? `${coverage.filter((item) => item.strength === 'strong').length} strengths · ${coverage.filter((item) => item.strength === 'missing').length} gaps` : 'Analyze competencies'}</small></span></button></section><nav className="memory-filters"><button className={memoryFilter === 'all' ? 'active' : ''} onClick={() => setMemoryFilter('all')}>All experiences</button><button className={memoryFilter === 'review' ? 'active' : ''} onClick={() => setMemoryFilter('review')}>Needs review <em>{reviewClaims.length}</em></button><button className={memoryFilter === 'verified' ? 'active' : ''} onClick={() => setMemoryFilter('verified')}>Verified</button></nav>{manualMemoryOpen && <section className="manual-memory"><div className="section-line"><div><span>Manual verified entry</span><h2>Add context the résumé missed</h2></div><button onClick={() => setManualMemoryOpen(false)}>×</button></div><div className="field-grid"><label className="field"><span>Experience or project</span><input value={manualMemory.title} onChange={(event) => setManualMemory({ ...manualMemory, title: event.target.value })} placeholder="Search relevance platform" /></label><label className="field"><span>Company</span><input value={manualMemory.company} onChange={(event) => setManualMemory({ ...manualMemory, company: event.target.value })} /></label><label className="field"><span>Role</span><input value={manualMemory.role} onChange={(event) => setManualMemory({ ...manualMemory, role: event.target.value })} /></label><label className="field"><span>Technologies</span><input value={manualMemory.technologies} onChange={(event) => setManualMemory({ ...manualMemory, technologies: event.target.value })} placeholder="Python, Kafka, AWS" /></label><label className="field wide"><span>Accurate claim</span><textarea value={manualMemory.claimText} onChange={(event) => setManualMemory({ ...manualMemory, claimText: event.target.value })} placeholder="Describe the responsibility, action, decision, or outcome you can stand behind." /></label></div><label className="manual-confirm"><input type="checkbox" checked readOnly />I am adding this as an accurate, verified statement about my experience.</label><button disabled={busy === 'manual-memory'} onClick={() => void addManualMemory()}>{busy === 'manual-memory' ? 'Saving…' : 'Add verified experience'}</button></section>}{coverage.length > 0 && <section className="coverage-strip"><div><span>Evidence coverage</span><b>{coverage.filter((item) => item.strength === 'strong').length} strong · {coverage.filter((item) => item.strength === 'partial').length} partial · {coverage.filter((item) => item.strength === 'missing').length} missing</b></div>{coverage.slice(0, 8).map((item) => <span key={item.competency} className={item.strength}>{item.competency}</span>)}</section>}<section className="experience-grid">{experiences.filter((experience) => memoryFilter === 'all' || (memoryFilter === 'review' ? experience.claims.some((claim) => ['proposed', 'unsupported'].includes(claim.verificationStatus)) : experience.claims.some((claim) => ['verified', 'corrected'].includes(claim.verificationStatus)))).map((experience) => { const expanded = expandedExperience === experience.id; const visibleClaims = expanded ? experience.claims : experience.claims.slice(0, 3); return <article className="experience-card" key={experience.id}><header><div className="experience-monogram">{(experience.company ?? experience.title).slice(0, 2).toUpperCase()}</div><div><span>{[experience.role, experience.company].filter(Boolean).join(' · ') || 'Professional experience'}</span><h2>{experience.title}</h2></div><em className={`memory-status ${experience.verificationStatus}`}>{statusLabel(experience.verificationStatus)}</em></header>{experience.summary && <p className="experience-summary">{experience.summary}</p>}{experience.technologies?.length > 0 && <div className="technology-tags">{experience.technologies.slice(0, 8).map((technology) => <span key={technology}>{technology}</span>)}</div>}<div className="claims-list">{visibleClaims.map((claim) => <div className={`memory-claim ${claim.verificationStatus}`} key={claim.id}><div className="claim-state"><StateDot state={claim.verificationStatus} /></div><div className="claim-content">{editingClaim === claim.id ? <textarea autoFocus value={editedClaimText} onChange={(event) => setEditedClaimText(event.target.value)} /> : <p>{claim.claimText}</p>}<span>{statusLabel(claim.claimType)} · {statusLabel(claim.sourceType)} · {Math.round(claim.confidence * 100)}% extraction confidence{claim.sensitive ? ' · private' : ''}</span>{claim.sourceExcerpt && <details><summary>View original source</summary><small>{claim.sourceExcerpt}</small></details>}<div className="claim-actions">{editingClaim === claim.id ? <><button disabled={!editedClaimText.trim()} onClick={() => void claimAction(claim, 'correct')}>Save correction</button><button onClick={() => { setEditingClaim(''); setEditedClaimText(''); }}>Cancel</button></> : <>{['proposed', 'unsupported'].includes(claim.verificationStatus) && <button onClick={() => void claimAction(claim, 'confirm')}>Verify</button>}<button onClick={() => { setEditingClaim(claim.id); setEditedClaimText(claim.claimText); }}>Edit</button>{claim.verificationStatus !== 'rejected' && <button onClick={() => void claimAction(claim, 'reject')}>Reject</button>}<button onClick={() => void claimAction(claim, 'mark_private')}>{claim.sensitive ? 'Allow use' : 'Keep private'}</button><button className="danger" onClick={() => window.confirm('Permanently remove this claim from Career Memory?') && void claimAction(claim, 'delete')}>Delete</button></>}</div></div></div>)}</div>{experience.claims.length > 3 && <button className="expand-experience" onClick={() => setExpandedExperience(expanded ? '' : experience.id)}>{expanded ? 'Show less' : `Review all ${experience.claims.length} claims`} <span>{expanded ? '↑' : '↓'}</span></button>}</article>; })}{!experiences.length && <EmptyState title="Career Memory is empty" copy="Upload a resume during preparation or add a verified experience manually." action={<button onClick={() => { setMode('behavioral'); setView('prepare'); setPrepareStep('evidence'); }}>Upload résumé</button>} />}</section></div>}

      {view === 'practice' && <div className="workspace-view practice-view"><header className="workspace-title"><div><span>Practice</span><h1>Rehearse the pressure, not a script.</h1><p>Mock interviews use your role, verified experience, and answer style, then save a real debrief.</p></div></header><section className="practice-hero"><div><span>Guided mock interview</span><h2>Choose a focus. The copilot handles the rest.</h2><p>Use system audio for an external mock video or your microphone for a coached conversation. The same grounding policy applies.</p><button onClick={() => startFlow('mock')}>Prepare mock interview →</button></div><aside><span>Monthly practice</span><b>{quota?.remainingMockSessions ?? 'Unlimited'}</b><small>{quota?.remainingMockSessions == null ? 'Unlimited subject to fair use' : 'mock sessions remaining'}</small></aside></section><section className="practice-modes">{(['behavioral', 'technical', 'coding', 'system-design', 'case'] as InterviewMode[]).map((item) => <button key={item} onClick={() => { setMode('mock'); setObjective(`${modeCopy[item].title} interview practice`); setView('prepare'); setPrepareStep('interview'); }}><i>{item === 'coding' ? '</>' : item === 'system-design' ? '◇' : item === 'case' ? '∑' : item === 'technical' ? '⚙' : '◎'}</i><span><b>{modeCopy[item].title}</b><small>{modeCopy[item].detail}</small></span><em>→</em></button>)}</section><section className="practice-history"><div className="section-line"><div><span>Recent practice</span><h2>Improve from real feedback</h2></div><button onClick={() => setView('sessions')}>All sessions</button></div>{sessions.filter((session) => session.mode === 'mock').slice(0, 4).map((session) => { const report = reports.find((item) => item.sessionId === session.id); return <article key={session.id}><i>{report?.score ?? '—'}</i><span><b>{formatDate(session.startedAt)}</b><small>{report?.summary ?? 'Saved mock session'}</small></span><button onClick={() => { setSelectedReport(report ?? null); setView('sessions'); }}>View debrief</button></article>; })}{!sessions.some((session) => session.mode === 'mock') && <EmptyState title="No practice sessions yet" copy="Your mock interview reports will build a focused improvement history." />}</section></div>}

      {view === 'sessions' && <div className="workspace-view sessions-view"><header className="workspace-title compact-title"><div><span>Sessions</span><h1>Every conversation becomes useful memory.</h1><p>Notes, decisions, actions, coaching, and follow-up drafts remain organized here.</p></div><button className="primary-compact" onClick={() => startFlow('general')}>Start new session</button></header><div className="sessions-layout"><section className="session-history"><nav>{(['all', 'interviews', 'meetings', 'practice'] as const).map((filter) => <button key={filter} className={sessionFilter === filter ? 'active' : ''} onClick={() => setSessionFilter(filter)}>{statusLabel(filter)}</button>)}</nav>{filteredSessions.map((session) => { const report = reports.find((item) => item.sessionId === session.id); return <button key={session.id} className={selectedReport?.sessionId === session.id ? 'active' : ''} onClick={() => setSelectedReport(report ?? null)}><i className={session.mode === 'meeting' ? 'meeting' : ''}>{session.mode === 'meeting' ? '≋' : session.mode === 'mock' ? '◉' : '✦'}</i><span><b>{modeCopy[session.mode as InterviewMode]?.title ?? statusLabel(session.mode)}</b><small>{formatDate(session.startedAt)} · {session.locale.toUpperCase()} · {formatDuration(session.liveSeconds)}</small></span><em>{report?.score != null ? `${Math.round(report.score)}/100` : statusLabel(session.status)}</em></button>; })}{!filteredSessions.length && <EmptyState title="No saved sessions in this view" copy="Save a matching live conversation to create notes and a report." />}</section><section className="report-detail">{selectedReport ? <><header><div><span>{statusLabel(selectedReport.mode)} debrief · {formatDate(selectedReport.createdAt)}</span><h2>Session report</h2></div>{selectedReport.score != null && <b>{Math.round(selectedReport.score)}<small>/100</small></b>}</header><p className="report-summary">{selectedReport.summary}</p><div className="report-columns"><article><span>Strengths</span>{selectedReport.strengths.map((item) => <p key={item}><i>✓</i>{item}</p>)}</article><article><span>Improve next</span>{selectedReport.improvements.map((item) => <p key={item}><i>↗</i>{item}</p>)}</article></div>{selectedReport.actionItems.length > 0 && <article className="report-actions"><span>Next actions</span>{selectedReport.actionItems.map((item) => <label key={item}><input type="checkbox" />{item}</label>)}</article>}{selectedReport.notes.length > 0 && <details className="report-notes"><summary>Transcript notes</summary>{selectedReport.notes.map((item) => <p key={item}>{item}</p>)}</details>}{selectedReport.followUpEmail && <article className="followup-draft"><div><span>Follow-up draft</span><button onClick={() => void navigator.clipboard.writeText(selectedReport.followUpEmail ?? '')}>Copy</button></div><pre>{selectedReport.followUpEmail}</pre></article>}</> : <EmptyState title="Select a saved report" copy="Choose a completed session to review the summary, useful moments, actions, and follow-up draft." />}</section></div></div>}

      {view === 'career' && <div className="workspace-view career-view"><header className="workspace-title compact-title"><div><span>Career Tools</span><h1>Support the interview without crowding it.</h1><p>Build truthful application materials and track opportunities from saved to offer.</p></div></header><nav className="career-switch"><button className={careerSection === 'tools' ? 'active' : ''} onClick={() => setCareerSection('tools')}>AI career tools</button><button className={careerSection === 'pipeline' ? 'active' : ''} onClick={() => setCareerSection('pipeline')}>Job tracker <em>{applications.length}</em></button></nav>{careerSection === 'tools' ? <div className="career-tool-layout"><aside>{careerToolKinds.map((kind) => <button key={kind} className={toolKind === kind ? 'active' : ''} onClick={() => { setToolKind(kind); setToolResult(null); }}><i>{kind === 'resume-build' ? 'CV' : kind === 'resume-review' ? '✓' : kind === 'cover-letter' ? 'Aa' : kind === 'job-fit' ? '◎' : '↗'}</i><span><b>{careerToolCopy[kind]}</b><small>{kind === 'resume-build' ? 'ATS-readable draft from verified facts' : kind === 'resume-review' ? 'Clarity, evidence, relevance, and keywords' : kind === 'cover-letter' ? 'Tailored letter without invented claims' : kind === 'job-fit' ? 'Strengths, gaps, and preparation priorities' : 'A focused weekly action plan'}</small></span></button>)}<div className="saved-artifacts"><span>Saved artifacts</span>{artifacts.slice(0, 5).map((artifact) => <button key={artifact.id ?? artifact.title} onClick={() => setToolResult(artifact)}><b>{artifact.title}</b><small>{artifact.kind ? statusLabel(artifact.kind) : 'Career artifact'}</small></button>)}</div></aside><section className="tool-workbench"><header><span>Grounded in Career Memory</span><h2>{careerToolCopy[toolKind]}</h2><p>The model can frame and explain. It cannot invent personal experience, metrics, or achievements.</p></header><div className="field-grid"><label className="field"><span>Target role</span><input value={toolForm.role} onChange={(event) => setToolForm({ ...toolForm, role: event.target.value })} /></label><label className="field"><span>Company</span><input value={toolForm.company} onChange={(event) => setToolForm({ ...toolForm, company: event.target.value })} /></label><label className="field wide"><span>Job description</span><textarea value={toolForm.jobDescription} onChange={(event) => setToolForm({ ...toolForm, jobDescription: event.target.value })} /></label>{['resume-build', 'resume-review'].includes(toolKind) && <label className="field wide"><span>Current résumé text (optional)</span><textarea value={toolForm.sourceText} onChange={(event) => setToolForm({ ...toolForm, sourceText: event.target.value })} /></label>}<label className="field wide"><span>Extra direction</span><textarea value={toolForm.prompt} onChange={(event) => setToolForm({ ...toolForm, prompt: event.target.value })} placeholder="Emphasize cross-functional leadership and keep it concise." /></label><label className="field"><span>Tone</span><select value={toolForm.tone} onChange={(event) => setToolForm({ ...toolForm, tone: event.target.value })}><option value="confident">Confident</option><option value="concise">Concise</option><option value="warm">Warm</option><option value="executive">Executive</option></select></label></div><button className="generate-tool" disabled={busy === 'tool'} onClick={() => void generateTool()}>{busy === 'tool' ? 'Generating grounded result…' : `Generate ${careerToolCopy[toolKind]}`} →</button>{toolResult && <article className="tool-result"><header><div><span>Saved artifact</span><h3>{toolResult.title}</h3></div>{toolResult.score != null && <b>{Math.round(toolResult.score)}<small>/100</small></b>}</header>{toolResult.caution && <p className="tool-caution">{toolResult.caution}</p>}<pre>{toolResult.content}</pre>{toolResult.bullets.length > 0 && <div>{toolResult.bullets.map((item) => <p key={item}>✓ {item}</p>)}</div>}<button onClick={() => downloadArtifact(toolResult)}>Download .txt</button></article>}</section></div> : <div className="pipeline-layout"><section className="application-create"><span>Add opportunity</span><h2>Build your pipeline deliberately.</h2><div className="field-grid"><label className="field"><span>Role</span><input value={applicationForm.role} onChange={(event) => setApplicationForm({ ...applicationForm, role: event.target.value })} /></label><label className="field"><span>Company</span><input value={applicationForm.company} onChange={(event) => setApplicationForm({ ...applicationForm, company: event.target.value })} /></label><label className="field wide"><span>Job URL</span><input value={applicationForm.jobUrl} onChange={(event) => setApplicationForm({ ...applicationForm, jobUrl: event.target.value })} placeholder="https://…" /></label><label className="field wide"><span>Job description</span><textarea value={applicationForm.jobDescription} onChange={(event) => setApplicationForm({ ...applicationForm, jobDescription: event.target.value })} /></label></div><button disabled={busy === 'application'} onClick={() => void addApplication()}>{busy === 'application' ? 'Saving…' : 'Save opportunity'}</button></section><section className="application-pipeline"><div className="section-line"><div><span>Pipeline</span><h2>{applications.length} opportunities</h2></div></div>{applications.map((application) => <article key={application.id}><i>{application.company.slice(0, 2).toUpperCase()}</i><span><b>{application.role}</b><small>{application.company} · {application.nextAction ?? 'Review fit and prepare materials'}</small></span><select value={application.status} onChange={(event) => void updateApplication(application.id, event.target.value)}>{applicationStatuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select><button onClick={() => { setToolForm({ ...toolForm, role: application.role, company: application.company, jobDescription: application.jobDescription ?? '' }); setCareerSection('tools'); setToolKind('job-fit'); }}>Prepare</button><button className="danger" onClick={() => void removeApplication(application)}>×</button></article>)}{!applications.length && <EmptyState title="No tracked opportunities" copy="Save a role, then move it through Preparing, Applied, Interviewing, Offer, or Closed." />}</section></div>}</div>}

      {view === 'settings' && <div className="workspace-view settings-view">
        <header className="workspace-title compact-title"><div><span>Settings</span><h1>Make the copilot sound and behave like you.</h1><p>Style can adapt. Factual grounding cannot be weakened by a preference.</p></div></header>
        <div className="settings-layout">
          <nav>
            <button className={settingsSection === 'appearance' ? 'active' : ''} onClick={() => openSettingsSection('appearance')}>Appearance</button>
            <button className={settingsSection === 'style' ? 'active' : ''} onClick={() => openSettingsSection('style')}>Answer style</button>
            <button onClick={() => { setPrepareStep('check'); setView('prepare'); }}>Audio & system check</button>
            <button className={settingsSection === 'providers' ? 'active' : ''} onClick={() => openSettingsSection('providers')}>AI providers</button>
            <button className={settingsSection === 'privacy' ? 'active' : ''} onClick={() => openSettingsSection('privacy')}>Privacy</button>
            <button className={settingsSection === 'shortcuts' ? 'active' : ''} onClick={() => openSettingsSection('shortcuts')}>Shortcuts</button>
          </nav>
          <section className="settings-content">
            {settingsSection === 'appearance' && <article id="settings-appearance" className="appearance-settings">
              <div className="section-line"><div><span>Assistant utility layer</span><h2>Appearance</h2></div><button type="button" className="appearance-reset" onClick={onResetAssistantAppearance}>Reset appearance</button></div>
              <p className="settings-copy">Tune the local assistant surface for your environment. Opacity changes the app UI only; it does not change screen-share behavior.</p>
              <section
                className={`appearance-preview appearance-${assistantPreferences.appearanceMode} assistant-size-${assistantPreferences.assistantSize}`}
                style={{ '--assistant-preview-alpha': String(assistantPreferences.windowOpacity / 100) } as React.CSSProperties}
                aria-label="Live assistant appearance preview"
                aria-live="polite"
              >
                <div className="appearance-preview-surface" aria-hidden="true" />
                <header><i /><span><b>Torvi assistant</b><small>{assistantPreferences.appearanceMode} · {assistantPreferences.windowOpacity}%</small></span><em>Live preview</em></header>
                <div className="appearance-preview-question"><small>Detected question</small><span>How would you explain your approach?</span></div>
                <div className="appearance-preview-answer">
                  <small>Suggested answer</small>
                  {assistantPreferences.responseStyle === 'paragraph'
                    ? <p>I start by clarifying the goal, then break the work into measurable steps and communicate progress as I go.</p>
                    : assistantPreferences.responseStyle === 'bullets'
                      ? <ul><li>Clarify the goal and constraints</li><li>Prioritize measurable next steps</li><li>Communicate progress clearly</li></ul>
                      : <div><b>Adaptive</b><p>Torvi chooses points or a natural paragraph from the question and available space.</p></div>}
                </div>
                <footer><span>Points · Paragraph · Adaptive</span><b>{assistantPreferences.assistantSize}</b></footer>
              </section>
              <div className="appearance-setting-row"><div><b>Theme</b><small>Choose a fixed theme, follow the system, or use a softer glass surface.</small></div><div className="appearance-choice" role="group" aria-label="Assistant theme">{(['dark', 'light', 'adaptive', 'glass'] as AppearanceMode[]).map((item) => <button type="button" key={item} aria-pressed={assistantPreferences.appearanceMode === item} className={assistantPreferences.appearanceMode === item ? 'active' : ''} onClick={() => onAssistantPreferencesChange({ appearanceMode: item })}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div></div>
              <label className="appearance-setting-row appearance-opacity"><div><b>Window opacity</b><small>Never drops below {MIN_ASSISTANT_OPACITY}% so the controls remain recoverable.</small></div><div><input aria-label="Window opacity" type="range" min={MIN_ASSISTANT_OPACITY} max="100" value={assistantPreferences.windowOpacity} onInput={(event) => onAssistantPreferencesChange({ windowOpacity: Number(event.currentTarget.value) })} /><output>{assistantPreferences.windowOpacity}%</output></div></label>
              <div className="appearance-setting-row"><div><b>Assistant size</b><small>Compact for quick prompts, Standard for most calls, Expanded for detailed answers.</small></div><div className="appearance-choice" role="group" aria-label="Assistant size">{(['compact', 'standard', 'expanded'] as AssistantSize[]).map((item) => <button type="button" key={item} aria-pressed={assistantPreferences.assistantSize === item} className={assistantPreferences.assistantSize === item ? 'active' : ''} onClick={() => onAssistantPreferencesChange({ assistantSize: item })}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div></div>
              <div className="appearance-setting-row"><div><b>Quick answer format</b><small>This same control stays available in the live answer area.</small></div><div className="appearance-choice" role="group" aria-label="Answer format">{(['bullets', 'paragraph', 'adaptive'] as const).map((item) => <button type="button" key={item} aria-pressed={assistantPreferences.responseStyle === item} className={assistantPreferences.responseStyle === item ? 'active' : ''} onClick={() => onAssistantPreferencesChange({ responseStyle: item })}>{item === 'bullets' ? 'Points' : item[0].toUpperCase() + item.slice(1)}</button>)}</div></div>
            </article>}
            {settingsSection === 'style' && <article id="settings-style"><div className="section-line"><div><span>Communication profile</span><h2>Answer style</h2></div></div><div className="field-grid"><label className="field"><span>Preferred answer length</span><select value={profile.preferredAnswerLength} onChange={(event) => setProfile({ ...profile, preferredAnswerLength: event.target.value as CommunicationProfile['preferredAnswerLength'] })}><option value="tiny">Very short</option><option value="concise">Concise</option><option value="standard">Standard</option><option value="detailed">Detailed</option></select></label><label className="field"><span>Technical depth</span><select value={profile.technicalDepth} onChange={(event) => setProfile({ ...profile, technicalDepth: event.target.value as CommunicationProfile['technicalDepth'] })}><option value="brief">Brief</option><option value="balanced">Balanced</option><option value="deep">Deep</option></select></label><label className="field"><span>Tone</span><select value={profile.tone} onChange={(event) => setProfile({ ...profile, tone: event.target.value as CommunicationProfile['tone'] })}><option value="conversational">Conversational</option><option value="formal">Formal</option><option value="executive">Executive</option><option value="warm">Warm</option></select></label><label className="field"><span>First-person style</span><select value={profile.firstPersonStyle} onChange={(event) => setProfile({ ...profile, firstPersonStyle: event.target.value as CommunicationProfile['firstPersonStyle'] })}><option value="direct">Direct</option><option value="reflective">Reflective</option><option value="team_forward">Team-forward</option></select></label><label className="field"><span>Presentation</span><select value={profile.bulletPreference} onChange={(event) => setProfile({ ...profile, bulletPreference: event.target.value as CommunicationProfile['bulletPreference'] })}><option value="progressive">Progressive 5 / 20 / 60</option><option value="bullets">Bullets</option><option value="narrative">Narrative</option></select></label><label className="field"><span>Explanation depth</span><select value={profile.explanationDepth} onChange={(event) => setProfile({ ...profile, explanationDepth: event.target.value as CommunicationProfile['explanationDepth'] })}><option value="adaptive">Adaptive</option><option value="short">Short</option><option value="detailed">Detailed</option></select></label><label className="field wide"><span>Natural vocabulary</span><input value={vocabulary} onChange={(event) => setVocabulary(event.target.value)} placeholder="Words or phrases you naturally use, separated by commas" /></label></div><button className="save-settings" disabled={busy === 'profile'} onClick={() => void saveProfile()}>{busy === 'profile' ? 'Saving…' : 'Save answer style'}</button></article>}
            {settingsSection === 'providers' && <article id="settings-providers"><div className="section-line"><div><span>Provider architecture</span><h2>AI providers</h2></div></div><p className="settings-copy">The application uses a provider boundary. OpenAI is enabled for this release; other providers stay visibly disabled until their real credentials, policies, and evals are complete.</p><div className="provider-list">{providers.map((provider) => <div key={provider.id}><StateDot state={provider.enabled ? 'ready' : 'attention'} /><span><b>{provider.label}</b><small>{provider.capabilities.join(' · ')} · {statusLabel(provider.configuration)}</small></span><em>{provider.enabled ? 'Active' : 'Not configured'}</em></div>)}</div>{!providers.length && <EmptyState title="No provider configuration returned" copy="Refresh the workspace after the hosted provider service is available." />}</article>}
            {settingsSection === 'shortcuts' && <article id="settings-shortcuts"><div className="section-line"><div><span>Live keyboard controls</span><h2>Shortcuts</h2></div></div><div className="shortcut-list"><span><b>Start / pause live audio</b><kbd>⌘ ⇧ I</kbd></span><span><b>Ask AI</b><kbd>⌘ ↵</kbd></span><span><b>Show / hide</b><kbd>⌘ ⇧ H</kbd></span><span><b>Focus mode / recover click-through</b><kbd>⌘ ⇧ S</kbd></span><span><b>Decrease / increase opacity</b><kbd>⌘ ⇧ [</kbd><kbd>⌘ ⇧ ]</kbd></span><span><b>Previous / next answer layer</b><kbd>⌥ ←</kbd><kbd>⌥ →</kbd></span><span><b>Quit</b><kbd>⌘ Q</kbd></span></div></article>}
            {settingsSection === 'privacy' && <article id="settings-privacy" className="privacy-settings"><div className="section-line"><div><span>Privacy</span><h2>Retention and visible assistance</h2></div></div><p>Raw audio and transient screen images are never stored. Live transcripts remain ephemeral until you choose Save. Focus Mode is an unobtrusive workspace, not a promise of invisibility or a tool for bypassing proctoring or policy.</p></article>}
          </section>
        </div>
      </div>}
    </div>
  </section>;
}
