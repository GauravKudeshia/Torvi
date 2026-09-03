/* eslint-disable @next/next/no-html-link-for-pages */
import { AppShell } from '@/components/app-shell';
import { ArrowUpRight, BrainCircuit, Code2, MessageSquareText, Network, Presentation, Sparkles } from 'lucide-react';

const practiceModes = [
  { key: 'mock', title: 'AI mock interview', copy: 'Run a tailored end-to-end interview with live coaching and a saved performance report.', icon: Sparkles },
  { key: 'behavioral', title: 'Behavioral stories', copy: 'Practice concise STAR answers grounded in facts you have verified.', icon: MessageSquareText },
  { key: 'technical', title: 'Technical depth', copy: 'Explain concepts, decisions, and tradeoffs without losing the interviewer.', icon: BrainCircuit },
  { key: 'coding', title: 'Coding copilot', copy: 'Work through approach, complexity, debugging, edge cases, and test design.', icon: Code2 },
  { key: 'system-design', title: 'System design', copy: 'Structure requirements, architecture, bottlenecks, scaling, and tradeoffs.', icon: Network },
  { key: 'case', title: 'Case interview', copy: 'Frame ambiguous problems, state assumptions, show the math, and synthesize.', icon: Presentation },
];

const questionSets = [
  ['Behavioral', 'Tell me about a time you changed your mind after seeing new evidence.', 'behavioral'],
  ['Leadership', 'How have you aligned people who disagreed on priorities?', 'behavioral'],
  ['Product', 'How would you improve activation for a product with strong acquisition but weak retention?', 'case'],
  ['Engineering', 'Design a notification service that supports millions of users.', 'system-design'],
  ['Coding', 'Implement an LRU cache and explain the complexity of each operation.', 'coding'],
  ['Consulting', 'A retailer’s profit is falling despite revenue growth. How would you diagnose it?', 'case'],
];

export default function PracticePage() {
  return <AppShell active="practice"><div className="suite-page">
    <header className="suite-header"><div><span className="section-kicker">Preparation studio</span><h1>Practice until the answer feels like yours.</h1><p>Role-aware drills, full mocks, coding support, and focused feedback in every launch language.</p></div><a className="pill-button pill-button-small" href="/session/new?mode=mock">Start a mock <ArrowUpRight size={16} /></a></header>
    <section className="tool-card-grid">
      {practiceModes.map(({ key, title, copy, icon: Icon }) => <article className="tool-card" key={key}><div className="tool-icon"><Icon size={20} /></div><h2>{title}</h2><p>{copy}</p><a href={`/session/new?mode=${key}`}>Open practice <ArrowUpRight size={14} /></a></article>)}
    </section>
    <section className="question-bank">
      <div className="section-heading"><div><span className="section-kicker">Interview question bank</span><h2>High-signal questions by interview type</h2></div><span>{questionSets.length} starter drills</span></div>
      <div className="question-list">{questionSets.map(([category, question, mode]) => <article key={question}><span>{category}</span><p>{question}</p><a href={`/session/new?mode=${mode}`}>Practice this <ArrowUpRight size={13} /></a></article>)}</div>
    </section>
  </div></AppShell>;
}
