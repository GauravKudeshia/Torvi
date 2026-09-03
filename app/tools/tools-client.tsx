'use client';

import { useEffect, useState } from 'react';
import { ArrowDownToLine, BriefcaseBusiness, CheckCircle2, FileCheck2, FileText, LoaderCircle, Sparkles, Target } from 'lucide-react';
import type { CareerToolKind } from '@interview-copilot/contracts';

type Artifact = {
  id?: string;
  kind?: string;
  title: string;
  content: string;
  bullets: string[];
  keywords: string[];
  score: number | null;
  caution: string | null;
  createdAt?: number;
};

const tools: { key: CareerToolKind; label: string; copy: string; icon: typeof FileText }[] = [
  { key: 'resume-build', label: 'Resume builder', copy: 'Create an ATS-readable draft from verified facts.', icon: FileText },
  { key: 'resume-review', label: 'Resume checker', copy: 'Score clarity, relevance, evidence, and keywords.', icon: FileCheck2 },
  { key: 'cover-letter', label: 'Cover letter', copy: 'Draft a tailored letter without invented claims.', icon: BriefcaseBusiness },
  { key: 'job-fit', label: 'Job fit', copy: 'Map strengths, gaps, and preparation priorities.', icon: Target },
  { key: 'career-plan', label: 'Career coach', copy: 'Turn a goal into a focused weekly action plan.', icon: Sparkles },
];

export function CareerToolsClient() {
  const [kind, setKind] = useState<CareerToolKind>('resume-build');
  const [role, setRole] = useState(() => typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('role') ?? '');
  const [company, setCompany] = useState(() => typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('company') ?? '');
  const [jobDescription, setJobDescription] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [prompt, setPrompt] = useState('');
  const [tone, setTone] = useState('confident');
  const [result, setResult] = useState<Artifact | null>(null);
  const [recent, setRecent] = useState<Artifact[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/v1/tools/generate').then(async (response) => response.ok ? await response.json() as { artifacts?: Artifact[] } : { artifacts: [] })
      .then((payload) => setRecent(payload.artifacts ?? [])).catch(() => undefined);
  }, []);

  async function generate() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/v1/tools/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, locale: 'en', role, company, jobDescription, sourceText, prompt, tone }),
      });
      const payload = await response.json() as Artifact & { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? 'The tool could not generate a result.');
      setResult(payload);
      setRecent((items) => [payload, ...items].slice(0, 8));
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : 'The tool could not generate a result.');
    } finally {
      setBusy(false);
    }
  }

  function download() {
    if (!result) return;
    const blob = new Blob([`${result.title}\n\n${result.content}\n\n${result.bullets.join('\n')}`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${kind}-${Date.now()}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const selected = tools.find((tool) => tool.key === kind)!;
  const SelectedIcon = selected.icon;
  return <div className="suite-page">
    <header className="suite-header"><div><span className="section-kicker">Career toolkit</span><h1>From application to final round.</h1><p>Build tailored materials, check role fit, and get practical coaching using only facts you can stand behind.</p></div></header>
    <div className="career-layout">
      <aside className="tool-selector">{tools.map(({ key, label, copy, icon: Icon }) => <button className={kind === key ? 'active' : ''} key={key} onClick={() => { setKind(key); setResult(null); }}><Icon size={18} /><span><b>{label}</b><small>{copy}</small></span></button>)}</aside>
      <section className="tool-workbench">
        <div className="workbench-title"><div className="tool-icon"><SelectedIcon size={21} /></div><div><span>AI-powered</span><h2>{selected.label}</h2></div></div>
        <div className="career-fields">
          <label><span>Target role</span><input value={role} onChange={(event) => setRole(event.target.value)} placeholder="Senior Product Manager" /></label>
          <label><span>Company</span><input value={company} onChange={(event) => setCompany(event.target.value)} placeholder="Company name" /></label>
          <label className="wide"><span>Job description</span><textarea value={jobDescription} onChange={(event) => setJobDescription(event.target.value)} placeholder="Paste the role description for tailoring and keyword analysis." /></label>
          {(kind === 'resume-review' || kind === 'resume-build') && <label className="wide"><span>Current resume text</span><textarea value={sourceText} onChange={(event) => setSourceText(event.target.value)} placeholder="Paste your current resume or leave blank to build from verified profile facts." /></label>}
          <label className="wide"><span>{kind === 'career-plan' ? 'What outcome are you working toward?' : 'Extra direction'}</span><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Example: emphasize cross-functional leadership and keep the output concise." /></label>
          <label><span>Tone</span><select value={tone} onChange={(event) => setTone(event.target.value)}><option value="confident">Confident</option><option value="concise">Concise</option><option value="warm">Warm</option><option value="executive">Executive</option></select></label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <button className="generate-button" disabled={busy} onClick={generate}>{busy ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}{busy ? 'Generating…' : `Generate ${selected.label.toLowerCase()}`}</button>
      </section>
    </div>
    {result && <section className="artifact-result"><div className="artifact-head"><div><span>Saved to your toolkit</span><h2>{result.title}</h2></div><div>{result.score !== null && <strong>{Math.round(result.score)}<small>/100</small></strong>}<button onClick={download}><ArrowDownToLine size={15} /> Download</button></div></div>{result.caution && <p className="artifact-caution">{result.caution}</p>}<article>{result.content}</article>{result.bullets.length > 0 && <div className="artifact-bullets">{result.bullets.map((bullet) => <span key={bullet}><CheckCircle2 size={14} />{bullet}</span>)}</div>}{result.keywords.length > 0 && <div className="keyword-row">{result.keywords.map((keyword) => <span key={keyword}>{keyword}</span>)}</div>}</section>}
    {recent.length > 0 && <section className="recent-artifacts"><div className="section-heading"><div><span className="section-kicker">Recent work</span><h2>Your saved career artifacts</h2></div></div><div>{recent.slice(0, 6).map((artifact) => <button key={artifact.id ?? artifact.title} onClick={() => setResult(artifact)}><span>{artifact.kind?.replace('-', ' ')}</span><b>{artifact.title}</b><small>{artifact.createdAt ? new Date(artifact.createdAt).toLocaleDateString() : 'Just now'}</small></button>)}</div></section>}
  </div>;
}
