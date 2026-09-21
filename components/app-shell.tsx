/* eslint-disable @next/next/no-html-link-for-pages */
import { BarChart3, BrainCircuit, BriefcaseBusiness, CreditCard, Headphones, History, LayoutDashboard, LibraryBig, Settings, Sparkles } from 'lucide-react';

export function AppShell({ children, active = 'dashboard' }: { children: React.ReactNode; active?: string }) {
  const groups = [
    { label: 'Workspace', links: [
      { key: 'dashboard', href: '/dashboard', label: 'Home', icon: LayoutDashboard },
      { key: 'session', href: '/session/new', label: 'New session', icon: Headphones },
      { key: 'history', href: '/history', label: 'Sessions', icon: History },
      { key: 'memory', href: '/memory', label: 'Your context', icon: BrainCircuit },
    ] },
    { label: 'Prepare', links: [
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
        <nav aria-label="Main navigation">
          {groups.map((group, index) => {
            const links = group.links.map(({ key, href, label, icon: Icon }) => <a key={key} href={href} aria-label={label} aria-current={active === key ? 'page' : undefined} className={active === key ? 'active' : ''}><Icon size={18} aria-hidden="true" /><span>{label}</span></a>);
            return index === 0 ? <section key={group.label}>{links}</section> : <details key={group.label} open={group.links.some((item) => item.key === active)}><summary>{group.label}</summary>{links}</details>;
          })}
          <a href="/settings" aria-current={active === 'settings' ? 'page' : undefined} className={active === 'settings' ? 'active' : ''}><Settings size={18} aria-hidden="true" /><span>Settings</span></a>
        </nav>
        <details className="mobile-navigation"><summary>Menu</summary><nav aria-label="Mobile navigation">{groups.flatMap((group) => group.links).map(({ key, href, label }) => <a key={key} href={href} aria-current={active === key ? 'page' : undefined}>{label}</a>)}<a href="/settings">Settings</a><a href="/api/auth/logout">Sign out</a></nav></details>
        <div className="sidebar-bottom">
          <a className="sidebar-signout" href="/api/auth/logout">Sign out</a>
        </div>
      </aside>
      <section className="app-main">{children}</section>
    </main>
  );
}
