/* eslint-disable @next/next/no-html-link-for-pages */
import { BarChart3, BrainCircuit, BriefcaseBusiness, CreditCard, Headphones, History, LayoutDashboard, LibraryBig, Settings, Sparkles } from 'lucide-react';
import { ProductModeSwitch } from './product-mode-switch';

export function AppShell({ children, active = 'dashboard' }: { children: React.ReactNode; active?: string }) {
  const groups = [
    { label: 'Workspace', links: [
      { key: 'dashboard', href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
      { key: 'session', href: '/session/new', label: 'Live assistant', icon: Headphones },
      { key: 'history', href: '/history', label: 'History', icon: History },
    ] },
    { label: 'Prepare', links: [
      { key: 'memory', href: '/memory', label: 'Professional memory', icon: BrainCircuit },
      { key: 'practice', href: '/practice', label: 'Practice', icon: Sparkles },
      { key: 'tools', href: '/tools', label: 'Career tools', icon: LibraryBig },
      { key: 'jobs', href: '/jobs', label: 'Job tracker', icon: BriefcaseBusiness },
      { key: 'reports', href: '/reports', label: 'Reports', icon: BarChart3 },
    ] },
    { label: 'Account', links: [
      { key: 'billing', href: '/pricing', label: 'Billing', icon: CreditCard },
    ] },
  ];
  return (
    <main className="app-layout">
      <aside className="app-sidebar">
        <a className="brand app-brand" href="/"><span className="brand-mark" aria-hidden="true"><span /><span /><span /></span><span>Torvi</span></a>
        <nav>
          {groups.map((group) => <section key={group.label}>
            <span>{group.label}</span>
            {group.links.map(({ key, href, label, icon: Icon }) => (
              <a key={key} href={href} className={active === key ? 'active' : ''}><Icon size={16} />{label}</a>
            ))}
          </section>)}
        </nav>
        <div className="sidebar-bottom">
          <a href="/settings"><Settings size={17} />Settings</a>
          <a className="sidebar-account" href="/settings"><i>TV</i><span><b>Torvi workspace</b><small>Personal</small></span></a>
          <a className="sidebar-signout" href="/api/auth/logout">Sign out</a>
        </div>
      </aside>
      <section className="app-main"><ProductModeSwitch />{children}</section>
    </main>
  );
}
