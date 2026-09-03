import { AppShell } from '@/components/app-shell';
import { HistoryClient } from './history-client';

export default function HistoryPage() {
  return <AppShell active="history"><HistoryClient /></AppShell>;
}
