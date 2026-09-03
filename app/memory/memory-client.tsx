'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, ChevronDown, ChevronUp, EyeOff, FileText, LoaderCircle, Pencil, Plus, ShieldCheck, Trash2, X } from 'lucide-react';
import type { ProfessionalClaim, ProfessionalExperience } from '@interview-copilot/contracts';

type MemoryPayload = { experiences: ProfessionalExperience[]; summary: Record<string, number> };

const statusCopy: Record<ProfessionalClaim['verificationStatus'], string> = {
  proposed: 'Needs review', verified: 'Verified', corrected: 'Corrected', rejected: 'Rejected', unsupported: 'Needs evidence',
};

export function MemoryClient() {
  const [payload, setPayload] = useState<MemoryPayload>({ experiences: [], summary: {} });
  const [filter, setFilter] = useState<'all' | ProfessionalClaim['verificationStatus']>('all');
  const [expanded, setExpanded] = useState<string[]>([]);
  const [editing, setEditing] = useState<string>('');
  const [editText, setEditText] = useState('');
  const [busy, setBusy] = useState('loading');
  const [notice, setNotice] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState({ title: '', company: '', role: '', claimText: '' });

  async function refresh() {
    const response = await fetch('/api/v1/memory');
    const next = await response.json() as MemoryPayload & { error?: { message?: string } };
    if (!response.ok) throw new Error(next.error?.message ?? 'Professional Memory could not be loaded.');
    setPayload(next);
  }

  useEffect(() => {
    fetch('/api/v1/memory').then(async (response) => {
      const next = await response.json() as MemoryPayload & { error?: { message?: string } };
      if (!response.ok) throw new Error(next.error?.message ?? 'Professional Memory could not be loaded.');
      setPayload(next);
    }).catch((error) => setNotice(error instanceof Error ? error.message : 'Professional Memory could not be loaded.')).finally(() => setBusy(''));
  }, []);

  const visible = useMemo(() => payload.experiences.map((experience) => ({
    ...experience,
    claims: filter === 'all' ? experience.claims : experience.claims.filter((claim) => claim.verificationStatus === filter),
  })).filter((experience) => experience.claims.length), [filter, payload.experiences]);

  const proposed = payload.experiences.flatMap((experience) => experience.claims).filter((claim) => claim.verificationStatus === 'proposed');
  const lowRisk = proposed.filter((claim) => claim.confidence >= 0.85 && !['metric', 'outcome', 'leadership'].includes(claim.claimType));

  async function act(claim: ProfessionalClaim, action: 'confirm' | 'correct' | 'reject' | 'mark_private', extra: Record<string, unknown> = {}) {
    setBusy(claim.id);
    setNotice('');
    const response = await fetch(`/api/v1/memory/claims/${claim.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...extra }),
    });
    const result = await response.json() as { error?: { message?: string } };
    if (!response.ok) setNotice(result.error?.message ?? 'The claim could not be updated.');
    else {
      setEditing('');
      await refresh();
      setNotice(action === 'confirm' ? 'Claim verified and available for grounded answers.' : 'Professional Memory updated.');
    }
    setBusy('');
  }

  async function confirmLowRisk() {
    if (!lowRisk.length) return;
    setBusy('bulk');
    const responses = await Promise.all(lowRisk.map((claim) => fetch(`/api/v1/memory/claims/${claim.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'confirm' }),
    })));
    if (responses.some((response) => !response.ok)) setNotice('Some claims still need review. Nothing unconfirmed will be used as personal history.');
    else setNotice(`${lowRisk.length} low-risk ${lowRisk.length === 1 ? 'claim was' : 'claims were'} verified.`);
    await refresh();
    setBusy('');
  }

  async function remove(claim: ProfessionalClaim) {
    setBusy(claim.id);
    const response = await fetch(`/api/v1/memory/claims/${claim.id}`, { method: 'DELETE' });
    if (response.ok) { await refresh(); setNotice('Claim permanently removed from Professional Memory.'); }
    else setNotice('The claim could not be deleted.');
    setBusy('');
  }

  async function addManualExperience() {
    if (!manual.title.trim() || !manual.claimText.trim()) return;
    setBusy('manual');
    const response = await fetch('/api/v1/memory', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        title: manual.title, company: manual.company || null, role: manual.role || null,
        claims: [{ claimText: manual.claimText, claimType: 'other', sourceType: 'user_entry' }], confirmAsAccurate: true,
      }),
    });
    if (response.ok) {
      setManual({ title: '', company: '', role: '', claimText: '' });
      setManualOpen(false);
      await refresh();
      setNotice('Your verified experience was added.');
    } else setNotice('The experience could not be added.');
    setBusy('');
  }

  return (
    <div className="memory-page">
      <header className="memory-header">
        <div><span className="section-kicker">Know me</span><h1>Your verified professional memory.</h1><p>Torvi can speak autobiographically only from claims you confirm. Parsed claims, inferences, and meeting memories stay proposed until you approve them.</p></div>
        <button className="pill-button pill-button-small" onClick={() => setManualOpen((current) => !current)}><Plus size={15} />Add real experience</button>
      </header>

      <section className="memory-stats" aria-label="Professional memory summary">
        <article><ShieldCheck size={18} /><div><strong>{(payload.summary.verified ?? 0) + (payload.summary.corrected ?? 0)}</strong><span>Verified claims</span></div></article>
        <article><AlertCircle size={18} /><div><strong>{payload.summary.proposed ?? 0}</strong><span>Need your review</span></div></article>
        <article><FileText size={18} /><div><strong>{payload.experiences.length}</strong><span>Experiences</span></div></article>
      </section>

      {manualOpen && <section className="memory-manual">
        <div><h2>Add a real experience</h2><p>This is immediately verified because you are entering and confirming it yourself.</p></div>
        <div className="memory-manual-grid"><label>Experience or project<input value={manual.title} onChange={(event) => setManual({ ...manual, title: event.target.value })} placeholder="Payments migration" /></label><label>Company<input value={manual.company} onChange={(event) => setManual({ ...manual, company: event.target.value })} placeholder="Acme" /></label><label>Role<input value={manual.role} onChange={(event) => setManual({ ...manual, role: event.target.value })} placeholder="Senior engineer" /></label><label className="wide">Fact you can stand behind<textarea value={manual.claimText} onChange={(event) => setManual({ ...manual, claimText: event.target.value })} placeholder="I designed the idempotency strategy for the migration." /></label></div>
        <div className="memory-manual-actions"><button className="secondary-action" onClick={() => setManualOpen(false)}>Cancel</button><button className="pill-button pill-button-small" disabled={busy === 'manual' || !manual.title.trim() || !manual.claimText.trim()} onClick={addManualExperience}>{busy === 'manual' ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />}Confirm and add</button></div>
      </section>}

      <div className="memory-toolbar">
        <div role="tablist" aria-label="Filter claims">{(['all', 'proposed', 'verified', 'corrected', 'rejected', 'unsupported'] as const).map((status) => <button key={status} className={filter === status ? 'active' : ''} onClick={() => setFilter(status)}>{status === 'all' ? 'All' : statusCopy[status]}</button>)}</div>
        <button className="secondary-action" disabled={!lowRisk.length || busy === 'bulk'} onClick={confirmLowRisk}>{busy === 'bulk' ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />}Confirm {lowRisk.length} low-risk</button>
      </div>

      {notice && <div className="app-notice" role="status">{notice}</div>}
      {busy === 'loading' ? <div className="memory-empty"><LoaderCircle className="spin" size={23} /><b>Loading your professional memory…</b></div> : visible.length ? <section className="experience-list">
        {visible.map((experience) => {
          const open = expanded.includes(experience.id) || visible.length <= 3;
          const verifiedCount = experience.claims.filter((claim) => ['verified', 'corrected'].includes(claim.verificationStatus)).length;
          return <article className="experience-card" key={experience.id}>
            <button className="experience-heading" onClick={() => setExpanded((current) => current.includes(experience.id) ? current.filter((id) => id !== experience.id) : [...current, experience.id])} aria-expanded={open}>
              <span><b>{experience.title}</b><small>{[experience.role, experience.company].filter(Boolean).join(' · ') || 'Imported experience'} · {verifiedCount} verified</small></span>{open ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
            </button>
            {open && <div className="claim-list">{experience.claims.map((claim) => <div className={`claim-card status-${claim.verificationStatus}`} key={claim.id}>
              <div className="claim-main"><span className="claim-status">{statusCopy[claim.verificationStatus]}</span>{editing === claim.id ? <textarea value={editText} onChange={(event) => setEditText(event.target.value)} /> : <b>{claim.claimText}</b>}<small>{claim.claimType.replace('-', ' ')} · {claim.sourceType.replace('_', ' ')}{claim.sensitive ? ' · private' : ''}</small>{claim.sourceExcerpt && <details><summary>Source evidence</summary><p>{claim.sourceExcerpt}</p></details>}</div>
              <div className="claim-actions">
                {editing === claim.id ? <><button title="Save correction" onClick={() => act(claim, 'correct', { claimText: editText })}><Check size={15} /></button><button title="Cancel edit" onClick={() => setEditing('')}><X size={15} /></button></> : <>
                  {!['verified', 'corrected'].includes(claim.verificationStatus) && <button title="Confirm accurate" onClick={() => act(claim, 'confirm')}><Check size={15} /></button>}
                  {!['rejected'].includes(claim.verificationStatus) && <button title="Edit then verify" onClick={() => { setEditing(claim.id); setEditText(claim.claimText); }}><Pencil size={14} /></button>}
                  {claim.verificationStatus !== 'rejected' && <button title="Reject" onClick={() => act(claim, 'reject')}><X size={15} /></button>}
                  <button title={claim.sensitive ? 'Remove private label' : 'Mark private'} onClick={() => act(claim, 'mark_private', { sensitive: !claim.sensitive })}><EyeOff size={14} /></button>
                  <button title="Delete permanently" onClick={() => remove(claim)}><Trash2 size={14} /></button>
                </>}
              </div>
              {busy === claim.id && <LoaderCircle className="claim-spinner spin" size={15} />}
            </div>)}</div>}
          </article>;
        })}
      </section> : <div className="memory-empty"><ShieldCheck size={25} /><b>No claims match this filter.</b><p>Upload a resume or add a real experience. Extracted facts will wait for your review.</p><a href="/onboarding">Upload resume</a></div>}
    </div>
  );
}
