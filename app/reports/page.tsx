import { AppShell } from '@/components/app-shell';
import { ReportsClient } from './reports-client';

export default function ReportsPage() {
  return <AppShell active="reports"><ReportsClient /></AppShell>;
}
