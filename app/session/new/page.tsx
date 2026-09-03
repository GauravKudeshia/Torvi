import { AppShell } from '@/components/app-shell';
import { NewSessionForm } from './session-form';

export default async function NewSessionPage({ searchParams }: { searchParams: Promise<{ mode?: string; source?: string }> }) {
  const { mode, source } = await searchParams;
  return <AppShell active="session"><NewSessionForm initialMode={mode} initialSourceId={source} /></AppShell>;
}
