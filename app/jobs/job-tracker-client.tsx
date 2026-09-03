'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight, BriefcaseBusiness, LoaderCircle, Plus, ShieldCheck, Trash2 } from 'lucide-react';

type Application = {
  id: string;
  role: string;
  company: string;
  jobUrl: string | null;
  status: string;
  matchScore: number | null;
  notes: string | null;
  nextAction: string | null;
  updatedAt: number;
};

const statuses = ['saved', 'preparing', 'applied', 'interviewing', 'offer', 'closed'];

export function JobTrackerClient() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [role, setRole] = useState('');
  const [company, setCompany] = useState('');
  const [jobUrl, setJobUrl] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function refresh() {
    const response = await fetch('/api/v1/job-applications');
    if (response.ok) {
      const payload = await response.json() as { applications?: Application[] };
      setApplications(payload.applications ?? []);
    }
  }
  useEffect(() => {
    let active = true;
    fetch('/api/v1/job-applications')
      .then(async (response) => response.ok ? await response.json() as { applications?: Application[] } : { applications: [] })
      .then((payload) => { if (active) setApplications(payload.applications ?? []); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  async function add() {
    if (!role.trim() || !company.trim()) return setError('Add both a role and company.');
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/v1/job-applications', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role, company, jobUrl: jobUrl || null, jobDescription: jobDescription || null, status: 'saved' }),
      });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? 'Could not save the opportunity.');
      setRole(''); setCompany(''); setJobUrl(''); setJobDescription('');
      await refresh();
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Could not save the opportunity.'); }
    finally { setBusy(false); }
  }

  async function update(id: string, status: string) {
    await fetch(`/api/v1/job-applications/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }) });
    setApplications((items) => items.map((item) => item.id === id ? { ...item, status } : item));
  }

  async function remove(id: string) {
    await fetch(`/api/v1/job-applications/${id}`, { method: 'DELETE' });
    setApplications((items) => items.filter((item) => item.id !== id));
  }

  return <div className="suite-page">
    <header className="suite-header"><div><span className="section-kicker">Job hunt workspace</span><h1>Apply deliberately, not blindly.</h1><p>Track roles, prepare tailored materials, and decide when anything is submitted. The app never applies externally without your explicit approval.</p></div></header>
    <section className="approval-banner"><ShieldCheck size={20} /><div><b>You stay in control</b><p>Job matching and application drafts can be automated. External submissions always require a clear review-and-approve action.</p></div></section>
    <div className="jobs-layout">
      <section className="job-create"><div className="section-heading"><div><span className="section-kicker">Add opportunity</span><h2>Build your pipeline</h2></div></div><div className="career-fields"><label><span>Role</span><input value={role} onChange={(event) => setRole(event.target.value)} placeholder="Product Manager" /></label><label><span>Company</span><input value={company} onChange={(event) => setCompany(event.target.value)} placeholder="Northstar" /></label><label className="wide"><span>Job URL</span><input value={jobUrl} onChange={(event) => setJobUrl(event.target.value)} placeholder="https://…" /></label><label className="wide"><span>Job description</span><textarea value={jobDescription} onChange={(event) => setJobDescription(event.target.value)} placeholder="Paste the description to prepare fit analysis and tailored materials." /></label></div>{error && <p className="form-error">{error}</p>}<button className="generate-button" onClick={add} disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />}{busy ? 'Saving…' : 'Save opportunity'}</button></section>
      <section className="pipeline"><div className="section-heading"><div><span className="section-kicker">Application pipeline</span><h2>{applications.length} opportunities</h2></div></div>{applications.length ? <div className="application-list">{applications.map((application) => <article key={application.id}><div className="application-main"><div className="job-logo"><BriefcaseBusiness size={17} /></div><div><b>{application.role}</b><span>{application.company}</span></div></div><select value={application.status} onChange={(event) => update(application.id, event.target.value)}>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select><div className="application-actions"><a href={`/tools?role=${encodeURIComponent(application.role)}&company=${encodeURIComponent(application.company)}`}>Prepare <ArrowUpRight size={13} /></a>{application.jobUrl && <a href={application.jobUrl} target="_blank" rel="noreferrer">View role <ArrowUpRight size={13} /></a>}<button aria-label={`Delete ${application.role} at ${application.company}`} onClick={() => remove(application.id)}><Trash2 size={13} /></button></div></article>)}</div> : <div className="empty-state"><BriefcaseBusiness size={24} /><b>No opportunities yet</b><p>Save a target role to start your application workflow.</p></div>}</section>
    </div>
  </div>;
}
