'use client';

import React from 'react';
import Link from 'next/link';

export function DesktopConnectClient({ initialCode }: { initialCode: string }) {
  const [code, setCode] = React.useState(initialCode);
  const [state, setState] = React.useState<'ready' | 'working' | 'approved' | 'signin' | 'error'>('ready');
  const [message, setMessage] = React.useState('Confirm that you want this Mac to access your Torvi account.');

  async function approve() {
    setState('working');
    const response = await fetch('/api/v1/desktop/authorize/approve', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userCode: code }),
    });
    const payload = await response.json().catch(() => ({})) as { error?: { message?: string } };
    if (response.status === 401) {
      setState('signin');
      setMessage('Sign in to the web account you want to use on this Mac, then return to this page and approve again.');
      return;
    }
    if (!response.ok) {
      setState('error');
      setMessage(payload.error?.message ?? 'This Mac could not be approved.');
      return;
    }
    setState('approved');
    setMessage('Mac approved. Return to Torvi—the app will finish signing in automatically.');
  }

  return <main className="simple-page desktop-connect-page">
    <nav className="simple-nav"><Link className="brand" href="/"><span className="brand-mark" aria-hidden="true"><span /><span /><span /></span><span>Torvi</span></Link></nav>
    <section className="desktop-approval-card">
      <span className="section-kicker">Secure Mac sign-in</span>
      <h1>{state === 'approved' ? 'This Mac is connected' : 'Connect Torvi for Mac'}</h1>
      <p>{message}</p>
      {state !== 'approved' && <><label htmlFor="desktop-code">Code shown in the Mac app</label><input id="desktop-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="ABCD-EFGH" /><button disabled={state === 'working' || code.replace(/[^A-Z0-9]/g, '').length !== 8} onClick={() => void approve()}>{state === 'working' ? 'Approving…' : 'Approve this Mac'}</button></>}
      {state === 'signin' && <a className="secondary-link" href={`/api/auth/login?returnTo=${encodeURIComponent(`/desktop/connect?code=${code}`)}`}>Sign in</a>}
      <small>Approval lasts up to 30 days and can be revoked from account settings. Torvi never stores raw audio.</small>
    </section>
  </main>;
}
