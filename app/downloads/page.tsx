/* eslint-disable @next/next/no-html-link-for-pages */
import { Apple, MonitorDown, PlayCircle, Smartphone } from 'lucide-react';

const downloads = [
  { icon: Apple, title: 'macOS 13+', copy: 'Apple Silicon internal alpha available to the owner. Intel, Developer ID signing, and notarization remain release gates.', href: process.env.NEXT_PUBLIC_MAC_DOWNLOAD_URL },
  { icon: MonitorDown, title: 'Windows 11', copy: 'x64 installer with WASAPI loopback capture and staged updates.', href: process.env.NEXT_PUBLIC_WINDOWS_DOWNLOAD_URL },
  { icon: Smartphone, title: 'iPhone & iPad', copy: 'Practice, reports, documents, billing, and foreground room coaching.', href: process.env.NEXT_PUBLIC_IOS_DOWNLOAD_URL },
  { icon: PlayCircle, title: 'Android 12+', copy: 'Practice, reports, documents, billing, and foreground room coaching.', href: process.env.NEXT_PUBLIC_ANDROID_DOWNLOAD_URL },
];

export default function DownloadsPage() {
  return <main className="simple-page"><nav className="simple-nav"><a className="brand" href="/"><span className="brand-mark" aria-hidden="true"><span /><span /><span /></span><span>Torvi</span></a><a href="/dashboard">Dashboard</a></nav><header className="simple-hero"><span className="section-kicker">Downloads</span><h1>Your copilot, on every screen.</h1><p>Desktop delivers the full live experience. Mobile is a clear, permission-led companion for practice and foreground room audio.</p></header><section className="download-grid">{downloads.map(({ icon: Icon, title, copy, href }) => <article key={title}><Icon size={27} /><h2>{title}</h2><p>{copy}</p>{href ? <a href={href}>Download beta ↗</a> : <span>Signed beta link pending</span>}</article>)}</section><div className="platform-note"><b>Transparent by design.</b><p>Torvi never promises to be “undetectable.” Screen-share exclusion is best-effort where operating systems support it, and visible permissions are always required.</p></div></main>;
}
