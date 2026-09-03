import { AppShell } from '@/components/app-shell';
import { JobTrackerClient } from './job-tracker-client';

export default function JobsPage() {
  return <AppShell active="jobs"><JobTrackerClient /></AppShell>;
}
