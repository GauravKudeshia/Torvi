'use client';

/* eslint-disable @next/next/no-html-link-for-pages */
import { useState } from 'react';
import { BriefcaseBusiness, Sparkles, UsersRound } from 'lucide-react';

type ProductMode = 'general' | 'meeting' | 'interview';

export function ProductModeSwitch() {
  const [mode, setMode] = useState<ProductMode>(() => {
    if (typeof window === 'undefined') return 'general';
    const saved = localStorage.getItem('ic-product-mode');
    return saved === 'meeting' || saved === 'interview' ? saved : 'general';
  });

  function select(next: ProductMode) {
    localStorage.setItem('ic-product-mode', next);
    setMode(next);
  }

  return (
    <div className="product-mode-bar" aria-label="Assistant operating mode">
      <span>Copilot mode</span>
      <div role="tablist" aria-label="Copilot behavior">
        <a role="tab" aria-selected={mode === 'general'} className={mode === 'general' ? 'active' : ''} href="/session/new?mode=general" onClick={() => select('general')}><Sparkles size={14} />General</a>
        <a role="tab" aria-selected={mode === 'meeting'} className={mode === 'meeting' ? 'active' : ''} href="/session/new?mode=meeting" onClick={() => select('meeting')}><UsersRound size={14} />Meeting</a>
        <a role="tab" aria-selected={mode === 'interview'} className={mode === 'interview' ? 'active' : ''} href="/dashboard" onClick={() => select('interview')}><BriefcaseBusiness size={14} />Interview</a>
      </div>
      <small>{mode === 'general' ? 'Real-time help for any conversation or on-screen task' : mode === 'meeting' ? 'Focused assistance, notes, decisions, and actions' : 'Verified experience for interview preparation and live answers'}</small>
    </div>
  );
}
